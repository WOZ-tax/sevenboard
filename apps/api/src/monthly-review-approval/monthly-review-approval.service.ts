import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
    const row = await this.prisma.monthlyReviewApproval.findUnique({
      where: { orgId_fiscalYear_month: { orgId, fiscalYear, month } },
    });
    return row ? toRecord(row) : null;
  }

  async list(orgId: string, fiscalYear: number): Promise<ApprovalRecord[]> {
    const rows = await this.prisma.monthlyReviewApproval.findMany({
      where: { orgId, fiscalYear },
      orderBy: { month: 'asc' },
    });
    return rows.map(toRecord);
  }

  async submit(orgId: string, fiscalYear: number, month: number, comment?: string): Promise<ApprovalRecord> {
    this.assertMonth(month);
    const row = await this.prisma.monthlyReviewApproval.upsert({
      where: { orgId_fiscalYear_month: { orgId, fiscalYear, month } },
      update: { status: 'PENDING', comment: comment ?? null, approvedBy: null, approvedAt: null },
      create: { orgId, fiscalYear, month, status: 'PENDING', comment: comment ?? null },
    });
    return toRecord(row);
  }

  async approve(orgId: string, fiscalYear: number, month: number, userId: string, comment?: string): Promise<ApprovalRecord> {
    this.assertMonth(month);
    const existing = await this.prisma.monthlyReviewApproval.findUnique({
      where: { orgId_fiscalYear_month: { orgId, fiscalYear, month } },
    });
    if (!existing) {
      const created = await this.prisma.monthlyReviewApproval.create({
        data: {
          orgId,
          fiscalYear,
          month,
          status: 'APPROVED',
          approvedBy: userId,
          approvedAt: new Date(),
          comment: comment ?? null,
        },
      });
      return toRecord(created);
    }
    const updated = await this.prisma.monthlyReviewApproval.update({
      where: { id: existing.id },
      data: {
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
        comment: comment ?? existing.comment,
      },
    });
    return toRecord(updated);
  }

  async reject(orgId: string, fiscalYear: number, month: number, userId: string, comment?: string): Promise<ApprovalRecord> {
    this.assertMonth(month);
    const existing = await this.prisma.monthlyReviewApproval.findUnique({
      where: { orgId_fiscalYear_month: { orgId, fiscalYear, month } },
    });
    if (!existing) {
      throw new NotFoundException('Approval record not found');
    }
    const updated = await this.prisma.monthlyReviewApproval.update({
      where: { id: existing.id },
      data: {
        status: 'REJECTED',
        approvedBy: userId,
        approvedAt: new Date(),
        comment: comment ?? existing.comment,
      },
    });
    return toRecord(updated);
  }

  async reset(orgId: string, fiscalYear: number, month: number): Promise<ApprovalRecord | null> {
    this.assertMonth(month);
    const existing = await this.prisma.monthlyReviewApproval.findUnique({
      where: { orgId_fiscalYear_month: { orgId, fiscalYear, month } },
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
