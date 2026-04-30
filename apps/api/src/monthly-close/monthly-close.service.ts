import { Injectable, BadRequestException } from '@nestjs/common';
import type { MonthlyCloseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const VALID_STATUSES: MonthlyCloseStatus[] = ['OPEN', 'IN_REVIEW', 'CLOSED'];

@Injectable()
export class MonthlyCloseService {
  constructor(private prisma: PrismaService) {}

  async listForFiscalYear(orgId: string, fiscalYear: number) {
    const { tenantId } = await this.prisma.orgScope(orgId);
    return this.prisma.monthlyClose.findMany({
      where: { tenantId, orgId, fiscalYear },
      orderBy: { month: 'asc' },
    });
  }

  async getOne(orgId: string, fiscalYear: number, month: number) {
    const { tenantId } = await this.prisma.orgScope(orgId);
    return this.prisma.monthlyClose.findUnique({
      where: {
        tenantId_orgId_fiscalYear_month: {
          tenantId,
          orgId,
          fiscalYear,
          month,
        },
      },
    });
  }

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

    const { tenantId } = await this.prisma.orgScope(orgId);
    return this.prisma.monthlyClose.upsert({
      where: {
        tenantId_orgId_fiscalYear_month: {
          tenantId,
          orgId,
          fiscalYear,
          month,
        },
      },
      create: {
        tenantId,
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

  async getSettledMonths(
    orgId: string,
    fiscalYear: number,
  ): Promise<number[]> {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const rows = await this.prisma.monthlyClose.findMany({
      where: {
        tenantId,
        orgId,
        fiscalYear,
        status: { in: ['IN_REVIEW', 'CLOSED'] },
      },
      select: { month: true },
      orderBy: { month: 'asc' },
    });
    return rows.map((row) => row.month);
  }

  async resolveDefaultMonth(
    orgId: string,
    fiscalYear: number,
  ): Promise<number | null> {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const inReview = await this.prisma.monthlyClose.findFirst({
      where: { tenantId, orgId, fiscalYear, status: 'IN_REVIEW' },
      orderBy: { month: 'desc' },
      select: { month: true },
    });
    if (inReview) return inReview.month;

    const closed = await this.prisma.monthlyClose.findFirst({
      where: { tenantId, orgId, fiscalYear, status: 'CLOSED' },
      orderBy: { month: 'desc' },
      select: { month: true },
    });
    if (closed) return closed.month;

    return null;
  }
}
