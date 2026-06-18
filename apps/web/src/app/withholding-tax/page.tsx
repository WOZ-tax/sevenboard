"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  FileText,
  ListChecks,
  Receipt,
  RefreshCw,
  Users,
} from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCurrentOrg } from "@/contexts/current-org";
import { useScopedOrgId } from "@/hooks/use-scoped-org-id";
import { useMfOffice } from "@/hooks/use-mf-data";
import { api } from "@/lib/api";
import type {
  WithholdingTaxEntry,
  WithholdingTaxMonthlySummaryRow,
  WithholdingTaxPaymentStatementRow,
  WithholdingTaxPreviewResult,
  WithholdingTaxSummaryRow,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export default function WithholdingTaxPage() {
  const { currentOrg } = useCurrentOrg();
  const orgId = useScopedOrgId();
  const office = useMfOffice();
  const initialYear = new Date().getFullYear();
  const initializedFromOffice = useRef(false);
  const [periodYear, setPeriodYear] = useState(initialYear);
  const [dateRange, setDateRange] = useState(() => calendarYearRange(initialYear));
  const officeDefaultYear = office.data?.accounting_periods?.[0]?.fiscal_year;
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const period of office.data?.accounting_periods ?? []) {
      if (Number.isInteger(period.fiscal_year)) years.add(period.fiscal_year);
    }
    years.add(new Date().getFullYear());
    years.add(new Date().getFullYear() - 1);
    return Array.from(years).sort((a, b) => b - a);
  }, [office.data?.accounting_periods]);
  const isRangeValid =
    isDateInput(dateRange.startDate) &&
    isDateInput(dateRange.endDate) &&
    dateRange.startDate <= dateRange.endDate;
  const periodLabel = `${dateRange.startDate} - ${dateRange.endDate}`;

  useEffect(() => {
    const firstYear = officeDefaultYear ?? availableYears[0];
    if (initializedFromOffice.current || firstYear == null) return;
    initializedFromOffice.current = true;
    setPeriodYear(firstYear);
    setDateRange(calendarYearRange(firstYear));
  }, [availableYears, officeDefaultYear]);

  const previewQuery = useQuery<WithholdingTaxPreviewResult>({
    queryKey: [
      "withholding-tax",
      "preview",
      orgId,
      dateRange.startDate,
      dateRange.endDate,
    ],
    queryFn: () =>
      api.withholdingTax.preview(orgId, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      }),
    enabled: !!orgId && isRangeValid,
    staleTime: 5 * 60 * 1000,
  });

  const warningEntries = useMemo(
    () => (previewQuery.data?.entries ?? []).filter((entry) => entry.warnings.length > 0),
    [previewQuery.data?.entries],
  );

  if (!currentOrg) {
    return (
      <DashboardShell>
        <div className="mx-auto max-w-[1200px] p-6">
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              顧問先を選択してください。
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-[1280px] space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--color-text-primary)]">
              <Receipt className="h-6 w-6 text-[var(--color-primary)]" />
              源泉所得税集計
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">{currentOrg.orgName}</Badge>
              <Badge variant="outline">{periodLabel}</Badge>
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                プレビュー
              </Badge>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => previewQuery.refetch()}
            disabled={previewQuery.isFetching || !isRangeValid}
            className="gap-1.5"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", previewQuery.isFetching && "animate-spin")}
            />
            MF再取得
          </Button>
        </div>

        <DateRangeControl
          availableYears={availableYears}
          periodYear={periodYear}
          startDate={dateRange.startDate}
          endDate={dateRange.endDate}
          isRangeValid={isRangeValid}
          onYearChange={(year) => {
            setPeriodYear(year);
            setDateRange(calendarYearRange(year));
          }}
          onRangeChange={setDateRange}
        />

        {previewQuery.isError ? (
          <Card>
            <CardContent className="flex items-start gap-3 p-6 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <div className="font-semibold text-[var(--color-text-primary)]">
                  源泉集計プレビューを取得できませんでした。
                </div>
                <div className="mt-1 text-muted-foreground">
                  {(previewQuery.error as Error).message}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <SummaryCards data={previewQuery.data} isLoading={previewQuery.isLoading} />
            <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
              <CategorySummaryTable rows={previewQuery.data?.categorySummary ?? []} />
              <MonthlySummaryTable rows={previewQuery.data?.monthlySummary ?? []} />
            </div>
            <PaymentStatementTable rows={previewQuery.data?.paymentStatements ?? []} />
            {warningEntries.length > 0 && <WarningList entries={warningEntries} />}
            <EntryTable entries={previewQuery.data?.entries ?? []} />
            {previewQuery.data && (
              <div className="text-right text-[11px] text-muted-foreground">
                対象仕訳 {previewQuery.data.sourceJournalCount.toLocaleString("ja-JP")} 件 /
                取得範囲 {previewQuery.data.range.startDate}〜{previewQuery.data.range.endDate}
                {previewQuery.data.truncated ? " / MF取得上限で打ち切りあり" : ""}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}

interface DateRangeValue {
  startDate: string;
  endDate: string;
}

function DateRangeControl({
  availableYears,
  periodYear,
  startDate,
  endDate,
  isRangeValid,
  onYearChange,
  onRangeChange,
}: {
  availableYears: number[];
  periodYear: number;
  startDate: string;
  endDate: string;
  isRangeValid: boolean;
  onYearChange: (year: number) => void;
  onRangeChange: (range: DateRangeValue) => void;
}) {
  const setPreset = (preset: "year" | "h1" | "h2") => {
    const range =
      preset === "h1"
        ? { startDate: `${periodYear}-01-01`, endDate: `${periodYear}-06-30` }
        : preset === "h2"
          ? { startDate: `${periodYear}-07-01`, endDate: `${periodYear}-12-31` }
          : calendarYearRange(periodYear);
    onRangeChange(range);
  };

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-muted-foreground">
            集計年
          </label>
          <select
            value={periodYear}
            onChange={(event) => onYearChange(Number(event.target.value))}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}年
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-muted-foreground">
            開始日
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(event) =>
              onRangeChange({ startDate: event.target.value, endDate })
            }
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-muted-foreground">
            終了日
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(event) =>
              onRangeChange({ startDate, endDate: event.target.value })
            }
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setPreset("year")}>
            通年
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setPreset("h1")}>
            1-6月
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setPreset("h2")}>
            7-12月
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          <span className={cn(!isRangeValid && "text-destructive")}>
            {isRangeValid ? `${startDate} - ${endDate}` : "期間を確認してください"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCards({
  data,
  isLoading,
}: {
  data: WithholdingTaxPreviewResult | undefined;
  isLoading: boolean;
}) {
  const cards = [
    {
      label: "源泉税額",
      value: yen(data?.totals.withholdingTax),
      icon: Receipt,
      tone: "text-[var(--color-primary)]",
    },
    {
      label: "支払金額",
      value: yen(data?.totals.paymentAmount),
      icon: FileText,
      tone: "text-[var(--color-text-primary)]",
    },
    {
      label: "対象件数",
      value: data ? `${data.totals.count.toLocaleString("ja-JP")} 件` : "--",
      icon: ListChecks,
      tone: "text-[var(--color-text-primary)]",
    },
    {
      label: "支払先数",
      value: data ? `${data.totals.payeeCount.toLocaleString("ja-JP")} 名` : "--",
      icon: Users,
      tone: "text-[var(--color-text-primary)]",
    },
    {
      label: "要確認",
      value: data ? `${data.totals.warningCount.toLocaleString("ja-JP")} 件` : "--",
      icon: AlertTriangle,
      tone: data?.totals.warningCount ? "text-amber-700" : "text-[var(--color-text-primary)]",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <div className="text-[11px] font-medium text-muted-foreground">
                  {card.label}
                </div>
                <div className={cn("mt-1 text-xl font-bold tabular-nums", card.tone)}>
                  {isLoading ? "--" : card.value}
                </div>
              </div>
              <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function CategorySummaryTable({ rows }: { rows: WithholdingTaxSummaryRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">区分別集計</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-2 text-left font-medium">区分</th>
                <th className="py-2 text-right font-medium">件数</th>
                <th className="py-2 text-right font-medium">支払先</th>
                <th className="py-2 text-right font-medium">支払金額</th>
                <th className="py-2 text-right font-medium">源泉税額</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    対象データがありません。
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.category} className="border-b last:border-b-0">
                    <td className="py-2 font-medium">{row.categoryLabel}</td>
                    <td className="py-2 text-right tabular-nums">{num(row.count)}</td>
                    <td className="py-2 text-right tabular-nums">{num(row.payeeCount)}</td>
                    <td className="py-2 text-right tabular-nums">{yen(row.paymentAmount)}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">
                      {yen(row.withholdingTax)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function MonthlySummaryTable({ rows }: { rows: WithholdingTaxMonthlySummaryRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">月別集計</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-2 text-left font-medium">月</th>
                <th className="py-2 text-right font-medium">件数</th>
                <th className="py-2 text-right font-medium">支払金額</th>
                <th className="py-2 text-right font-medium">源泉税額</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    対象データがありません。
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.month} className="border-b last:border-b-0">
                    <td className="py-2 font-medium">{row.month}月</td>
                    <td className="py-2 text-right tabular-nums">{num(row.count)}</td>
                    <td className="py-2 text-right tabular-nums">{yen(row.paymentAmount)}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">
                      {yen(row.withholdingTax)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentStatementTable({ rows }: { rows: WithholdingTaxPaymentStatementRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">支払調書用集計</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="min-w-44 py-2 text-left font-medium">支払先</th>
                <th className="py-2 text-left font-medium">区分</th>
                <th className="py-2 text-right font-medium">上期支払</th>
                <th className="py-2 text-right font-medium">上期源泉</th>
                <th className="py-2 text-right font-medium">下期支払</th>
                <th className="py-2 text-right font-medium">下期源泉</th>
                <th className="py-2 text-right font-medium">年間源泉</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    支払調書対象のデータがありません。
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={`${row.payeeName}-${row.category}`} className="border-b last:border-b-0">
                    <td className="py-2 font-medium">{row.payeeName}</td>
                    <td className="py-2">{row.categoryLabel}</td>
                    <td className="py-2 text-right tabular-nums">{yen(row.h1PaymentAmount)}</td>
                    <td className="py-2 text-right tabular-nums">{yen(row.h1WithholdingTax)}</td>
                    <td className="py-2 text-right tabular-nums">{yen(row.h2PaymentAmount)}</td>
                    <td className="py-2 text-right tabular-nums">{yen(row.h2WithholdingTax)}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">
                      {yen(row.totalWithholdingTax)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function WarningList({ entries }: { entries: WithholdingTaxEntry[] }) {
  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          要確認
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.slice(0, 8).map((entry) => (
          <div
            key={entry.id}
            className="rounded-md border border-amber-200 bg-white px-3 py-2 text-xs"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[var(--color-text-primary)]">
                {entry.paymentDate ?? entry.sourceDate ?? "--"}
              </span>
              <span>{entry.payeeName ?? "支払先未設定"}</span>
              <Badge variant="outline" className="text-[10px]">
                {entry.categoryLabel}
              </Badge>
              <span className="ml-auto font-semibold tabular-nums">
                {yen(entry.withholdingTax)}
              </span>
            </div>
            <div className="mt-1 text-muted-foreground">
              {entry.warnings.join(" / ")}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EntryTable({ entries }: { entries: WithholdingTaxEntry[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">抽出明細</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="min-w-24 py-2 text-left font-medium">支払日</th>
                <th className="min-w-32 py-2 text-left font-medium">支払先</th>
                <th className="py-2 text-left font-medium">区分</th>
                <th className="min-w-32 py-2 text-left font-medium">支払科目</th>
                <th className="min-w-32 py-2 text-left font-medium">源泉科目</th>
                <th className="py-2 text-right font-medium">支払金額</th>
                <th className="py-2 text-right font-medium">源泉税額</th>
                <th className="min-w-56 py-2 text-left font-medium">摘要</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    抽出された明細はありません。
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-b-0">
                    <td className="py-2">{entry.paymentDate ?? entry.sourceDate ?? "--"}</td>
                    <td className="py-2 font-medium">{entry.payeeName ?? "--"}</td>
                    <td className="py-2">
                      <Badge variant="outline" className="whitespace-nowrap text-[10px]">
                        {entry.categoryLabel}
                      </Badge>
                    </td>
                    <td className="py-2">
                      {joinAccount(entry.sourceAccountName, entry.sourceSubAccountName)}
                    </td>
                    <td className="py-2">
                      {joinAccount(entry.withholdingAccountName, entry.withholdingSubAccountName)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {yen(entry.paymentAmount)}
                      {entry.paymentAmountEstimated && (
                        <span className="ml-1 text-[10px] text-amber-700">推定</span>
                      )}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">
                      {yen(entry.withholdingTax)}
                    </td>
                    <td className="max-w-80 truncate py-2 text-muted-foreground">
                      {entry.memo ?? "--"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function calendarYearRange(year: number): DateRangeValue {
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
}

function isDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function yen(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function num(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return value.toLocaleString("ja-JP");
}

function joinAccount(account: string | null, subAccount: string | null): string {
  if (!account && !subAccount) return "--";
  return subAccount ? `${account ?? "--"} / ${subAccount}` : account ?? "--";
}
