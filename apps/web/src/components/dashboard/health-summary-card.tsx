"use client";

/**
 * 健康サマリー (AI CFO の経営健康モニター) カード。
 *
 * 旧: accounting-review/page.tsx 内に inline 定義されていたが、
 *     ダッシュボード `/` でも使うため別ファイル化。
 *
 * - スコア (0-100) と前月比
 * - breakdown (活動性 40 / 安全性 40 / 効率性 20)
 * - レーダーチャート (8 指標) + スコアの根拠 (3 列)
 * - AI 質問 5 問 (生成中は ThinkingIndicator)
 * - 「健康再計算」ボタン (任意で AI 質問を再生成)
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThinkingIndicator } from "@/components/ai/thinking-indicator";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * 健康スコア 8 指標の表示用メタデータ。
 * health-score-calculator.ts のロジックに合わせて、満点条件をユーザー向けに翻訳する。
 */
const HEALTH_SCORE_DETAIL_META: Array<{
  group: "activity" | "safety" | "efficiency";
  groupLabel: string;
  detailKey: keyof import("@/lib/api").HealthScoreBreakdownDetail;
  indicatorKey: keyof import("@/lib/api").HealthFinancialIndicators;
  label: string;
  max: number;
  hint: string;
  format: (v: number) => string;
}> = [
  {
    group: "activity",
    groupLabel: "活動性 (収益性)",
    detailKey: "operatingProfitMargin",
    indicatorKey: "operatingProfitMargin",
    label: "営業利益率",
    max: 15,
    hint: "10% 以上で満点。中小企業は 5% で標準",
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    group: "activity",
    groupLabel: "活動性 (収益性)",
    detailKey: "roe",
    indicatorKey: "roe",
    label: "ROE (自己資本利益率)",
    max: 15,
    hint: "15% 以上で満点。投資家評価の目安",
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    group: "activity",
    groupLabel: "活動性 (収益性)",
    detailKey: "roa",
    indicatorKey: "roa",
    label: "ROA (総資産利益率)",
    max: 10,
    hint: "5% 以上で満点。資産効率の目安",
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    group: "safety",
    groupLabel: "安全性 (財務体質)",
    detailKey: "currentRatio",
    indicatorKey: "currentRatio",
    label: "流動比率",
    max: 15,
    hint: "200% 以上で満点。100% を割ると短期支払不安",
    format: (v) => `${v.toFixed(0)}%`,
  },
  {
    group: "safety",
    groupLabel: "安全性 (財務体質)",
    detailKey: "equityRatio",
    indicatorKey: "equityRatio",
    label: "自己資本比率",
    max: 15,
    hint: "50% 以上で満点。20% で銀行評価の標準",
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    group: "safety",
    groupLabel: "安全性 (財務体質)",
    detailKey: "debtCoverage",
    indicatorKey: "debtEquityRatio",
    label: "負債比率 (低いほど良い)",
    max: 10,
    hint: "100% (負債=純資産) 以下で満点。300% 超で要警戒",
    format: (v) => `${v.toFixed(0)}%`,
  },
  {
    group: "efficiency",
    groupLabel: "効率性 (資産活用)",
    detailKey: "totalAssetTurnover",
    indicatorKey: "totalAssetTurnover",
    label: "総資産回転率",
    max: 10,
    hint: "1.5 回 以上で満点。資産が売上を生む効率",
    format: (v) => `${v.toFixed(2)} 回`,
  },
  {
    group: "efficiency",
    groupLabel: "効率性 (資産活用)",
    detailKey: "receivablesTurnover",
    indicatorKey: "receivablesTurnover",
    label: "売上債権回転率",
    max: 10,
    hint: "12 回 以上で満点 (回収サイト 1 ヶ月相当)",
    format: (v) => `${v.toFixed(1)} 回`,
  },
];

export function HealthSummaryCard({
  orgId,
  fiscalYear,
  month,
}: {
  orgId: string;
  fiscalYear?: number;
  month?: number;
}) {
  const queryClient = useQueryClient();
  const enabled = !!orgId && !!fiscalYear && !!month;

  const snapshotQuery = useQuery({
    queryKey: ["health-snapshot", orgId, fiscalYear, month],
    queryFn: () => api.healthSnapshot.byMonth(orgId, fiscalYear!, month!),
    enabled,
    staleTime: 60 * 1000,
  });

  const refreshMutation = useMutation({
    mutationFn: (generateAiQuestions: boolean) =>
      api.healthSnapshot.refresh(orgId, fiscalYear!, month!, generateAiQuestions),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["health-snapshot", orgId, fiscalYear, month],
      });
    },
  });

  if (!enabled) return null;

  const data = snapshotQuery.data;
  const delta =
    data && data.prevScore !== null ? data.score - data.prevScore : null;
  const isGeneratingAi =
    refreshMutation.isPending && refreshMutation.variables === true;

  return (
    <Card className="screen-only">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
          健康サマリー
          {data && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {data.snapshotDate}
            </span>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={refreshMutation.isPending}
            onClick={() => refreshMutation.mutate(false)}
            title="MF データから健康スコアを再計算 (コストゼロ)"
          >
            {refreshMutation.isPending && refreshMutation.variables === false ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            <span className="ml-1">健康再計算</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={refreshMutation.isPending}
            onClick={() => refreshMutation.mutate(true)}
            title="AI が今月の論点 5 問を生成 (LLM トークン消費)"
          >
            {refreshMutation.isPending && refreshMutation.variables === true ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            <span className="ml-1">AI 質問生成</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {snapshotQuery.isLoading ? (
          <div className="h-32 animate-pulse rounded bg-muted" />
        ) : !data ? (
          <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            この月の健康スナップショットはまだありません。
            <br />
            <span className="text-xs">
              MF を再同期するか、「健康再計算」ボタンで生成してください。
            </span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 上段: 左 (スコア + 3バー) | 右 (レーダー) */}
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-stretch">
              <div className="flex h-full flex-col rounded-md border bg-muted/10 p-5">
                <div className="flex flex-col items-center">
                  <div className="text-xs font-medium text-muted-foreground">
                    健康スコア
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span
                      className={cn(
                        "text-7xl font-bold tabular-nums leading-none",
                        data.score >= 75
                          ? "text-[var(--color-success)]"
                          : data.score >= 50
                            ? "text-amber-600"
                            : "text-red-600",
                      )}
                    >
                      {data.score}
                    </span>
                    <span className="text-lg text-muted-foreground">/100</span>
                  </div>
                  {delta !== null && (
                    <span
                      className={cn(
                        "mt-2 text-sm font-medium",
                        delta > 0
                          ? "text-[var(--color-success)]"
                          : delta < 0
                            ? "text-red-600"
                            : "text-muted-foreground",
                      )}
                    >
                      {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"}
                      前月比 {delta > 0 ? "+" : ""}
                      {delta} pt
                    </span>
                  )}
                </div>

                <div className="my-5 border-t border-[var(--color-border)]" />

                <div className="flex flex-1 flex-col justify-around space-y-3">
                  <BreakdownBar
                    label="活動性"
                    sublabel="収益性"
                    value={data.breakdown.activity}
                    max={40}
                    color="bg-emerald-500"
                  />
                  <BreakdownBar
                    label="安全性"
                    sublabel="財務体質"
                    value={data.breakdown.safety}
                    max={40}
                    color="bg-blue-500"
                  />
                  <BreakdownBar
                    label="効率性"
                    sublabel="資産活用"
                    value={data.breakdown.efficiency}
                    max={20}
                    color="bg-purple-500"
                  />
                </div>
              </div>

              <div className="flex h-full flex-col rounded-md border bg-muted/10 p-3">
                <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                  レーダーチャート (各指標の達成度 %)
                </div>
                <div className="min-h-[320px] w-full flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart
                      data={HEALTH_SCORE_DETAIL_META.map((meta) => {
                        const score =
                          data.breakdown.detail[meta.detailKey] ?? 0;
                        return {
                          axis: meta.label.replace(/\s.*$/, ""),
                          value: Math.max(0, Math.min(100, (score / meta.max) * 100)),
                        };
                      })}
                      outerRadius="78%"
                    >
                      <PolarGrid stroke="var(--color-border)" />
                      <PolarAngleAxis
                        dataKey="axis"
                        tick={{ fontSize: 10, fill: "var(--color-text-secondary)" }}
                      />
                      <PolarRadiusAxis
                        angle={90}
                        domain={[0, 100]}
                        tick={false}
                        axisLine={false}
                      />
                      <Radar
                        name="達成度"
                        dataKey="value"
                        stroke="var(--color-primary)"
                        fill="var(--color-primary)"
                        fillOpacity={0.3}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* 下段: 8 指標の値・スコア・ヒント */}
            <div className="rounded-md border bg-muted/10 p-4">
              <div className="mb-2 text-[11px] font-medium text-muted-foreground">
                スコアの根拠 (8 指標の内訳)
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {(["activity", "safety", "efficiency"] as const).map(
                  (group) => {
                    const items = HEALTH_SCORE_DETAIL_META.filter(
                      (m) => m.group === group,
                    );
                    const groupLabel = items[0]?.groupLabel ?? "";
                    return (
                      <div key={group}>
                        <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                          {groupLabel}
                        </div>
                        <div className="space-y-1.5">
                          {items.map((meta) => (
                            <ScoreDetailRow
                              key={meta.detailKey}
                              label={meta.label}
                              hint={meta.hint}
                              indicatorValue={meta.format(
                                data.indicators[meta.indicatorKey] ?? 0,
                              )}
                              score={data.breakdown.detail[meta.detailKey] ?? 0}
                              max={meta.max}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </div>

            {/* AI 質問 5 問 */}
            {isGeneratingAi ? (
              <ThinkingIndicator
                stages={[
                  "指標を取得中",
                  "業種特性を参照中",
                  "AI CFO が考察中",
                  "問いを整理中",
                ]}
              />
            ) : data.aiQuestions.length > 0 ? (
              <div className="rounded-md bg-[var(--color-primary)]/5 p-3">
                <div className="mb-1.5 text-xs font-medium text-[var(--color-text-primary)]">
                  AI CFO からの今月の論点
                </div>
                <ol className="space-y-1 text-xs text-[var(--color-text-primary)]">
                  {data.aiQuestions.map((q, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-muted-foreground">{i + 1}.</span>
                      <span>{q}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                AI 質問は未生成です。「AI 質問生成」ボタンで作成できます (LLM トークン消費あり、20-40 秒程度)。
              </div>
            )}
          </div>
        )}

        {refreshMutation.isError && (
          <p className="mt-2 text-xs text-red-600">
            再計算に失敗しました: {String(refreshMutation.error)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BreakdownBar({
  label,
  sublabel,
  value,
  max,
  color,
}: {
  label: string;
  sublabel?: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex-1">
      <div className="mb-0.5 flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">
          {label}
          {sublabel && (
            <span className="ml-1 text-[10px] text-muted-foreground/70">
              ({sublabel})
            </span>
          )}
        </span>
        <span className="text-xs font-medium tabular-nums">
          {value.toFixed(1)}
          <span className="text-muted-foreground">/{max}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ScoreDetailRow({
  label,
  hint,
  indicatorValue,
  score,
  max,
}: {
  label: string;
  hint: string;
  indicatorValue: string;
  score: number;
  max: number;
}) {
  const ratio = max > 0 ? score / max : 0;
  const scoreColor =
    ratio >= 0.75
      ? "text-emerald-600"
      : ratio >= 0.5
        ? "text-amber-600"
        : "text-red-600";
  return (
    <div className="text-xs">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[var(--color-text-primary)]">
          {label}
        </span>
        <div className="flex shrink-0 items-baseline gap-3">
          <span className="font-medium tabular-nums">{indicatorValue}</span>
          <span
            className={cn(
              "min-w-[52px] text-right font-medium tabular-nums",
              scoreColor,
            )}
          >
            {score.toFixed(1)}
            <span className="text-muted-foreground/70">/{max}</span>
          </span>
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground/80">{hint}</div>
    </div>
  );
}
