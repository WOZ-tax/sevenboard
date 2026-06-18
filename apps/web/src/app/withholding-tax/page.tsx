"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
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
import { PeriodSegmentControl } from "@/components/ui/period-segment-control";
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
import { getPeriodLabel, usePeriodStore } from "@/lib/period-store";
import { cn } from "@/lib/utils";

export default function WithholdingTaxPage() {
  const { currentOrg } = useCurrentOrg();
  const orgId = useScopedOrgId();
  const office = useMfOffice();
  const { fiscalYear, month, periods } = usePeriodStore();
  const selectedFiscalYear =
    fiscalYear ??
    office.data?.accounting_periods?.[0]?.fiscal_year ??
    new Date().getFullYear();
  const periodLabel = getPeriodLabel(selectedFiscalYear, month, periods);

  const previewQuery = useQuery<WithholdingTaxPreviewResult>({
    queryKey: ["withholding-tax", "preview", orgId, selectedFiscalYear, month ?? null],
    queryFn: () => api.withholdingTax.preview(orgId, selectedFiscalYear, month),
    enabled: !!orgId && !!selectedFiscalYear,
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
              <Badge variant="outline">{periodLabel || `${selectedFiscalYear}年度`}</Badge>
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                プレビュー
              </Badge>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => previewQuery.refetch()}
            disabled={previewQuery.isFetching}
            className="gap-1.5"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", previewQuery.isFetching && "animate-spin")}
            />
            MF再取得
          </Button>
        </div>

        <PeriodSegmentControl
          showAllPeriod
          highlightRange={false}
          label="対象期間"
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
