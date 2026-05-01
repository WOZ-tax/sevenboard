"use client";

import { useEffect, useRef, useState } from "react";
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
  Sparkles,
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
import { ThinkingIndicator } from "@/components/ai/thinking-indicator";
import { useTypewriter } from "@/hooks/use-typewriter";
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

export default function CfoPage() {
  // AI レポート生成は重いコール (数秒〜十数秒)。明示的なボタン押下時だけ fetch する。
  // トリガー前は KPI / 月次推移 もデータが無いので「AI 分析を実行」ボタンのみ表示。
  const [aiTriggered, setAiTriggered] = useState(false);
  const [focus, setFocus] = useState<FocusValue>("all");
  // focus を AI 側のプロンプトに渡し、見出しと内容を切り替える
  const { data: aiData, isLoading, refetch, isFetching, error } = useAiSummary({
    enabled: aiTriggered,
    focus,
  });

  // 「思考中 → 文字打ち出し → 完了」演出の3フェーズ
  // 最低3秒は ThinkingIndicator を見せる（瞬時に終わると不気味なので）
  const MIN_THINKING_MS = 3000;
  const [phase, setPhase] = useState<"idle" | "thinking" | "typing" | "done">(
    "idle",
  );
  const thinkingStartedAtRef = useRef(0);

  // 初回 trigger / refetch 時に thinking フェーズへ
  useEffect(() => {
    if (!aiTriggered) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- aiTriggered toggle の同期
      setPhase("idle");
      return;
    }
    if (isFetching || isLoading) {
       
      setPhase("thinking");
      thinkingStartedAtRef.current = Date.now();
    }
  }, [aiTriggered, isFetching, isLoading]);

  // 応答が届き、最低3秒経過したら typing へ
  useEffect(() => {
    if (phase !== "thinking") return;
    if (isFetching || isLoading) return;
    if (!aiData) return;
    const elapsed = Date.now() - thinkingStartedAtRef.current;
    const remaining = Math.max(0, MIN_THINKING_MS - elapsed);
    const t = setTimeout(() => setPhase("typing"), remaining);
    return () => clearTimeout(t);
  }, [phase, isFetching, isLoading, aiData]);

  // typewriter で summary を1文字ずつ表示
  const summaryText = aiData?.summary ?? "";
  const { displayed: typedSummary, isComplete: isTypingComplete } =
    useTypewriter(summaryText, {
      speed: 70,
      enabled: phase === "typing" || phase === "done",
    });

  // typewriter 完了 → done フェーズ（sections / highlights を表示開始）
  useEffect(() => {
    if (phase === "typing" && isTypingComplete) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- typewriter 完了の同期
      setPhase("done");
    }
  }, [phase, isTypingComplete]);
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
          <h1 className="text-xl font-bold">AI CFO</h1>
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
                AI CFO
              </h1>
              <p className="text-sm text-muted-foreground">
                中小企業のための AI CFO — 経営分析・リスク検知・打ち手提案
              </p>
            </div>
          </div>
          <PrintButton />
        </div>

        <PeriodSegmentControl
          showAllPeriod={true}
          highlightRange={false}
          label="対象期間（月選択=単月分析 / 全期間=通期分析）"
        />

        {!aiTriggered && (
          <Card className="border-dashed border-[var(--color-secondary)]/40 bg-gradient-to-br from-[#ede7f6]/30 via-white to-white">
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <Sparkles className="h-10 w-10 text-[var(--color-secondary)]" />
              <div className="space-y-1">
                <p className="text-base font-semibold text-[var(--color-text-primary)]">
                  AI CFO レポートを生成
                </p>
                <p className="text-xs text-muted-foreground max-w-md">
                  選択した期間の業績データから、AI が KPI・月次推移・リスク評価・施策提言までを一気にドラフト化します。
                  対象月選択時は単月分析、全期間選択時は通期分析になります。生成には数秒〜十数秒かかります。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">フォーカス指標</span>
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
                  onClick={() => setAiTriggered(true)}
                  className="bg-[var(--color-secondary)] text-white hover:bg-[var(--color-secondary)]/90"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  AI 分析を実行
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {aiTriggered && mfNotConnected ? (
          <MfEmptyState />
        ) : aiTriggered ? (
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

        {/* フォーカス指標セレクタ + レポート再生成ボタン
            （下の経営分析・リスク分析の中身が focus に応じて切替わる） */}
        <div className="flex items-center justify-end gap-3 screen-only">
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

        {/* 月次経営分析 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base font-semibold text-[var(--color-text-primary)]">
              <span className="flex items-center gap-2">
                <FileBarChart className="h-5 w-5 text-[var(--color-tertiary)]" />
                {aiData?.targetMonth ? `${aiData.targetMonth}の経営分析` : "経営分析"}
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
            {phase === "thinking" ? (
              <ThinkingIndicator />
            ) : (
              <>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {phase === "typing" || phase === "done"
                    ? typedSummary || "AIサマリーを取得できませんでした。再生成してください。"
                    : aiData?.summary || "AIサマリーを取得できませんでした。再生成してください。"}
                  {phase === "typing" && (
                    <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-[var(--color-tertiary)] align-middle" />
                  )}
                </p>
                {/* highlights / sections は typewriter 完了後にフェードイン */}
                {phase === "done" && aiData?.highlights && aiData.highlights.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 animate-in fade-in duration-300">
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
                {phase === "done" && aiData?.sections && aiData.sections.length > 0 && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in duration-500">
                    {(aiData.sections ?? []).map((section, i) => (
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

        {/* AI エージェント情報（最下段に配置。データセクションを上に置くため後ろ送り） */}
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
          </>
        ) : null}
      </div>
    </DashboardShell>
  );
}
