"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Bot,
  Gauge,
  HelpCircle,
  RefreshCw,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  useAiIndicatorsCommentary,
  useMfFinancialIndicators,
  useMfOffice,
} from "@/hooks/use-mf-data";
import { useQuery } from "@tanstack/react-query";
import { useCurrentOrg } from "@/contexts/current-org";
import { api } from "@/lib/api";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";
import { PrintButton } from "@/components/ui/print-button";
import { Button } from "@/components/ui/button";
import type { FinancialIndicators } from "@/lib/mf-types";

type IndicatorKey = keyof FinancialIndicators;

interface IndicatorHelp {
  /** 計算式 */
  formula: string;
  /** 何を測っているか（1-2文） */
  meaning: string;
  /** 目安・判定基準 */
  benchmark: string;
  /** 解釈の注意点（任意） */
  caveat?: string;
}

interface IndicatorDef {
  key: IndicatorKey;
  label: string;
  unit: string;
  good: number;
  caution: number;
  higherIsBetter: boolean;
  help: IndicatorHelp;
}

const safetyIndicators: IndicatorDef[] = [
  {
    key: "currentRatio",
    label: "流動比率",
    unit: "%",
    good: 200,
    caution: 100,
    higherIsBetter: true,
    help: {
      formula: "流動資産 ÷ 流動負債 × 100",
      meaning: "1年以内に現金化できる資産で、1年以内に支払う負債をどれだけカバーできるかを示す短期支払能力の指標。",
      benchmark: "200%以上=良好、100%未満=資金繰りに警戒、150%前後が業種平均の目安。",
      caveat: "在庫や未回収売掛金が多いと数字は良く見えても実際の支払能力は低いことがある。当座比率(流動資産から在庫を除いたもの÷流動負債)も合わせて確認推奨。",
    },
  },
  {
    key: "equityRatio",
    label: "自己資本比率",
    unit: "%",
    good: 40,
    caution: 20,
    higherIsBetter: true,
    help: {
      formula: "純資産 ÷ 総資産 × 100",
      meaning: "総資産のうち、返済不要の自己資本がどれだけを占めるか。財務基盤の安定性・倒産リスクの低さを示す。",
      benchmark: "40%以上=良好、20%未満=警戒、中小企業全体平均は約30%、製造業は40%超が一般的。",
      caveat: "高ければ良いというだけではなく、過剰な内部留保で投資機会を逸している場合もある。ROEとあわせて見るのが基本。",
    },
  },
  {
    key: "debtEquityRatio",
    label: "負債比率",
    unit: "%",
    good: 100,
    caution: 200,
    higherIsBetter: false,
    help: {
      formula: "負債 ÷ 純資産 × 100",
      meaning: "自己資本に対して何倍の負債を抱えているか。低いほど財務的に健全。",
      benchmark: "100%以下=良好、200%超=注意、300%超は財務リスク高め。",
      caveat: "純資産がマイナス(債務超過)の場合は計算不能となるため、自己資本比率とセットで判断する。",
    },
  },
];

const profitIndicators: IndicatorDef[] = [
  {
    key: "grossProfitMargin",
    label: "売上総利益率",
    unit: "%",
    good: 40,
    caution: 20,
    higherIsBetter: true,
    help: {
      formula: "(売上 − 売上原価) ÷ 売上 × 100",
      meaning: "売上からどれだけ粗利を生み出せているか。商品・サービス自体の収益力を示す。",
      benchmark: "業種により大きく異なる。製造業20-30%、小売業20-40%、サービス業40-60%、SaaS70%超が目安。",
      caveat: "業界平均と比較するのが必須。同業他社や前年同月比で見ないと水準感がつかめない。",
    },
  },
  {
    key: "operatingProfitMargin",
    label: "営業利益率",
    unit: "%",
    good: 10,
    caution: 3,
    higherIsBetter: true,
    help: {
      formula: "営業利益 ÷ 売上 × 100",
      meaning: "本業から1円の売上を上げるごとにいくら利益が残るか。事業そのものの収益力。",
      benchmark: "全業種平均3-5%、製造業4-6%、SaaS優良企業20%超、10%超は優秀の目安。",
      caveat: "粗利率は高くても販管費が重いと営業利益率は低くなる。販管費の内訳(人件費・家賃・広告費)も確認する。",
    },
  },
  {
    key: "roe",
    label: "ROE (自己資本利益率)",
    unit: "%",
    good: 10,
    caution: 5,
    higherIsBetter: true,
    help: {
      formula: "純利益 ÷ 純資産 × 100",
      meaning: "株主が投じた資本に対してどれだけ利益を生み出しているか。投資家の効率指標。",
      benchmark: "10%超=良好、東証上場企業平均は8-10%、20%超は高効率企業。",
      caveat: "借入を増やして自己資本を圧縮するとROEは上がるので、自己資本比率と必ずセットで見る。純資産がマイナスなら計算意義なし。",
    },
  },
  {
    key: "roa",
    label: "ROA (総資産利益率)",
    unit: "%",
    good: 5,
    caution: 2,
    higherIsBetter: true,
    help: {
      formula: "純利益 ÷ 総資産 × 100",
      meaning: "保有している資産全体(自己資本+他人資本)からどれだけ利益を生み出しているか。",
      benchmark: "5%超=良好、上場企業平均は3-5%、製造業3-4%、サービス業6-8%。",
      caveat: "ROEは借入レバレッジで膨らむが、ROAは資本構成に左右されないため事業の本質的な効率を測れる。",
    },
  },
];

const efficiencyIndicators: IndicatorDef[] = [
  {
    key: "totalAssetTurnover",
    label: "総資産回転率",
    unit: "回",
    good: 1.0,
    caution: 0.5,
    higherIsBetter: true,
    help: {
      formula: "売上 ÷ 総資産",
      meaning: "保有資産で年間に何回売上を作れているか。資産の有効活用度を示す。",
      benchmark: "1.0回以上=良好、製造業0.8-1.2回、小売業1.5-3回、不動産業0.2-0.5回など業種差が大きい。",
      caveat: "在庫過多・遊休固定資産・回収遅延の売掛金などで分母が膨らむと数字が低く出る。改善余地のヒントになる。",
    },
  },
  {
    key: "receivablesTurnover",
    label: "売上債権回転率",
    unit: "回",
    good: 6,
    caution: 4,
    higherIsBetter: true,
    help: {
      formula: "売上 ÷ 売掛金",
      meaning: "売掛金が年間で何回回収されているか。回収サイクルの効率を示す。",
      benchmark: "12回以上(月次回収)=良好、6回以上=標準、4回未満は回収遅延の可能性。",
      caveat: "12 ÷ この値 = 平均回収日数(月)。例: 6回なら平均2ヶ月後回収。回収サイトを延ばされている顧客がないか確認推奨。",
    },
  },
];

function getJudgment(def: IndicatorDef, value: number): { label: string; color: string } {
  if (def.higherIsBetter) {
    if (value >= def.good) return { label: "良好", color: "bg-[#e8f5e9] text-[var(--color-success)] border-green-300" };
    if (value >= def.caution) return { label: "注意", color: "bg-[#fff8e1] text-[#8d6e00] border-amber-300" };
    return { label: "要改善", color: "bg-[#fce4ec] text-[var(--color-error)] border-red-300" };
  } else {
    // 負の値は分母(純資産など)が負であることを示し、良好とは扱わない
    if (value < 0) return { label: "要改善", color: "bg-[#fce4ec] text-[var(--color-error)] border-red-300" };
    if (value <= def.good) return { label: "良好", color: "bg-[#e8f5e9] text-[var(--color-success)] border-green-300" };
    if (value <= def.caution) return { label: "注意", color: "bg-[#fff8e1] text-[#8d6e00] border-amber-300" };
    return { label: "要改善", color: "bg-[#fce4ec] text-[var(--color-error)] border-red-300" };
  }
}

function getProgressPercent(def: IndicatorDef, value: number): number {
  if (def.higherIsBetter) {
    // good以上 → 100%, caution → 50%, 0 → 0%
    const max = def.good * 1.5;
    return Math.min(100, Math.max(0, (value / max) * 100));
  } else {
    // 0 → 100%, good → 66%, caution → 33%, 超過 → 低い
    const max = def.caution * 1.5;
    return Math.min(100, Math.max(0, ((max - value) / max) * 100));
  }
}


function getProgressColor(def: IndicatorDef, value: number): string {
  const judgment = getJudgment(def, value);
  if (judgment.label === "良好") return "bg-[var(--color-success)]";
  if (judgment.label === "注意") return "bg-[#f9a825]";
  return "bg-[var(--color-error)]";
}

import { MfEmptyState } from "@/components/ui/mf-empty-state";

function IndicatorCard({
  def,
  value,
}: {
  def: IndicatorDef;
  value: number;
}) {
  const judgment = getJudgment(def, value);
  const progress = getProgressPercent(def, value);
  const progressColor = getProgressColor(def, value);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="text-sm font-medium text-[var(--color-text-primary)]">
              {def.label}
            </div>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={`${def.label}の説明`}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/70 hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                }
              />
              <TooltipContent
                side="top"
                className="max-w-sm whitespace-normal bg-[var(--color-text-primary)] p-3 text-left text-[11px] leading-relaxed"
              >
                <div className="space-y-2">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-background/60">計算式</div>
                    <div className="font-[family-name:var(--font-inter)]">{def.help.formula}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-background/60">意味</div>
                    <div>{def.help.meaning}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-background/60">目安</div>
                    <div>{def.help.benchmark}</div>
                  </div>
                  {def.help.caveat && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-background/60">注意点</div>
                      <div>{def.help.caveat}</div>
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
          <Badge className={cn("border text-xs", judgment.color)}>
            {judgment.label}
          </Badge>
        </div>
        <div className="text-2xl font-bold text-[var(--color-text-primary)]">
          {value.toFixed(1)}
          <span className="text-sm font-normal text-muted-foreground ml-1">
            {def.unit}
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-gray-100">
          <div
            className={cn("h-full rounded-full transition-all", progressColor)}
            style={{ width: `${progress}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * AI CFO 解説カード。
 * 安全性 / 収益性 / 効率性 の 3 カテゴリそれぞれに level バッジと
 * summary / advice を並べる。LLM 未設定時の fallback も表示できる。
 */
function AiCommentaryCard() {
  // useAiIndicatorsCommentary は render 時点で fetch する。「ボタン押下式」は
  // 親 page で {aiTriggered && <AiCommentaryCard />} の条件付き render で制御する。
  const commentary = useAiIndicatorsCommentary();

  const levelBadge: Record<
    "good" | "caution" | "warning",
    { label: string; className: string }
  > = {
    good: { label: "良好", className: "bg-[#e8f5e9] text-[var(--color-success)] border-[#c8e6c9]" },
    caution: { label: "注意", className: "bg-[#fff8e1] text-[#8d6e00] border-[#ffe082]" },
    warning: { label: "要対応", className: "bg-[#fce4ec] text-[var(--color-error)] border-[#f8bbd0]" },
  };

  return (
    <Card className="border-[var(--color-border)]">
      <CardContent className="p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-[var(--color-primary)]" />
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                AI CFO 解説
              </h2>
              <p className="text-xs text-muted-foreground">
                財務指標を CFO 視点で総評
                {commentary.data?.generatedAt && (
                  <>
                    {" / 生成: "}
                    {new Date(commentary.data.generatedAt).toLocaleString("ja-JP", {
                      hour: "2-digit",
                      minute: "2-digit",
                      month: "numeric",
                      day: "numeric",
                    })}
                  </>
                )}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => commentary.refetch()}
            disabled={commentary.isFetching}
            className="h-8 gap-1.5 px-2.5 text-xs"
            title="再生成"
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                commentary.isFetching && "animate-spin",
              )}
            />
            再生成
          </Button>
        </div>

        {commentary.isLoading ? (
          <div className="space-y-3">
            <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          </div>
        ) : commentary.isError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            AI 解説の取得に失敗しました。再生成ボタンでリトライしてください。
          </div>
        ) : commentary.data ? (
          <div className="space-y-4">
            {/* 総評 */}
            <div className="rounded-md border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 p-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-primary)]">
                総評
              </div>
              <p className="text-sm leading-relaxed text-[var(--color-text-primary)]">
                {commentary.data.overallSummary}
              </p>
            </div>

            {/* カテゴリ別 */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {commentary.data.categories.map((cat) => {
                const badge = levelBadge[cat.level];
                return (
                  <div
                    key={cat.name}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                        {cat.name}
                      </span>
                      <Badge className={cn("border text-[10px]", badge.className)}>
                        {badge.label}
                      </Badge>
                    </div>
                    <p className="mb-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                      {cat.summary}
                    </p>
                    <div className="border-t border-[var(--color-border)] pt-2">
                      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        打ち手
                      </div>
                      <p className="text-xs leading-relaxed text-[var(--color-text-primary)]">
                        {cat.advice}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {commentary.data.fallbackReason && (
              <p className="text-[10px] text-muted-foreground">
                ※ {commentary.data.fallbackReason}
              </p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}


export default function IndicatorsPage() {
  const indicators = useMfFinancialIndicators();
  const office = useMfOffice();
  const { fiscalYear, month, periods } = usePeriodStore();
  const periodLabel = getPeriodLabel(fiscalYear, month, periods);

  const data = indicators.data;

  // 原価計算トグルを取得。デフォルト false（中小企業は原価計算未運用前提）
  const orgId = useCurrentOrg().currentOrgId ?? "";
  const orgQuery = useQuery({
    queryKey: ["organization", orgId],
    queryFn: () => api.getOrganization(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const usesCostAccounting = orgQuery.data?.usesCostAccounting ?? false;

  // 売上総利益率は原価計算前提の指標。OFF の場合は profit 系から除外
  const visibleProfitIndicators = usesCostAccounting
    ? profitIndicators
    : profitIndicators.filter((d) => d.key !== "grossProfitMargin");

  // AI CFO 解説は重い AI コール。明示的なボタン押下時のみ fetch する。
  const [aiTriggered, setAiTriggered] = useState(false);

  return (
    <DashboardShell>
      <TooltipProvider delay={150}>
      <div className="space-y-4">
        {/* 印刷専用ヘッダー */}
        <div className="print-only" data-print-block>
          <h1 className="text-xl font-bold">財務指標レポート</h1>
          <div className="mt-1 text-sm">
            {office.data?.name || "—"} — {periodLabel || "期間未指定"}
          </div>
          <div className="mt-0.5 text-xs text-gray-600">
            出力日: {new Date().toLocaleDateString("ja-JP")}
          </div>
          <hr className="mt-2" />
        </div>

        {/* ヘッダー */}
        <div className="flex items-center justify-between screen-only">
          <div className="flex items-center gap-3">
            <Gauge className="h-6 w-6 text-[var(--color-tertiary)]" />
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
                財務指標
              </h1>
              <p className="text-sm text-muted-foreground">
                主要な財務指標と判定結果
              </p>
            </div>
          </div>
          <PrintButton />
        </div>

        {indicators.isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : !data ? (
          <MfEmptyState />
        ) : (
        <>
        {/* 安全性 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              安全性
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {safetyIndicators.map((def) => (
              <IndicatorCard
                key={def.key}
                def={def}
                value={data[def.key] || 0}
              />
            ))}
          </div>
        </section>

        {/* 収益性 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              収益性
            </h2>
          </div>
          {!usesCostAccounting && (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              原価計算が未設定のため、売上総利益率は表示していません（中小企業では実態と乖離しやすい指標のため）。設定 → 分析設定 で「原価計算を運用している」を ON にすると表示されます。
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {visibleProfitIndicators.map((def) => (
              <IndicatorCard
                key={def.key}
                def={def}
                value={data[def.key] || 0}
              />
            ))}
          </div>
        </section>

        {/* 効率性 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              効率性
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {efficiencyIndicators.map((def) => (
              <IndicatorCard
                key={def.key}
                def={def}
                value={data[def.key] || 0}
              />
            ))}
          </div>
        </section>

        {/* AI CFO 解説 (画面下部、ボタン押下式)。指標表示の妨げにならないよう最後に配置。 */}
        {!aiTriggered ? (
          <Card className="border-dashed border-[var(--color-secondary)]/40 bg-gradient-to-br from-[#ede7f6]/30 via-white to-white">
            <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
              <Sparkles className="h-8 w-8 text-[var(--color-secondary)]" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                  AI CFO 解説
                </p>
                <p className="text-xs text-muted-foreground">
                  ボタンを押すと AI が安全性 / 収益性 / 効率性の指標を CFO 視点で総評します（数秒〜十数秒）。
                </p>
              </div>
              <Button
                onClick={() => setAiTriggered(true)}
                className="bg-[var(--color-secondary)] text-white hover:bg-[var(--color-secondary)]/90"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                AI 分析を実行
              </Button>
            </CardContent>
          </Card>
        ) : (
          <AiCommentaryCard />
        )}
        </>
        )}
      </div>
      </TooltipProvider>
    </DashboardShell>
  );
}
