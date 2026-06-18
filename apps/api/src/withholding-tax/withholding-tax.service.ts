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

    const data = await this.mfApi.getJournals(orgId, {
      startDate: range.startDate,
      endDate: range.endDate,
    });
    const rawJournals = Array.isArray(data?.journals) ? data.journals : [];
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
      truncated: !!data?.truncated,
      entries,
      ...summary,
    };
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
