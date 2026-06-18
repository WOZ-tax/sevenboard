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

@Injectable()
export class WithholdingTaxService {
  constructor(
    private prisma: PrismaService,
    private mfApi: MfApiService,
  ) {}

  async preview(
    orgId: string,
    fiscalYear: number,
    month?: number,
  ): Promise<WithholdingTaxPreviewResult> {
    if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 2100) {
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
    const range = buildDateRange(fiscalYear, fyStartMonth, org.fiscalMonthEnd, month);

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
      fiscalYear,
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

function buildDateRange(
  fiscalYear: number,
  fyStartMonth: number,
  fiscalMonthEnd: number,
  month?: number,
): { startDate: string; endDate: string } {
  if (month != null) {
    const year = fiscalMonthToCalendarYear(fiscalYear, month, fyStartMonth);
    return {
      startDate: formatDate(new Date(Date.UTC(year, month - 1, 1))),
      endDate: formatDate(new Date(Date.UTC(year, month, 0))),
    };
  }

  const startYear = fiscalMonthToCalendarYear(fiscalYear, fyStartMonth, fyStartMonth);
  const endYear = fiscalMonthToCalendarYear(fiscalYear, fiscalMonthEnd, fyStartMonth);
  return {
    startDate: formatDate(new Date(Date.UTC(startYear, fyStartMonth - 1, 1))),
    endDate: formatDate(new Date(Date.UTC(endYear, fiscalMonthEnd, 0))),
  };
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
