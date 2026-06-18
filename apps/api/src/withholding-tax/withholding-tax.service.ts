import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MfApiService } from '../mf/mf-api.service';
import {
  fiscalMonthToCalendarYear,
  fyStartMonthFromFiscalMonthEnd,
} from '../common/fiscal-period.util';
import {
  buildWithholdingTaxEntries,
  buildWithholdingTaxSummary,
  normalizeMfJournalForWithholding,
} from './withholding-tax-calculator';
import type {
  WithholdingTaxJournalInput,
  WithholdingTaxPreviewResult,
} from './withholding-tax.types';

interface WithholdingTaxPreviewParams {
  fiscalYear?: number;
  month?: number;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class WithholdingTaxService {
  constructor(
    private prisma: PrismaService,
    private mfApi: MfApiService,
  ) {}

  async preview(
    orgId: string,
    params: WithholdingTaxPreviewParams,
  ): Promise<WithholdingTaxPreviewResult> {
    const { fiscalYear, month, startDate, endDate } = params;
    if (
      fiscalYear != null &&
      (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 2100)
    ) {
      throw new BadRequestException('Invalid fiscal year');
    }
    if (month != null && (!Number.isInteger(month) || month < 1 || month > 12)) {
      throw new BadRequestException('Invalid month');
    }

    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { fiscalMonthEnd: true },
    });
    const fyStartMonth = fyStartMonthFromFiscalMonthEnd(org.fiscalMonthEnd);
    const range = buildDateRange({
      fiscalYear,
      fyStartMonth,
      fiscalMonthEnd: org.fiscalMonthEnd,
      month,
      startDate,
      endDate,
    });
    const resultFiscalYear =
      fiscalYear ??
      parseDate(range.endDate)?.getUTCFullYear() ??
      new Date().getUTCFullYear();

    const journalRanges =
      startDate || endDate
        ? await this.buildJournalFetchRanges(orgId, range, org.fiscalMonthEnd)
        : [range];
    const rawJournals: unknown[] = [];
    let truncated = false;
    for (const journalRange of journalRanges) {
      const data = await this.mfApi.getJournals(orgId, {
        startDate: journalRange.startDate,
        endDate: journalRange.endDate,
      });
      if (Array.isArray(data?.journals)) rawJournals.push(...data.journals);
      truncated = truncated || !!data?.truncated;
    }
    const journals = rawJournals
      .map(normalizeMfJournalForWithholding)
      .filter((j): j is WithholdingTaxJournalInput => !!j);
    const entries = buildWithholdingTaxEntries(journals);
    const summary = buildWithholdingTaxSummary(entries);

    return {
      fiscalYear: resultFiscalYear,
      month: month ?? null,
      fyStartMonth,
      range,
      generatedAt: new Date().toISOString(),
      sourceJournalCount: rawJournals.length,
      truncated,
      entries,
      ...summary,
    };
  }

  private async buildJournalFetchRanges(
    orgId: string,
    range: { startDate: string; endDate: string },
    fiscalMonthEnd: number,
  ): Promise<Array<{ startDate: string; endDate: string }>> {
    const office = await this.mfApi.getOffice(orgId).catch(() => null);
    const accountingRanges = Array.isArray(office?.accounting_periods)
      ? office.accounting_periods
          .map((period: { start_date?: string; end_date?: string }) => ({
            startDate: period.start_date,
            endDate: period.end_date,
          }))
          .filter(
            (
              period,
            ): period is {
              startDate: string;
              endDate: string;
            } => !!period.startDate && !!period.endDate,
          )
      : [];
    const intersections = intersectRanges(range, accountingRanges);
    if (intersections.length > 0) return intersections;
    if (accountingRanges.length > 0) return [];
    return splitRangeByFiscalPeriods(range, fiscalMonthEnd);
  }
}

function buildDateRange(params: {
  fiscalYear?: number;
  fyStartMonth: number;
  fiscalMonthEnd: number;
  month?: number;
  startDate?: string;
  endDate?: string;
}): { startDate: string; endDate: string } {
  const { fiscalYear, fyStartMonth, fiscalMonthEnd, month, startDate, endDate } =
    params;

  if (startDate || endDate) {
    if (!startDate || !endDate) {
      throw new BadRequestException('Both startDate and endDate are required');
    }
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (!start || !end) {
      throw new BadRequestException('Invalid date range');
    }
    if (start.getTime() > end.getTime()) {
      throw new BadRequestException('startDate must be before endDate');
    }
    return {
      startDate: formatDate(start),
      endDate: formatDate(end),
    };
  }

  const resolvedFiscalYear = fiscalYear;
  if (
    typeof resolvedFiscalYear !== 'number' ||
    !Number.isInteger(resolvedFiscalYear) ||
    resolvedFiscalYear < 1900 ||
    resolvedFiscalYear > 2100
  ) {
    throw new BadRequestException('Invalid fiscal year');
  }

  if (month != null) {
    const year = fiscalMonthToCalendarYear(
      resolvedFiscalYear,
      month,
      fyStartMonth,
    );
    return {
      startDate: formatDate(new Date(Date.UTC(year, month - 1, 1))),
      endDate: formatDate(new Date(Date.UTC(year, month, 0))),
    };
  }

  const startYear = fiscalMonthToCalendarYear(
    resolvedFiscalYear,
    fyStartMonth,
    fyStartMonth,
  );
  const endYear = fiscalMonthToCalendarYear(
    resolvedFiscalYear,
    fiscalMonthEnd,
    fyStartMonth,
  );
  return {
    startDate: formatDate(new Date(Date.UTC(startYear, fyStartMonth - 1, 1))),
    endDate: formatDate(new Date(Date.UTC(endYear, fiscalMonthEnd, 0))),
  };
}

function parseDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function intersectRanges(
  requested: { startDate: string; endDate: string },
  ranges: Array<{ startDate: string; endDate: string }>,
): Array<{ startDate: string; endDate: string }> {
  return ranges
    .map((range) => ({
      startDate:
        requested.startDate > range.startDate ? requested.startDate : range.startDate,
      endDate: requested.endDate < range.endDate ? requested.endDate : range.endDate,
    }))
    .filter((range) => range.startDate <= range.endDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function splitRangeByFiscalPeriods(
  range: { startDate: string; endDate: string },
  fiscalMonthEnd: number,
): Array<{ startDate: string; endDate: string }> {
  const start = parseDate(range.startDate);
  const end = parseDate(range.endDate);
  if (!start || !end) return [range];

  const results: Array<{ startDate: string; endDate: string }> = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    const fiscalEnd = fiscalPeriodEndFor(cursor, fiscalMonthEnd);
    const segmentEnd = fiscalEnd.getTime() < end.getTime() ? fiscalEnd : end;
    results.push({
      startDate: formatDate(cursor),
      endDate: formatDate(segmentEnd),
    });
    cursor = addUtcDays(segmentEnd, 1);
  }
  return results;
}

function fiscalPeriodEndFor(date: Date, fiscalMonthEnd: number): Date {
  const calendarMonth = date.getUTCMonth() + 1;
  const endYear =
    calendarMonth > fiscalMonthEnd
      ? date.getUTCFullYear() + 1
      : date.getUTCFullYear();
  return new Date(Date.UTC(endYear, fiscalMonthEnd, 0));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days),
  );
}
