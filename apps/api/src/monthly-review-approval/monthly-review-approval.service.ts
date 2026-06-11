import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type ApprovalStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ApprovalRecord {
  id: string;
  orgId: string;
  fiscalYear: number;
  month: number;
  status: ApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

function toRecord(row: {
  id: string;
  orgId: string;
  fiscalYear: number;
  month: number;
  status: ApprovalStatus;
  approvedBy: string | null;
  approvedAt: Date | null;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ApprovalRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    fiscalYear: row.fiscalYear,
    month: row.month,
    status: row.status,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class MonthlyReviewApprovalService {
  constructor(private prisma: PrismaService) {}

  async get(orgId: string, fiscalYear: number, month: number): Promise<ApprovalRecord | null> {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const row = await this.prisma.monthlyReviewApproval.findUnique({
      where: {
        tenantId_orgId_fiscalYear_month: {
          tenantId,
          orgId,
          fiscalYear,
          month,
        },
      },
    });
    return row ? toRecord(row) : null;
  }

  async list(orgId: string, fiscalYear: number): Promise<ApprovalRecord[]> {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const rows = await this.prisma.monthlyReviewApproval.findMany({
      where: { tenantId, orgId, fiscalYear },
      orderBy: { month: 'asc' },
    });
    return rows.map(toRecord);
  }

  /**
   * レビュー提出 (→ PENDING)。
   * 許可遷移: レコード未存在 / DRAFT / REJECTED / PENDING(再提出) → PENDING。
   * APPROVED 済みを submit で PENDING に降格させる経路は禁止する
   * (承認後にやり直す場合は reset を明示的に呼ぶ)。
   */
  async submit(orgId: string, fiscalYear: number, month: number, comment?: string): Promise<ApprovalRecord> {
    this.assertMonth(month);
    const { tenantId } = await this.prisma.orgScope(orgId);
    const where = {
      tenantId_orgId_fiscalYear_month: { tenantId, orgId, fiscalYear, month },
    };

    const existing = await this.prisma.monthlyReviewApproval.findUnique({ where });
    if (existing && existing.status === 'APPROVED') {
      throw new ConflictException(
        '承認済みのため再提出できません。やり直す場合は reset してください',
      );
    }
    if (!existing) {
      try {
        const created = await this.prisma.monthlyReviewApproval.create({
          data: { tenantId, orgId, fiscalYear, month, status: 'PENDING', comment: comment ?? null },
        });
        return toRecord(created);
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          // 同時 submit による作成競合 -> 既存行を PENDING へ遷移させる経路に合流
          throw new ConflictException('同時更新が発生しました。再実行してください');
        }
        throw e;
      }
    }
    // DRAFT / REJECTED / PENDING からのみ PENDING へ。APPROVED への変化中の競合も塞ぐ。
    const result = await this.prisma.monthlyReviewApproval.updateMany({
      where: {
        tenantId,
        orgId,
        fiscalYear,
        month,
        status: { in: ['DRAFT', 'PENDING', 'REJECTED'] },
      },
      data: { status: 'PENDING', comment: comment ?? null, approvedBy: null, approvedAt: null },
    });
    if (result.count === 0) {
      throw new ConflictException(
        'この状態からは提出できません（承認済みの可能性があります）',
      );
    }
    return (await this.get(orgId, fiscalYear, month))!;
  }

  /**
   * 承認 (→ APPROVED)。許可遷移: PENDING → APPROVED のみ。
   * レコード未存在の即時承認 (submit を飛ばした承認) は禁止する。
   * updateMany({where:{status:'PENDING'}}) の count で不正遷移と競合を同時に塞ぐ。
   */
  async approve(orgId: string, fiscalYear: number, month: number, userId: string, comment?: string): Promise<ApprovalRecord> {
    this.assertMonth(month);
    const { tenantId } = await this.prisma.orgScope(orgId);
    const existing = await this.prisma.monthlyReviewApproval.findUnique({
      where: {
        tenantId_orgId_fiscalYear_month: { tenantId, orgId, fiscalYear, month },
      },
    });
    if (!existing) {
      throw new BadRequestException(
        '提出されていないため承認できません（先に submit が必要です）',
      );
    }
    const result = await this.prisma.monthlyReviewApproval.updateMany({
      where: { tenantId, orgId, fiscalYear, month, status: 'PENDING' },
      data: {
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
        ...(comment !== undefined ? { comment } : {}),
      },
    });
    if (result.count === 0) {
      throw new ConflictException(
        'PENDING 状態のレビューのみ承認できます（既に承認/却下済みの可能性があります）',
      );
    }
    return (await this.get(orgId, fiscalYear, month))!;
  }

  /**
   * 却下 (→ REJECTED)。許可遷移: PENDING → REJECTED のみ。
   * レコード未存在 / DRAFT / APPROVED の却下は禁止 (再判定は reset 経由)。
   */
  async reject(orgId: string, fiscalYear: number, month: number, userId: string, comment?: string): Promise<ApprovalRecord> {
    this.assertMonth(month);
    const { tenantId } = await this.prisma.orgScope(orgId);
    const existing = await this.prisma.monthlyReviewApproval.findUnique({
      where: {
        tenantId_orgId_fiscalYear_month: { tenantId, orgId, fiscalYear, month },
      },
    });
    if (!existing) {
      throw new NotFoundException('Approval record not found');
    }
    const result = await this.prisma.monthlyReviewApproval.updateMany({
      where: { tenantId, orgId, fiscalYear, month, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        approvedBy: userId,
        approvedAt: new Date(),
        ...(comment !== undefined ? { comment } : {}),
      },
    });
    if (result.count === 0) {
      throw new ConflictException(
        'PENDING 状態のレビューのみ却下できます（既に承認/却下済みの可能性があります）',
      );
    }
    return (await this.get(orgId, fiscalYear, month))!;
  }

  async reset(orgId: string, fiscalYear: number, month: number): Promise<ApprovalRecord | null> {
    this.assertMonth(month);
    const { tenantId } = await this.prisma.orgScope(orgId);
    const existing = await this.prisma.monthlyReviewApproval.findUnique({
      where: {
        tenantId_orgId_fiscalYear_month: {
          tenantId,
          orgId,
          fiscalYear,
          month,
        },
      },
    });
    if (!existing) return null;
    const updated = await this.prisma.monthlyReviewApproval.update({
      where: { id: existing.id },
      data: { status: 'DRAFT', approvedBy: null, approvedAt: null },
    });
    return toRecord(updated);
  }

  private assertMonth(month: number) {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('month must be between 1 and 12');
    }
  }
}
