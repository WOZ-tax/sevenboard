"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Landmark,
  Plus,
  RefreshCw,
  Wallet,
} from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { PrintButton } from "@/components/ui/print-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCurrentOrg } from "@/contexts/current-org";
import { useScopedOrgId } from "@/hooks/use-scoped-org-id";
import { api } from "@/lib/api";
import type { LoanListResponse } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import {
  REPAYMENT_METHOD_LABELS,
  STATUS_LABELS,
  yen,
  pct,
} from "./_lib/loan-format";

export default function LoansPage() {
  const { currentOrg } = useCurrentOrg();
  const orgId = useScopedOrgId();
  const router = useRouter();
  const [showRepaid, setShowRepaid] = useState(false);
  const [mfExpanded, setMfExpanded] = useState(false);

  const listQuery = useQuery<LoanListResponse>({
    queryKey: ["loans", "list", orgId],
    queryFn: () => api.loans.list(orgId),
    enabled: !!orgId,
    staleTime: 60 * 1000,
  });

  const loans = useMemo(
    () => listQuery.data?.loans ?? [],
    [listQuery.data?.loans],
  );
  const totals = listQuery.data?.totals;
  const mf = listQuery.data?.mfBookBalance;

  const visibleLoans = useMemo(
    () => (showRepaid ? loans : loans.filter((l) => l.status !== "REPAID")),
    [loans, showRepaid],
  );
  const repaidCount = useMemo(
    () => loans.filter((l) => l.status === "REPAID").length,
    [loans],
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
        {/* ヘッダー */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Landmark className="h-6 w-6 text-[var(--color-primary)]" />
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
                借入金管理
              </h1>
              <p className="text-sm text-muted-foreground">
                {currentOrg.orgName} の借入状況と返済スケジュール
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 screen-only">
            <Button
              variant="outline"
              size="sm"
              onClick={() => listQuery.refetch()}
              disabled={listQuery.isFetching}
              className="gap-1.5"
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5",
                  listQuery.isFetching && "animate-spin",
                )}
              />
              再取得
            </Button>
            <Link
              href="/loans/new"
              className={cn(
                buttonVariants({ size: "sm" }),
                "gap-1.5 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]",
              )}
            >
              <Plus className="h-4 w-4" />
              借入を登録
            </Link>
            <PrintButton />
          </div>
        </div>

        {/* 読込エラー */}
        {listQuery.isError && (
          <Card>
            <CardContent className="flex items-start gap-3 p-6 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <div className="font-semibold text-[var(--color-text-primary)]">
                  借入情報を取得できませんでした。
                </div>
                <div className="mt-1 text-muted-foreground">
                  {(listQuery.error as Error).message}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* サマリカード */}
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard
            label="借入合計残高"
            value={yen(totals?.outstandingBalance)}
            loading={listQuery.isLoading}
          />
          <Card>
            <CardContent className="p-4">
              <div className="text-[11px] font-medium text-muted-foreground">
                当月返済額
              </div>
              <div className="mt-1 text-xl font-bold tabular-nums text-[var(--color-text-primary)]">
                {listQuery.isLoading ? "—" : yen(totals?.monthlyPayment)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                元金 {yen(totals?.monthlyPrincipal)} / 利息{" "}
                {yen(totals?.monthlyInterest)}
              </div>
            </CardContent>
          </Card>
          <SummaryCard
            label="年間利息見込"
            value={yen(totals?.annualInterestEstimate)}
            loading={listQuery.isLoading}
          />
        </div>

        {/* MF帳簿残高照合 */}
        <MfReconcileCard
          mf={mf}
          expanded={mfExpanded}
          onToggle={() => setMfExpanded((v) => !v)}
          loading={listQuery.isLoading}
        />

        {/* 一覧テーブル */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">借入一覧</CardTitle>
            {repaidCount > 0 && (
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showRepaid}
                  onChange={(e) => setShowRepaid(e.target.checked)}
                />
                完済({repaidCount})を表示
              </label>
            )}
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b-2 border-[var(--color-border)]">
                    <TableHead>銀行</TableHead>
                    <TableHead>支店</TableHead>
                    <TableHead>種別</TableHead>
                    <TableHead className="text-right">借入総額</TableHead>
                    <TableHead className="text-right">利率</TableHead>
                    <TableHead>開始日</TableHead>
                    <TableHead className="text-right">期間</TableHead>
                    <TableHead className="text-right">当月残高</TableHead>
                    <TableHead>次回返済</TableHead>
                    <TableHead>状態</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQuery.isLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        読み込み中…
                      </TableCell>
                    </TableRow>
                  ) : visibleLoans.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        {loans.length === 0
                          ? "登録された借入はありません。「借入を登録」から追加してください。"
                          : "表示できる借入がありません。"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleLoans.map((loan) => (
                      <TableRow
                        key={loan.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => router.push(`/loans/${loan.id}`)}
                      >
                        <TableCell className="font-medium">
                          {loan.lenderName}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {loan.branchName || "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {loan.loanType ||
                            REPAYMENT_METHOD_LABELS[loan.repaymentMethod]}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {yen(loan.principal)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            {pct(loan.interestRate)}
                            {loan.rateType === "VARIABLE" && (
                              <Badge
                                variant="outline"
                                className="border-sky-300 bg-sky-50 text-[10px] text-sky-700"
                              >
                                変動
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {loan.startDate || "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {loan.termMonths}ヶ月
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {yen(loan.currentBalance)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {loan.nextDueDate ? (
                            <div className="leading-tight">
                              <div>{loan.nextDueDate}</div>
                              <div className="text-xs tabular-nums text-muted-foreground">
                                {yen(loan.nextPaymentAmount)}
                              </div>
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              loan.status === "REPAID"
                                ? "border-muted-foreground/30 text-muted-foreground"
                                : "border-emerald-300 bg-emerald-50 text-emerald-700"
                            }
                          >
                            {STATUS_LABELS[loan.status]}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

function SummaryCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] font-medium text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 text-xl font-bold tabular-nums text-[var(--color-text-primary)]">
          {loading ? "—" : value}
        </div>
      </CardContent>
    </Card>
  );
}

function MfReconcileCard({
  mf,
  expanded,
  onToggle,
  loading,
}: {
  mf: LoanListResponse["mfBookBalance"] | undefined;
  expanded: boolean;
  onToggle: () => void;
  loading: boolean;
}) {
  const unavailable = !mf || mf.amount == null;
  const diff = mf?.diff ?? null;
  const hasDiff = diff != null && diff !== 0;

  return (
    <Card
      className={cn(
        hasDiff && "border-amber-300 bg-amber-50/40",
        unavailable && !loading && "border-muted",
      )}
    >
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              MF帳簿残高照合(借入金)
            </span>
          </div>
          {loading ? (
            <span className="text-sm text-muted-foreground">読み込み中…</span>
          ) : unavailable ? (
            <Badge
              variant="outline"
              className="border-muted-foreground/30 text-muted-foreground"
            >
              MF残高取得不可
            </Badge>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="tabular-nums">
                MF帳簿残高: <strong>{yen(mf!.amount)}</strong>
              </span>
              <span
                className={cn(
                  "tabular-nums",
                  hasDiff ? "font-semibold text-amber-700" : "text-muted-foreground",
                )}
              >
                差異: {yen(diff)}
              </span>
              {mf!.accounts.length > 0 && (
                <button
                  type="button"
                  onClick={onToggle}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {expanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  内訳
                </button>
              )}
            </div>
          )}
        </div>

        {unavailable && !loading && (
          <p className="mt-2 text-xs text-muted-foreground">
            MF未接続、または借入金勘定の残高を取得できませんでした。
          </p>
        )}

        {!unavailable && expanded && mf!.accounts.length > 0 && (
          <div className="mt-3 border-t pt-2">
            <ul className="space-y-1 text-xs">
              {mf!.accounts.map((acc) => (
                <li
                  key={acc.name}
                  className="flex items-center justify-between gap-4"
                >
                  <span className="text-muted-foreground">{acc.name}</span>
                  <span className="tabular-nums">{yen(acc.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
