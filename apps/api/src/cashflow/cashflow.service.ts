import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCashflowCategoryDto } from './dto/create-cashflow-category.dto';

// Finite sentinel used when runway is effectively infinite (no cash burn).
// JSON has no Infinity (it serializes to null, which collides with "no data"),
// so callers treat >= this value as "infinite" — matching the frontend's
// existing `>= 999` convention.
const RUNWAY_INFINITE_MONTHS = 999;

@Injectable()
export class CashflowService {
  constructor(private prisma: PrismaService) {}

  async getActualCashflow(
    orgId: string,
    query: { startDate?: string; endDate?: string },
  ) {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const where: any = { tenantId, orgId, isActual: true };
    if (query.startDate) {
      where.entryDate = { ...(where.entryDate || {}), gte: new Date(query.startDate) };
    }
    if (query.endDate) {
      where.entryDate = { ...(where.entryDate || {}), lte: new Date(query.endDate) };
    }

    const entries = await this.prisma.cashFlowEntry.findMany({
      where,
      include: {
        category: true,
      },
      orderBy: { entryDate: 'asc' },
    });

    return entries;
  }

  async getRunway(orgId: string) {
    const { tenantId } = await this.prisma.orgScope(orgId);
    // Get the latest runway snapshot
    const latestSnapshot = await this.prisma.runwaySnapshot.findFirst({
      where: { tenantId, orgId },
      orderBy: { snapshotDate: 'desc' },
    });

    if (latestSnapshot) {
      return {
        snapshotDate: latestSnapshot.snapshotDate,
        cashBalance: Number(latestSnapshot.cashBalance),
        monthlyBurnRate: Number(latestSnapshot.monthlyBurnRate),
        runwayMonths: latestSnapshot.runwayMonths,
        alertLevel: latestSnapshot.alertLevel,
      };
    }

    // Calculate from cash flow entries if no snapshot exists
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const recentEntries = await this.prisma.cashFlowEntry.findMany({
      where: {
        tenantId,
        orgId,
        isActual: true,
        entryDate: { gte: threeMonthsAgo },
      },
      include: { category: true },
    });

    // Sum inflows and outflows, and track distinct months actually spanned
    let totalInflow = 0;
    let totalOutflow = 0;
    const monthsSpanned = new Set<string>();
    for (const entry of recentEntries) {
      const amt = Number(entry.amount);
      if (entry.category.direction === 'IN') {
        totalInflow += amt;
      } else {
        totalOutflow += amt;
      }
      const d = new Date(entry.entryDate);
      monthsSpanned.add(`${d.getFullYear()}-${d.getMonth()}`);
    }
    // Use the number of distinct year-months the entries actually cover (min 1)
    // so that less than 3 months of data does not understate the burn rate.
    const monthsCount = Math.max(monthsSpanned.size, 1);

    // Get current cash balance from the latest forecast or entries
    const latestForecast = await this.prisma.cashFlowForecast.findFirst({
      where: { tenantId, orgId },
      orderBy: { forecastDate: 'desc' },
    });

    const cashBalance = latestForecast
      ? Number(latestForecast.closingBalance)
      : 0;

    const monthlyBurnRate = (totalOutflow - totalInflow) / monthsCount;
    // burn <= 0 means the org is not burning cash → runway is effectively infinite.
    // JSON cannot represent Infinity (it serializes to null, indistinguishable from
    // "no data"), so we cap at a finite sentinel and expose an explicit flag.
    const isInfinite = monthlyBurnRate <= 0;
    const runwayMonths = isInfinite
      ? RUNWAY_INFINITE_MONTHS
      : Math.round((cashBalance / monthlyBurnRate) * 10) / 10;

    let alertLevel: string;
    if (runwayMonths >= 12) alertLevel = 'SAFE';
    else if (runwayMonths >= 6) alertLevel = 'CAUTION';
    else if (runwayMonths >= 3) alertLevel = 'WARNING';
    else alertLevel = 'CRITICAL';

    return {
      snapshotDate: now,
      cashBalance,
      monthlyBurnRate: Math.round(monthlyBurnRate),
      runwayMonths,
      runwayInfinite: isInfinite,
      alertLevel,
    };
  }

  async getCategories(orgId: string) {
    const { tenantId } = await this.prisma.orgScope(orgId);
    return this.prisma.cashFlowCategory.findMany({
      where: { tenantId, orgId },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async createCategory(orgId: string, dto: CreateCashflowCategoryDto) {
    const { tenantId } = await this.prisma.orgScope(orgId);
    return this.prisma.cashFlowCategory.create({
      data: {
        tenantId,
        orgId,
        name: dto.name,
        direction: dto.direction,
        cfType: dto.cfType,
        isFixed: dto.isFixed || false,
        recurrenceRule: dto.recurrenceRule || null,
        displayOrder: dto.displayOrder || 0,
      },
    });
  }
}
