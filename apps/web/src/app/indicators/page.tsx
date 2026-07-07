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
import { deriveOverview, type OverviewItem } from "./_components/derive-overview";
import { OverviewHero } from "./_components/overview-hero";
import { CategoryPanel } from "./_components/category-panel";
import { IndicatorCard } from "./_components/indicator-card";
import { AiCfoBlock } from "./_components/ai-commentary";

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

              {/* カテゴリパネル（xl 以上はベントー: 安全性=左1/3 縦, 収益性=右2/3 上, 効率性=右2/3 下） */}
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 xl:items-start">
                <CategoryPanel
                  id={CATEGORY_META.safety.anchorId}
                  title={CATEGORY_META.safety.label}
                  icon={Shield}
                  iconClassName="text-blue-600"
                  tone={overview.categories.safety}
                  className="xl:col-span-1"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
                    {safetyIndicators.map((def) => (
                      <IndicatorCard key={def.key} def={def} value={data[def.key] || 0} />
                    ))}
                  </div>
                </CategoryPanel>

                <div className="space-y-4 xl:col-span-2">
                  <CategoryPanel
                    id={CATEGORY_META.profit.anchorId}
                    title={CATEGORY_META.profit.label}
                    icon={TrendingUp}
                    iconClassName="text-green-600"
                    tone={overview.categories.profit}
                    note={
                      !usesCostAccounting ? (
                        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          原価計算が未設定のため、売上総利益率は表示していません（中小企業では実態と乖離しやすい指標のため）。設定 → 分析設定 で「原価計算を運用している」を ON にすると表示されます。
                        </p>
                      ) : null
                    }
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {visibleProfitIndicators.map((def) => (
                        <IndicatorCard key={def.key} def={def} value={data[def.key] || 0} />
                      ))}
                    </div>
                  </CategoryPanel>

                  <CategoryPanel
                    id={CATEGORY_META.efficiency.anchorId}
                    title={CATEGORY_META.efficiency.label}
                    icon={Zap}
                    iconClassName="text-amber-600"
                    tone={overview.categories.efficiency}
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {efficiencyIndicators.map((def) => (
                        <IndicatorCard key={def.key} def={def} value={data[def.key] || 0} />
                      ))}
                    </div>
                  </CategoryPanel>
                </div>
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
