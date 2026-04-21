"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Landmark, Bot, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { PrintButton } from "@/components/ui/print-button";
import { useAiFundingReport } from "@/hooks/use-mf-data";
import { isMfNotConnected } from "@/lib/api";
import { MfEmptyState } from "@/components/ui/mf-empty-state";

// --- モックデータ ---
const mockFundingReport = {
  summary:
    "現在の財務状況は健全で、ランウェイ18.5ヶ月を確保しています。来期の設備投資計画を考慮すると、6ヶ月以内に追加資金調達を検討することを推奨します。",
  currentStatus: {
    cashBalance: 178000000,
    runway: 18.5,
    burnRate: 9600000,
    debtRatio: 0.32,
  },
  options: [
    {
      type: "銀行融資",
      amount: 50000000,
      pros: ["金利が低い（1.5〜2.5%）", "経営権に影響なし", "既存取引銀行との関係強化"],
      cons: ["担保・保証人が必要な場合あり", "審査に1〜2ヶ月", "返済義務あり"],
      recommendation: "推奨",
    },
    {
      type: "日本政策金融公庫",
      amount: 30000000,
      pros: ["低金利（0.5〜1.5%）", "長期返済可能", "創業・成長支援制度あり"],
      cons: ["申請書類が多い", "審査に2〜3ヶ月", "上限額あり"],
      recommendation: "検討",
    },
    {
      type: "エクイティ（VC/エンジェル）",
      amount: 100000000,
      pros: ["返済不要", "経営ノウハウの提供", "大型調達が可能"],
      cons: ["株式希薄化", "経営への関与", "Exit圧力"],
      recommendation: "時期尚早",
    },
  ],
  generatedAt: "2026-04-05 09:00",
};

type FundingReportView = typeof mockFundingReport;

function formatManYen(value: number): string {
  const man = Math.round(value / 10000);
  return `\u00A5${man.toLocaleString()}万`;
}

const recStyle: Record<string, string> = {
  推奨: "bg-[#e8f5e9] text-[var(--color-success)] border-[var(--color-success)]",
  検討: "bg-[#fff8e1] text-[#8d6e00] border-[#8d6e00]",
  時期尚早: "bg-[#f0eeec] text-[var(--color-text-secondary)] border-[var(--color-border)]",
};

export default function FundingReportPage() {
  const { data: apiData, refetch, isFetching, error } = useAiFundingReport();
  const [generated, setGenerated] = useState(false);
  const mfNotConnected = isMfNotConnected(error);

  const report: FundingReportView | null = generated && !mfNotConnected
    ? (apiData as unknown as FundingReportView | undefined) ?? mockFundingReport
    : null;

  const handleGenerate = async () => {
    setGenerated(true);
    refetch();
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Landmark className="h-6 w-6 text-[var(--color-tertiary)]" />
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
                資金調達レポート
              </h1>
              <p className="text-sm text-muted-foreground">
                AIが資金調達の選択肢を分析・提案
              </p>
            </div>
          </div>
          <PrintButton />
        </div>

        {/* Generate Button */}
        {!generated && !mfNotConnected && (
          <Button
            className="gap-2 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
            onClick={handleGenerate}
          >
            <Landmark className="h-4 w-4" />
            レポートを生成
          </Button>
        )}

        {mfNotConnected && <MfEmptyState />}

        {/* Loading */}
        {generated && isFetching && !report && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Bot className="h-12 w-12 animate-pulse text-[var(--color-tertiary)]" />
              <p className="mt-4 text-sm font-medium text-[var(--color-text-primary)]">
                レポートを生成中...
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                AIが財務データを分析しています
              </p>
            </CardContent>
          </Card>
        )}

        {/* Generated Report */}
        {report && (
          <>
            {/* Summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
                  <TrendingUp className="h-5 w-5 text-[var(--color-tertiary)]" />
                  総合評価
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {report.summary}
                </p>
              </CardContent>
            </Card>

            {/* Current Status */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: "現預金残高",
                  value: formatManYen(report.currentStatus.cashBalance),
                },
                {
                  label: "ランウェイ",
                  value: `${report.currentStatus.runway}ヶ月`,
                },
                {
                  label: "月次バーンレート",
                  value: formatManYen(report.currentStatus.burnRate),
                },
                {
                  label: "負債比率",
                  value: `${(report.currentStatus.debtRatio * 100).toFixed(0)}%`,
                },
              ].map((item, i) => (
                <Card key={i}>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="mt-1 text-xl font-bold text-[var(--color-text-primary)]">
                      {item.value}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Funding Options */}
            <div className="grid gap-4 lg:grid-cols-3">
              {report.options.map((option, index) => (
                <Card key={index}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="font-bold text-[var(--color-text-primary)]">
                        {option.type}
                      </span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "border px-2 py-0.5 text-[10px]",
                          recStyle[option.recommendation] || recStyle["検討"]
                        )}
                      >
                        {option.recommendation}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">調達想定額</p>
                      <p className="text-xl font-bold text-[var(--color-text-primary)]">
                        {formatManYen(option.amount)}
                      </p>
                    </div>

                    <div>
                      <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-green-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        メリット
                      </p>
                      <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                        {option.pros.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-red-600">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        デメリット
                      </p>
                      <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                        {option.cons.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Metadata */}
            <p className="text-right text-xs text-muted-foreground/60">
              生成日時: {report.generatedAt}
            </p>

            {/* Regenerate */}
            <div className="flex justify-end">
              <Button
                className="gap-2 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <Landmark
                  className={cn("h-4 w-4", isFetching && "animate-spin")}
                />
                {isFetching ? "生成中..." : "レポートを再生成"}
              </Button>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
