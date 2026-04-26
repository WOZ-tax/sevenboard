"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Landmark,
  Bot,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Calculator,
  ArrowRight,
  Shield,
  Sparkles,
} from "lucide-react";
import { PrintButton } from "@/components/ui/print-button";
import { useAiFundingReport, useMfOffice } from "@/hooks/use-mf-data";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";
import { api, isMfNotConnected } from "@/lib/api";
import { useCurrentOrg } from "@/contexts/current-org";
import { useAuthStore } from "@/lib/auth";
import { MfEmptyState } from "@/components/ui/mf-empty-state";
import { PeriodSegmentControl } from "@/components/ui/period-segment-control";
import { useRunwayMode } from "@/components/ui/runway-mode-toggle";
import type { FundingReport, FundingScenarioSeed } from "@/lib/api-types";

const REPAYMENT_LABELS: Record<string, string> = {
  EQUAL_INSTALLMENT: "元利均等",
  EQUAL_PRINCIPAL: "元金均等",
  BULLET: "一括返済",
};

function formatManYen(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `¥${Math.round(n / 10000).toLocaleString()}万`;
}

function loadStoredScenarios(): FundingScenarioSeed[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem("funding-scenarios");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is FundingScenarioSeed =>
        s &&
        typeof s.principal === "number" &&
        typeof s.monthlyPayment === "number",
    );
  } catch {
    return [];
  }
}

export default function FundingReportPage() {
  const orgId = useCurrentOrg().currentOrgId ?? "";
  const { data: apiData, refetch, isFetching, error } = useAiFundingReport();
  const [generated, setGenerated] = useState(false);
  const mfNotConnected = isMfNotConnected(error);
  const office = useMfOffice();
  const { fiscalYear, month, periods } = usePeriodStore();
  const periodLabel = getPeriodLabel(fiscalYear, month, periods);
  const queryClient = useQueryClient();
  const [runwayMode] = useRunwayMode();

  const [storedScenarios, setStoredScenarios] = useState<FundingScenarioSeed[]>([]);
  useEffect(() => {
    setStoredScenarios(loadStoredScenarios());
  }, []);

  const regenerateWithScenarios = useMutation({
    mutationFn: (scenarios: FundingScenarioSeed[]) =>
      api.ai.getFundingReportWithScenarios(orgId, {
        fiscalYear,
        endMonth: month,
        scenarios,
      }),
    onSuccess: (data) => {
      // useAiFundingReport の queryKey に runwayMode が含まれるため一致させる
      queryClient.setQueryData(
        ["ai", "funding-report", orgId, fiscalYear, month, runwayMode],
        data,
      );
      setGenerated(true);
    },
  });

  const report: FundingReport | null = generated && !mfNotConnected
    ? ((apiData as FundingReport | undefined) ?? null)
    : null;

  const handleGenerate = async () => {
    setGenerated(true);
    if (storedScenarios.length > 0) {
      regenerateWithScenarios.mutate(storedScenarios);
    } else {
      refetch();
    }
  };

  const clearScenarios = () => {
    sessionStorage.removeItem("funding-scenarios");
    setStoredScenarios([]);
  };

  const busy = isFetching || regenerateWithScenarios.isPending;
  const generatedAtDisplay = report?.generatedAt
    ? new Date(report.generatedAt).toLocaleString("ja-JP")
    : null;

  return (
    <DashboardShell>
      <div className="space-y-4">
        {/* 印刷専用ヘッダー */}
        <div className="print-only" data-print-block>
          <h1 className="text-xl font-bold">資金調達レポート</h1>
          <div className="mt-1 text-sm">
            {office.data?.name || "—"} — {periodLabel || "期間未指定"}
          </div>
          <div className="mt-0.5 text-xs text-gray-600">
            出力日: {new Date().toLocaleDateString("ja-JP")}
            {generatedAtDisplay && ` / AI生成: ${generatedAtDisplay}`}
          </div>
          <hr className="mt-2" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between screen-only">
          <div className="flex items-center gap-3">
            <Landmark className="h-6 w-6 text-[var(--color-tertiary)]" />
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
                資金調達レポート
              </h1>
              <p className="text-sm text-muted-foreground">
                AI CFOが投資家・金融機関向けに財務ハイライトと見通しを整理
              </p>
            </div>
          </div>
          <PrintButton />
        </div>

        <PeriodSegmentControl />

        {/* Stored scenarios banner */}
        {storedScenarios.length > 0 && (
          <Card className="border-[var(--color-tertiary)]/40 bg-[var(--color-tertiary)]/5 screen-only">
            <CardContent className="flex items-center justify-between gap-4 py-3">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 text-[var(--color-tertiary)]" />
                <div>
                  <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                    検討中の借入シナリオが{storedScenarios.length}件あります
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {storedScenarios
                      .map(
                        (s) =>
                          `${s.name}: ${formatManYen(s.principal)} / 月額${formatManYen(s.monthlyPayment)}`,
                      )
                      .join("　｜　")}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground/80">
                    レポート再生成時にAI CFOへコンテキストとして渡され、具体的な提案に反映されます。
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={clearScenarios}>
                クリア
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 screen-only">
          {!generated && !mfNotConnected && (
            <Button
              className="gap-2 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
              onClick={handleGenerate}
              disabled={busy}
            >
              <Landmark className="h-4 w-4" />
              レポートを生成
            </Button>
          )}
          <Link
            href="/loan"
            className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
          >
            <Calculator className="h-4 w-4" />
            融資シミュレーションを開く
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {mfNotConnected && <MfEmptyState />}

        {/* Loading */}
        {generated && busy && !report && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Bot className="h-12 w-12 animate-pulse text-[var(--color-tertiary)]" />
              <p className="mt-4 text-sm font-medium text-[var(--color-text-primary)]">
                レポートを生成中...
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                AI CFOが財務データを分析しています
              </p>
            </CardContent>
          </Card>
        )}

        {/* Empty response */}
        {generated && !busy && !report && !mfNotConnected && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <AlertTriangle className="h-10 w-10 text-[var(--color-error)]" />
              <p className="mt-4 text-sm font-medium text-[var(--color-text-primary)]">
                レポート生成に失敗しました
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                サーバーからレポートを取得できませんでした。時間を置いて再試行してください。
              </p>
              <Button className="mt-4 gap-2" variant="outline" onClick={handleGenerate}>
                再試行
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Generated Report */}
        {report && (
          <>
            {/* Executive Summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
                  <TrendingUp className="h-5 w-5 text-[var(--color-tertiary)]" />
                  エグゼクティブサマリー
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text-primary)]">
                  {report.executiveSummary || "（未生成）"}
                </p>
              </CardContent>
            </Card>

            {/* Financial Highlights */}
            {report.financialHighlights?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
                    <Landmark className="h-5 w-5 text-[var(--color-tertiary)]" />
                    財務ハイライト
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {report.financialHighlights.map((h, i) => (
                      <li key={i} className="flex gap-2 text-sm text-[var(--color-text-primary)]">
                        <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-tertiary)]" />
                        <span className="leading-relaxed">{h}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Suggested Options — 融資シミュへのブリッジ */}
            {report.suggestedOptions && report.suggestedOptions.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
                    <Sparkles className="h-5 w-5 text-[var(--color-tertiary)]" />
                    AI CFOの資金調達オプション提案
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {report.suggestedOptions.map((opt, i) => {
                      const isLoanLike =
                        opt.suggestedRate !== undefined &&
                        opt.suggestedMonths !== undefined;
                      const qs = new URLSearchParams({
                        name: opt.type,
                        principal: String(opt.amount),
                        ...(opt.suggestedRate !== undefined && { interestRate: String(opt.suggestedRate) }),
                        ...(opt.suggestedMonths !== undefined && { termMonths: String(opt.suggestedMonths) }),
                        ...(opt.repaymentType && { repaymentType: opt.repaymentType }),
                      });
                      return (
                        <div
                          key={i}
                          className="rounded-md border bg-background p-3"
                        >
                          <div className="text-xs text-muted-foreground">{opt.type}</div>
                          <div className="mt-0.5 text-lg font-bold text-[var(--color-text-primary)]">
                            {formatManYen(opt.amount)}
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {opt.rationale}
                          </p>
                          {isLoanLike && (
                            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                              <span className="rounded bg-muted px-1.5 py-0.5">
                                年率 {opt.suggestedRate}%
                              </span>
                              <span className="rounded bg-muted px-1.5 py-0.5">
                                {opt.suggestedMonths}ヶ月
                              </span>
                              {opt.repaymentType && (
                                <span className="rounded bg-muted px-1.5 py-0.5">
                                  {REPAYMENT_LABELS[opt.repaymentType] ?? opt.repaymentType}
                                </span>
                              )}
                            </div>
                          )}
                          {isLoanLike && (
                            <Link
                              href={`/loan?${qs.toString()}`}
                              className={cn(
                                buttonVariants({ variant: "outline", size: "sm" }),
                                "mt-3 w-full gap-1",
                              )}
                            >
                              <Calculator className="h-3.5 w-3.5" />
                              この条件で融資シミュ
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Echoed scenarios — レポート生成時に渡ったシナリオ */}
            {report.echoedScenarios && report.echoedScenarios.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
                    <Calculator className="h-5 w-5 text-[var(--color-tertiary)]" />
                    レポートに反映された検討中シナリオ
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5 text-sm">
                    {report.echoedScenarios.map((s, i) => (
                      <li key={i} className="text-[var(--color-text-primary)]">
                        <span className="font-semibold">{s.name}</span>: 元金{" "}
                        {formatManYen(s.principal)} / 年率 {s.interestRate}% /{" "}
                        {s.termMonths}ヶ月 / 月額返済 {formatManYen(s.monthlyPayment)}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Strengths & Risks */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-green-700">
                    <CheckCircle2 className="h-5 w-5" />
                    強み
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {report.strengthsRisks?.strengths?.length > 0 ? (
                    <ul className="space-y-2">
                      {report.strengthsRisks.strengths.map((s, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                          <span className="leading-relaxed">{s}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">（記載なし）</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-red-600">
                    <AlertTriangle className="h-5 w-5" />
                    リスク
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {report.strengthsRisks?.risks?.length > 0 ? (
                    <ul className="space-y-2">
                      {report.strengthsRisks.risks.map((r, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                          <span className="leading-relaxed">{r}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">（記載なし）</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Projections */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
                  <Shield className="h-5 w-5 text-[var(--color-tertiary)]" />
                  今後の見通し
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text-primary)]">
                  {report.projections || "（未生成）"}
                </p>
              </CardContent>
            </Card>

            {/* Metadata + Regenerate */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground/60">
                {generatedAtDisplay ? `生成: ${generatedAtDisplay}` : ""}
                ｜このレポートはドラフトです。最終責任は顧問・経営者にあります。
              </p>
              <Button
                className="gap-2 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] screen-only"
                onClick={handleGenerate}
                disabled={busy}
              >
                <Landmark
                  className={cn("h-4 w-4", busy && "animate-spin")}
                />
                {busy
                  ? "生成中..."
                  : storedScenarios.length > 0
                    ? "シナリオを反映して再生成"
                    : "レポートを再生成"}
              </Button>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
