import { cn } from "@/lib/utils";
import { AlertCircle, AlertTriangle, CheckCircle2, type LucideIcon } from "lucide-react";
import type { HealthSnapshotItem } from "@/lib/api";
import type { CategoryKey, JudgmentTone, OverviewResult } from "./derive-overview";
import { CATEGORY_META } from "./indicator-defs";
import { TONE_SOFT_BG, TONE_SOFT_BORDER, TONE_SOLID_BG, TONE_TEXT } from "./tone-styles";
import { HealthSparkline } from "./health-sparkline";

const OVERALL_ICON: Record<JudgmentTone, LucideIcon> = {
  good: CheckCircle2,
  caution: AlertTriangle,
  warning: AlertCircle,
};

const OVERALL_SUB: Record<JudgmentTone, string> = {
  good: "全指標が目安をクリア",
  caution: "一部に注意が必要",
  warning: "要改善の指標あり",
};

const CATEGORY_ORDER: CategoryKey[] = ["safety", "profit", "efficiency"];

function scrollToPanel(anchorId: string) {
  document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * ページ最上部のヒーローバンド。
 * 左=総合判定 / 中=カテゴリ別ステータスチップ / 右=件数・期間・健康スコア。
 */
export function OverviewHero({
  overview,
  periodLabel,
  healthHistory,
}: {
  overview: OverviewResult;
  periodLabel: string;
  healthHistory?: HealthSnapshotItem[];
}) {
  const OverallIcon = OVERALL_ICON[overview.overall];

  const counts: { tone: JudgmentTone; label: string; n: number }[] = [
    { tone: "good", label: "良好", n: overview.counts.good },
    { tone: "caution", label: "注意", n: overview.counts.caution },
    { tone: "warning", label: "要改善", n: overview.counts.warning },
  ];

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        {/* 総合判定 */}
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg border px-4 py-3 lg:min-w-[240px]",
            TONE_SOFT_BG[overview.overall],
            TONE_SOFT_BORDER[overview.overall],
          )}
        >
          <OverallIcon className={cn("h-8 w-8 shrink-0", TONE_TEXT[overview.overall])} />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
              総合判定
            </div>
            <div className={cn("text-xl font-bold leading-tight", TONE_TEXT[overview.overall])}>
              {overview.overallLabel}
            </div>
            <div className="text-[11px] text-[var(--color-text-secondary)]">
              {OVERALL_SUB[overview.overall]}
            </div>
          </div>
        </div>

        {/* カテゴリ別ステータスチップ */}
        <div className="flex flex-wrap gap-2 lg:flex-1">
          {CATEGORY_ORDER.map((key) => {
            const meta = CATEGORY_META[key];
            const tone = overview.categories[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => scrollToPanel(meta.anchorId)}
                className="group flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm transition-colors hover:border-[var(--color-text-secondary)] hover:bg-[var(--color-background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                title={`${meta.label}のパネルへ移動`}
              >
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    tone ? TONE_SOLID_BG[tone] : "bg-[var(--color-text-disabled)]",
                  )}
                />
                <span className="font-medium text-[var(--color-text-primary)]">{meta.label}</span>
              </button>
            );
          })}
        </div>

        {/* 件数 + 期間 + 健康スコア */}
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <div className="flex items-center gap-3">
            {counts.map((c) => (
              <div key={c.tone} className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", TONE_SOLID_BG[c.tone])} />
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {c.label}
                  <span className="ml-1 font-bold tabular-nums text-[var(--color-text-primary)]">
                    {c.n}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">{periodLabel || "期間未指定"}</div>
          <HealthSparkline history={healthHistory} />
        </div>
      </div>
    </div>
  );
}
