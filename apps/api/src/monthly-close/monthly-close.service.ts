import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { MonthlyCloseStatus } from '@prisma/client';

const VALID_STATUSES: MonthlyCloseStatus[] = ['OPEN', 'IN_REVIEW', 'CLOSED'];

@Injectable()
export class MonthlyCloseService {
  constructor(private prisma: PrismaService) {}

  /** 指定会計年度の MonthlyClose を全件返す（フロントの一覧/UI用） */
  async listForFiscalYear(orgId: string, fiscalYear: number) {
    return this.prisma.monthlyClose.findMany({
      where: { orgId, fiscalYear },
      orderBy: { month: 'asc' },
    });
  }

  /** 単月のステータスを取得（無ければ null）。デフォルト month 解決ロジック側でも使う */
  async getOne(orgId: string, fiscalYear: number, month: number) {
    return this.prisma.monthlyClose.findUnique({
      where: { orgId_fiscalYear_month: { orgId, fiscalYear, month } },
    });
  }

  /** ステータス変更 (upsert)。OPEN→IN_REVIEW→CLOSEDの遷移は自由（ユーザー判断） */
  async setStatus(
    orgId: string,
    fiscalYear: number,
    month: number,
    status: MonthlyCloseStatus,
    changedBy?: string,
    note?: string,
  ) {
    if (!VALID_STATUSES.includes(status)) {
      throw new BadRequestException(`Invalid status: ${status}`);
    }
    if (month < 1 || month > 12) {
      throw new BadRequestException('month must be 1-12');
    }
    return this.prisma.monthlyClose.upsert({
      where: { orgId_fiscalYear_month: { orgId, fiscalYear, month } },
      create: {
        orgId,
        fiscalYear,
        month,
        status,
        changedBy: changedBy ?? null,
        note: note ?? null,
      },
      update: {
        status,
        changedAt: new Date(),
        changedBy: changedBy ?? null,
        ...(note !== undefined ? { note } : {}),
      },
    });
  }

  /**
   * 締まっている月（IN_REVIEW or CLOSED）の番号を返す。
   * Burn rate / runway 計算で「実績として信用できる月」のフィルタに使う。
   */
  async getSettledMonths(orgId: string, fiscalYear: number): Promise<number[]> {
    const rows = await this.prisma.monthlyClose.findMany({
      where: {
        orgId,
        fiscalYear,
        status: { in: ['IN_REVIEW', 'CLOSED'] },
      },
      select: { month: true },
      orderBy: { month: 'asc' },
    });
    return rows.map((r) => r.month);
  }

  /**
   * デフォルト表示月の解決:
   * 1. status=IN_REVIEW の最新月（複数あれば最大）
   * 2. なければ status=CLOSED の最新月
   * 3. なければ null（呼び出し側で kintone フォールバックへ）
   */
  async resolveDefaultMonth(orgId: string, fiscalYear: number): Promise<number | null> {
    const inReview = await this.prisma.monthlyClose.findFirst({
      where: { orgId, fiscalYear, status: 'IN_REVIEW' },
      orderBy: { month: 'desc' },
      select: { month: true },
    });
    if (inReview) return inReview.month;
    const closed = await this.prisma.monthlyClose.findFirst({
      where: { orgId, fiscalYear, status: 'CLOSED' },
      orderBy: { month: 'desc' },
      select: { month: true },
    });
    if (closed) return closed.month;
    return null;
  }
}
