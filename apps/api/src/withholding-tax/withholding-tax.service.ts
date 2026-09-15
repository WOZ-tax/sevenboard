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
  WithholdingTaxReviewResult,
} from './withholding-tax.types';
import {
  buildWithholdingTaxReview,
  withholdingReviewDefaultCheckDate,
  withholdingReviewPeriod,
} from './withholding-tax-review';

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

  async review(
    orgId: string,
    params: { year: number; half: number; checkDate?: string },
  ): Promise<WithholdingTaxReviewResult> {
    const { year, half } = params;
    if (
      !Number.isInteger(year) ||
      year < 1900 ||
      year > 2100 ||
      (half !== 1 && half !== 2)
    ) {
      throw new BadRequestException('集計年・半期を確認してください。');
    }
    const period = withholdingReviewPeriod(year, half);
    const checkDate =
      params.checkDate ?? withholdingReviewDefaultCheckDate(year, half);
    const latestCheckDate = half === 1 ? `${year}-12-31` : `${year + 1}-06-30`;
    if (
      !parseDate(checkDate) ||
      checkDate <= period.endDate ||
      checkDate > latestCheckDate
    ) {
      throw new BadRequestException(
        '確認日は半期終了後の6か月以内で指定してください。',
      );
    }
    // MFの取引日は日本の日付。UTC日付への切り替わりで翌日仕訳を先取りしない。
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    if (today <= period.endDate) {
      return buildWithholdingTaxReview({
        year,
        half,
        checkDate,
        today,
        journals: [],
        trialBalance: null,
        coverage: { ranges: [], complete: false, truncated: false },
      });
    }

    const office = await this.mfApi.getOffice(orgId);
    const accountingPeriods = (office.accounting_periods ?? []).filter(
      (row) =>
        Number.isInteger(row.fiscal_year) &&
        !!parseDate(row.start_date) &&
        !!parseDate(row.end_date) &&
        row.start_date <= row.end_date,
    );
    // 直前月の未払計上が半期の初月支払に繰り越されるため、1か月広く読む。
    const requested = {
      startDate: half === 1 ? `${year - 1}-12-01` : `${year}-06-01`,
      endDate: checkDate < today ? checkDate : today,
    };
    const intersections = intersectRanges(
      requested,
      accountingPeriods.map((row) => ({
        startDate: row.start_date,
        endDate: row.end_date,
      })),
    );
    const ranges: Array<{ startDate: string; endDate: string }> = [];
    const journalsById = new Map<string, WithholdingTaxJournalInput>();
    const issues: string[] = [];
    let truncated = false;
    let malformed = false;
    let lastEnd: string | null = null;
    for (const intersection of intersections) {
      // 会計期間が重複して返っても、同じ日付範囲を繰り返し集計しない。
      const startDate =
        lastEnd && lastEnd >= intersection.startDate
          ? formatDate(addUtcDays(parseDate(lastEnd)!, 1))
          : intersection.startDate;
      if (startDate > intersection.endDate) continue;
      const range = { startDate, endDate: intersection.endDate };
      lastEnd = range.endDate;
      try {
        const data = await this.mfApi.getJournals(orgId, range);
        truncated ||= !!data?.truncated;
        if (!Array.isArray(data?.journals)) {
          malformed = true;
          continue;
        }
        ranges.push(range);
        for (const raw of data.journals as unknown[]) {
          const journal =
            raw && typeof raw === 'object'
              ? normalizeMfJournalForWithholding(raw)
              : null;
          if (!journal || !journal.date || !parseDate(journal.date)) {
            malformed = true;
            continue;
          }
          if (
            journal.date < requested.startDate ||
            journal.date > requested.endDate
          )
            continue;
          const branches = (raw as { branches?: unknown }).branches;
          if (
            !Array.isArray(branches) ||
            branches.length === 0 ||
            branches.some(
              (branch) =>
                !branch ||
                ['debitor', 'creditor'].some((key) => {
                  const side = (
                    branch as Record<
                      string,
                      Record<string, unknown> | undefined
                    >
                  )[key];
                  return (
                    side &&
                    (!Number.isSafeInteger(Number(side.value ?? side.amount)) ||
                      !Number.isSafeInteger(Number(side.tax_value ?? 0)) ||
                      typeof side.account_name !== 'string' ||
                      !side.account_name.trim())
                  );
                }),
            )
          )
            malformed = true;
          if (
            (!journal.debits.length && !journal.credits.length) ||
            // 税抜経理ではvalueと消費税tax_valueが分離される。
            // 本体だけを比較すると正常な課税仕訳も貸借不一致になる。
            (Array.isArray(branches) &&
              grossJournalTotal(branches, 'debitor') !==
                grossJournalTotal(branches, 'creditor'))
          )
            malformed = true;
          const previous = journalsById.get(journal.id);
          if (previous && JSON.stringify(previous) !== JSON.stringify(journal))
            malformed = true;
          journalsById.set(journal.id, journal);
        }
      } catch {
        issues.push(
          '一部期間の仕訳を取得できませんでした。MF再取得で再確認してください。',
        );
      }
    }
    if (malformed)
      issues.push(
        '日付・金額・識別情報を確認できない仕訳、または重複に不整合がある仕訳があります。',
      );
    const endPeriods = accountingPeriods.filter(
      (row) =>
        row.start_date <= period.endDate && row.end_date >= period.endDate,
    );
    // MFが返した fiscal_year を使う。会計年度の開始年／終了年を推測しない。
    const trialBalance =
      endPeriods.length === 1
        ? await this.mfApi
            .getTrialBalanceBS(
              orgId,
              endPeriods[0].fiscal_year,
              half === 1 ? 6 : 12,
              { withSubAccounts: true },
            )
            .catch(() => null)
        : null;
    const openingDate = formatDate(
      addUtcDays(parseDate(period.startDate)!, -1),
    );
    const openingPeriods = accountingPeriods.filter(
      (row) => row.start_date <= openingDate && row.end_date >= openingDate,
    );
    const openingTrialBalance =
      trialBalance?.start_date !== period.startDate &&
      openingPeriods.length === 1
        ? await this.mfApi
            .getTrialBalanceBS(
              orgId,
              openingPeriods[0].fiscal_year,
              half === 1 ? 12 : 6,
              { withSubAccounts: true },
            )
            .catch(() => null)
        : null;
    return buildWithholdingTaxReview({
      year,
      half,
      checkDate,
      today,
      journals: [...journalsById.values()],
      trialBalance,
      openingTrialBalance,
      issues,
      coverage: {
        ranges,
        complete: !malformed && coversRange(requested, ranges),
        truncated,
      },
    });
  }

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
    if (
      month != null &&
      (!Number.isInteger(month) || month < 1 || month > 12)
    ) {
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

    // レビューと同じ支払月で集計する。前月未払を読み込み、
    // 選択期間外の翌月支払分を主集計にも混ぜない。
    const start = parseDate(range.startDate)!;
    const fetchRange = {
      ...range,
      startDate: formatDate(
        new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1)),
      ),
    };
    const journalRanges = await this.buildJournalFetchRanges(
      orgId,
      fetchRange,
      org.fiscalMonthEnd,
    );
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
    const normalized = rawJournals
      .map(normalizeMfJournalForWithholding)
      .filter((j): j is WithholdingTaxJournalInput => !!j);
    const journals = [
      ...new Map(normalized.map((journal) => [journal.id, journal])).values(),
    ];
    const entries = buildWithholdingTaxEntries(journals).filter(
      (entry) =>
        entry.paymentDate != null &&
        entry.paymentDate >= range.startDate &&
        entry.paymentDate <= range.endDate,
    );
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
  const {
    fiscalYear,
    fyStartMonth,
    fiscalMonthEnd,
    month,
    startDate,
    endDate,
  } = params;

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
        requested.startDate > range.startDate
          ? requested.startDate
          : range.startDate,
      endDate:
        requested.endDate < range.endDate ? requested.endDate : range.endDate,
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
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
    ),
  );
}

function coversRange(
  requested: { startDate: string; endDate: string },
  ranges: Array<{ startDate: string; endDate: string }>,
): boolean {
  let cursor = requested.startDate;
  for (const range of ranges) {
    if (range.startDate > cursor) return false;
    if (range.endDate >= cursor)
      cursor = formatDate(addUtcDays(parseDate(range.endDate)!, 1));
  }
  return cursor > requested.endDate;
}

function grossJournalTotal(
  branches: unknown[],
  key: 'debitor' | 'creditor',
): number {
  return branches.reduce<number>((sum, branch) => {
    const side = (
      branch as Record<string, Record<string, unknown> | null> | null
    )?.[key];
    return (
      sum +
      (side
        ? Number(side.value ?? side.amount ?? 0) + Number(side.tax_value ?? 0)
        : 0)
    );
  }, 0);
}
