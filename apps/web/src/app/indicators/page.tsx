"use client";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Gauge, Shield, TrendingUp, Zap } from "lucide-react";
import {
  useMfFinancialIndicators,
  useMfOffice,
} from "@/hooks/use-mf-data";
import { useQuery } from "@tanstack/react-query";
import { useCurrentOrg } from "@/contexts/current-org";
import { api } from "@/lib/api";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";
import { PrintButton } from "@/components/ui/print-button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MfEmptyState } from "@/components/ui/mf-empty-state";

import {
  safetyIndicators,
  profitIndicators,
  efficiencyIndicators,
  CATEGORY_META,
} from "./_components/indicator-defs";
import {
  categoryScore,
  deriveOverview,
  getJudgment,
  JUDGMENT_LABEL,
  type IndicatorDef,
  type Judgment,
  type JudgmentTone,
  type OverviewItem,
} from "./_components/derive-overview";
import type { FinancialIndicators } from "@/lib/mf-types";
import { OverviewHero } from "./_components/overview-hero";
import { CategoryPanel } from "./_components/category-panel";
import { IndicatorCard } from "./_components/indicator-card";
import { AiCfoBlock } from "./_components/ai-commentary";

/**
 * カテゴリのゲージ表示値を導出する。
 *  - 針スコア = categoryScore（良好100/注意50/要改善0 の平均）
 *  - 中央 pill = カテゴリの最悪判定（deriveOverview のカテゴリ集計を単一の真実点として流用）
 * 両者は役割が異なり意図的に食い違い得る（derive-overview の categoryScore 参照）。
 */
function deriveCategoryGauge(
  defs: IndicatorDef[],
  data: FinancialIndicators,
  worstTone: JudgmentTone | null,
): { score: number; judgment: Judgment } {
  const score = categoryScore(defs.map((def) => getJudgment(def, data[def.key] || 0)));
  const tone = worstTone ?? "good";
  return { score, judgment: { label: JUDGMENT_LABEL[tone], tone } };
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

  // 健康スコア履歴（12ヶ月）。既存 healthSnapshot クライアントを流用。
  // 権限・データ無しで失敗しても黙って非表示にするため retry しない。
  const healthHistory = useQuery({
    queryKey: ["health-snapshot", "history", orgId, 12],
    queryFn: () => api.healthSnapshot.history(orgId, 12),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // 売上総利益率は原価計算前提の指標。OFF の場合は profit 系から除外
  const visibleProfitIndicators = usesCostAccounting
    ? profitIndicators
    : profitIndicators.filter((d) => d.key !== "grossProfitMargin");

  // 総合判定・カテゴリ集計は表示中の指標から純関数で導出
  const overviewItems: OverviewItem[] = data
    ? [...safetyIndicators, ...visibleProfitIndicators, ...efficiencyIndicators].map((def) => ({
        def,
        value: data[def.key] || 0,
      }))
    : [];
  const overview = deriveOverview(overviewItems);

  // カテゴリごとのゲージ表示値（針スコア + 最悪判定 pill）
  const safetyGauge = data
    ? deriveCategoryGauge(safetyIndicators, data, overview.categories.safety)
    : null;
  const profitGauge = data
    ? deriveCategoryGauge(visibleProfitIndicators, data, overview.categories.profit)
    : null;
  const efficiencyGauge = data
    ? deriveCategoryGauge(efficiencyIndicators, data, overview.categories.efficiency)
    : null;

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
                <h1 className="text-xl font-bold text-[var(--color-text-primary)]">財務指標</h1>
                <p className="text-sm text-muted-foreground">主要な財務指標と判定結果</p>
              </div>
            </div>
            <PrintButton />
          </div>

          {indicators.isLoading ? (
            <div className="space-y-4">
              <div className="h-24 animate-pulse rounded-lg bg-muted" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            </div>
          ) : !data ? (
            <MfEmptyState />
          ) : (
            <>
              {/* ヒーローバンド（総合判定 / カテゴリチップ / 件数・健康スコア） */}
              <OverviewHero
                overview={overview}
                periodLabel={periodLabel}
                healthHistory={healthHistory.data ?? undefined}
              />

              {/* カテゴリ二段構え: 各カラム = ゲージカード + 直下に指標カード縦積み。
                  1カラム(base) → 2カラム(md, 効率性が2段目) → 3カラム(xl) */}
              <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                {safetyGauge && (
                  <CategoryPanel
                    id={CATEGORY_META.safety.anchorId}
                    title={CATEGORY_META.safety.label}
                    icon={Shield}
                    iconClassName="text-blue-600"
                    score={safetyGauge.score}
                    judgment={safetyGauge.judgment}
                  >
                    {safetyIndicators.map((def) => (
                      <IndicatorCard key={def.key} def={def} value={data[def.key] || 0} />
                    ))}
                  </CategoryPanel>
                )}

                {profitGauge && (
                  <CategoryPanel
                    id={CATEGORY_META.profit.anchorId}
                    title={CATEGORY_META.profit.label}
                    icon={TrendingUp}
                    iconClassName="text-green-600"
                    score={profitGauge.score}
                    judgment={profitGauge.judgment}
                    note={
                      !usesCostAccounting ? (
                        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          原価計算が未設定のため、売上総利益率は表示していません（中小企業では実態と乖離しやすい指標のため）。設定 → 分析設定 で「原価計算を運用している」を ON にすると表示されます。
                        </p>
                      ) : null
                    }
                  >
                    {visibleProfitIndicators.map((def) => (
                      <IndicatorCard key={def.key} def={def} value={data[def.key] || 0} />
                    ))}
                  </CategoryPanel>
                )}

                {efficiencyGauge && (
                  <CategoryPanel
                    id={CATEGORY_META.efficiency.anchorId}
                    title={CATEGORY_META.efficiency.label}
                    icon={Zap}
                    iconClassName="text-amber-600"
                    score={efficiencyGauge.score}
                    judgment={efficiencyGauge.judgment}
                  >
                    {efficiencyIndicators.map((def) => (
                      <IndicatorCard key={def.key} def={def} value={data[def.key] || 0} />
                    ))}
                  </CategoryPanel>
                )}
              </div>

              {/* AI CFO 解説（画面下部、ボタン押下式） */}
              <AiCfoBlock />
            </>
          )}
        </div>
      </TooltipProvider>
    </DashboardShell>
  );
}
