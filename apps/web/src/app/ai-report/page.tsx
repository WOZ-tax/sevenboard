"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Bot,
  FileBarChart,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  Wallet,
  Banknote,
  BarChart3,
  ShieldAlert,
} from "lucide-react";
import { PrintButton } from "@/components/ui/print-button";
import { useAiSummary, useMfOffice } from "@/hooks/use-mf-data";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";
import { isMfNotConnected } from "@/lib/api";
import { MfEmptyState } from "@/components/ui/mf-empty-state";
import { AgentBanner } from "@/components/agent/agent-banner";
import { AGENTS } from "@/lib/agent-voice";
import { CopilotOpenButton } from "@/components/copilot/copilot-open-button";
import { ActionizeButton } from "@/components/ui/actionize-button";
import { DrafterCard } from "@/components/dashboard/drafter-card";
import {
  PeriodSegmentControl,
  usePeriodRange,
} from "@/components/ui/period-segment-control";
import { formatYen } from "@/lib/format";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const severityConfig = {
  高: {
    color: "bg-[#fce4ec] text-[var(--color-error)] border-[var(--color-error)]",
  },
  中: {
    color: "bg-[#fff8e1] text-[#8d6e00] border-[#8d6e00]",
  },
  低: {
    color: "bg-[#e1f5fe] text-[var(--color-info)] border-[var(--color-info)]",
  },
};

const focusOptions = [
  { value: "all", label: "すべて" },
  { value: "revenue", label: "売上・利益" },
  { value: "cost", label: "費用" },
  { value: "cashflow", label: "CF" },
  { value: "indicators", label: "財務指標" },
] as const;

type FocusValue = (typeof focusOptions)[number]["value"];

const sectionIconMap: Record<string, React.ReactNode> = {
  "売上・利益分析": <TrendingUp className="h-4 w-4 text-[var(--color-tertiary)]" />,
  "費用動向": <Wallet className="h-4 w-4 text-[var(--color-tertiary)]" />,
  "キャッシュフロー": <Banknote className="h-4 w-4 text-[var(--color-tertiary)]" />,
  "財務指標": <BarChart3 className="h-4 w-4 text-[var(--color-tertiary)]" />,
  "リスク分析": <ShieldAlert className="h-4 w-4 text-[var(--color-tertiary)]" />,
};

/** フォーカスに応じてセクションをフィルタ */
function filterSections(
  sections: { title: string; content: string }[],
  focus: FocusValue,
) {
  if (focus === "all") return sections;
  const map: Record<string, string[]> = {
    revenue: ["売上・利益分析"],
    cost: ["費用動向"],
    cashflow: ["キャッシュフロー"],
    indicators: ["財務指標"],
  };
  const allowed = map[focus] || [];
  return sections.filter((s) => allowed.includes(s.title));
}

export default function AiReportPage() {
  const { data: aiData, isLoading, refetch, isFetching, error } = useAiSummary();
  const [focus, setFocus] = useState<FocusValue>("all");
  const mfNotConnected = isMfNotConnected(error);
  const office = useMfOffice();
  const { fiscalYear, month, periods } = usePeriodStore();
  const periodLabel = getPeriodLabel(fiscalYear, month, periods);
  const { isMonthInRange } = usePeriodRange();

  const risks = (aiData?.highlights ?? [])
    .filter((h) => h.type === "negative" || h.type === "neutral")
    .map((h, i) => ({
      title: h.type === "negative" ? `懸念事項 ${i + 1}` : `注意事項 ${i + 1}`,
      description: h.text,
      severity: (h.type === "negative" ? "高" : "中") as "高" | "中" | "低",
    }));

  const generatedAtDisplay = aiData?.generatedAt
    ? new Date(aiData.generatedAt).toLocaleString("ja-JP")
    : null;

  return (
    <DashboardShell>
      <div className="space-y-4">
        {/* 印刷専用ヘッダー */}
        <div className="print-only" data-print-block>
          <h1 className="text-xl font-bold">AI CFOレポート</h1>
          <div className="mt-1 text-sm">
            {office.data?.name || "—"} — {periodLabel || "期間未指定"}
          </div>
          <div className="mt-0.5 text-xs text-gray-600">
            出力日: {new Date().toLocaleDateString("ja-JP")}
            {generatedAtDisplay && ` / AI生成: ${generatedAtDisplay}`}
          </div>
          <hr className="mt-2" />
        </div>

        <div className="flex items-center justify-between screen-only">
          <div className="flex items-center gap-3">
            <Bot className="h-6 w-6 text-[var(--color-tertiary)]" />
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
                AI CFOレポート
              </h1>
              <p className="text-sm text-muted-foreground">
                AI CFOによる経営分析・リスク評価
              </p>
            </div>
          </div>
          <PrintButton />
        </div>

        <PeriodSegmentControl
          showAllPeriod={false}
          highlightRange={false}
          label="対象月（単月）"
        />

        <div className="screen-only">
          <AgentBanner
            agent={AGENTS.drafter}
            status={isLoading || isFetching ? "running" : aiData ? "ok" : "unknown"}
            detectionCount={risks.length}
            lastUpdatedAt={aiData?.generatedAt ?? new Date().toISOString()}
            actions={
              <CopilotOpenButton
                agentKey="drafter"
                mode="execute"
                seed="顧問向け月次レポートの初稿を、根拠データと信頼度を併記してドラフト化してください。"
              />
            }
          />
        </div>

        <div className="screen-only">
          <DrafterCard />
        </div>

        {mfNotConnected ? (
          <MfEmptyState />
        ) : (
          <>
        {/* 対象月の単月KPI */}
        {aiData?.targetMonthData && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { label: "売上高", value: aiData.targetMonthData.revenue },
              { label: "売上総利益", value: aiData.targetMonthData.grossProfit },
              { label: "販管費", value: aiData.targetMonthData.sga },
              { label: "営業利益", value: aiData.targetMonthData.operatingProfit },
              { label: "経常利益", value: aiData.targetMonthData.ordinaryProfit },
            ].map((k) => (
              <div key={k.label} className="rounded-md border bg-background px-3 py-2">
                <div className="text-[10px] text-muted-foreground">{aiData.targetMonth} {k.label}</div>
                <div className={cn(
                  "mt-0.5 text-sm font-bold tabular-nums",
                  k.value < 0 ? "text-red-600" : "text-[var(--color-text-primary)]",
                )}>
                  {formatYen(k.value)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 過去からの月次推移（選択期間外＝未来月はグレーアウト） */}
        {aiData?.monthlyTrend && aiData.monthlyTrend.length > 0 && (() => {
          // 選択中の期間基準で「範囲内＝実績扱い、範囲外＝未来扱い」を判定
          const parseMonthNum = (label: string): number => {
            const m = label.match(/(\d{1,2})月/);
            return m ? Number(m[1]) : 0;
          };
          const trend = aiData.monthlyTrend!.map((p) => ({
            ...p,
            actual: isMonthInRange(parseMonthNum(p.month)),
          }));
          let lastActualIdx = -1;
          trend.forEach((p, i) => { if (p.actual) lastActualIdx = i; });
          const chartData = trend.map((p, i) => ({
            month: p.month,
            revenueActual: p.actual ? p.revenue : null,
            operatingActual: p.actual ? p.operatingProfit : null,
            // 境界月は両側ラインに入れて折れ線を連結させる
            revenueFuture: !p.actual ? p.revenue : (i === lastActualIdx ? p.revenue : null),
            operatingFuture: !p.actual ? p.operatingProfit : (i === lastActualIdx ? p.operatingProfit : null),
          }));
          return (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
                  <TrendingUp className="h-4 w-4 text-[var(--color-tertiary)]" />
                  過去からの月次推移（単月実績）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(v) => `${Math.round(v / 10000)}万`} />
                      <Tooltip
                        formatter={(v) => (v === null || v === undefined ? "—" : formatYen(Number(v)))}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="revenueActual"
                        name="売上高"
                        stroke="var(--color-primary)"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="operatingActual"
                        name="営業利益"
                        stroke="var(--color-tertiary)"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="revenueFuture"
                        stroke="#cbd5e1"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                        legendType="none"
                      />
                      <Line
                        type="monotone"
                        dataKey="operatingFuture"
                        stroke="#cbd5e1"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                        legendType="none"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* 月次経営分析 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base font-semibold text-[var(--color-text-primary)]">
              <span className="flex items-center gap-2">
                <FileBarChart className="h-5 w-5 text-[var(--color-tertiary)]" />
                {aiData?.targetMonth ? `${aiData.targetMonth}の経営分析` : "単月経営分析"}
              </span>
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className="border border-green-300 bg-green-100 px-2 py-0.5 text-xs text-green-700"
                >
                  {isLoading ? "生成中..." : "生成済み"}
                </Badge>
                {generatedAtDisplay && (
                  <span className="text-xs text-muted-foreground/60">
                    {generatedAtDisplay}
                  </span>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
                <div className="h-4 w-4/6 animate-pulse rounded bg-muted" />
                <p className="mt-2 text-xs text-muted-foreground">AI分析中...</p>
              </div>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {aiData?.summary || "AIサマリーを取得できませんでした。再生成してください。"}
                </p>
                {aiData?.highlights && aiData.highlights.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {aiData.highlights
                      .filter((h) => h.type === "positive")
                      .map((h, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="border-green-300 bg-green-100 px-2 py-0.5 text-[10px] text-green-700"
                        >
                          {h.text}
                        </Badge>
                      ))}
                  </div>
                )}

                {/* セクション表示 */}
                {aiData?.sections && aiData.sections.length > 0 && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filterSections(aiData.sections, focus).map((section, i) => (
                      <div
                        key={i}
                        className="rounded-lg border bg-card p-4"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          {sectionIconMap[section.title] || (
                            <FileBarChart className="h-4 w-4 text-[var(--color-tertiary)]" />
                          )}
                          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                            {section.title}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {section.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* リスク分析 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
              <AlertTriangle className="h-5 w-5 text-[var(--color-tertiary)]" />
              リスク分析
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {risks.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                検知された懸念事項はありません
              </p>
            ) : risks.map((risk, index) => {
              const config = severityConfig[risk.severity];
              const severityMap: Record<
                "高" | "中" | "低",
                "HIGH" | "MEDIUM" | "LOW"
              > = { 高: "HIGH", 中: "MEDIUM", 低: "LOW" };
              return (
                <div
                  key={index}
                  className="flex items-start gap-3 rounded-lg border p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                        {risk.title}
                      </span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "border px-2 py-0 text-[10px]",
                          config.color,
                        )}
                      >
                        {risk.severity}
                      </Badge>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {risk.description}
                    </p>
                  </div>
                  <ActionizeButton
                    sourceScreen="AI_REPORT"
                    sourceRef={{
                      riskIndex: index,
                      severity: risk.severity,
                      from: "ai-report-risk",
                    }}
                    defaultTitle={risk.title}
                    defaultDescription={risk.description}
                    defaultSeverity={severityMap[risk.severity]}
                    defaultOwnerRole="ADVISOR"
                    size="sm"
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* フォーカス指標セレクタ + レポート再生成ボタン */}
        <div className="flex items-center justify-end gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">フォーカス指標</span>
            <Select value={focus} onValueChange={(v) => setFocus(v as FocusValue)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue>
                  {(v) => focusOptions.find((o) => o.value === v)?.label ?? ""}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {focusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="gap-2 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            {isFetching ? "生成中..." : "レポート再生成"}
          </Button>
        </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
