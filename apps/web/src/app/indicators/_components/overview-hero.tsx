import { cn } from "@/lib/utils";
import { AlertCircle, AlertTriangle, CheckCircle2, type LucideIcon } from "lucide-react";
import type { HealthSnapshotItem } from "@/lib/api";
import type { CategoryKey, JudgmentTone, OverviewResult } from "./derive-overview";
import { CATEGORY_META } from "./indicator-defs";
import { PRINT_EXACT_CLASS, SEMANTIC_COLOR } from "./indicator-tokens";
import { TONE_SOFT_BG_STYLE, TONE_TEXT_STYLE } from "./tone-styles";
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
 * ニュートラル面（bg-surface）+ 左 4px の状態アクセント。総合判定アイコンは淡色の丸チップに収め、
 * 面塗り（ピンク等）は使わない。件数は色ドット + 数字のコンパクトチップ。
 * カテゴリチップ（スクロールジャンプ）と健康スコアスパークラインは維持。狭幅では flex-wrap で折り返す。
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
    <div
      className={cn(
        "rounded-lg border border-l-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4",
        PRINT_EXACT_CLASS,
      )}
      style={{ borderLeftColor: SEMANTIC_COLOR[overview.overall] }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        {/* 総合判定: 淡色チップのアイコン + ラベル */}
        <div className="flex items-center gap-3 lg:min-w-[220px]">
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
              PRINT_EXACT_CLASS,
            )}
            style={TONE_SOFT_BG_STYLE[overview.overall]}
          >
            <OverallIcon className="h-6 w-6" style={TONE_TEXT_STYLE[overview.overall]} />
          </span>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
              総合判定
            </div>
            <div
              className="text-xl font-bold leading-tight"
              style={TONE_TEXT_STYLE[overview.overall]}
            >
              {overview.overallLabel}
            </div>
            <div className="text-[11px] text-[var(--color-text-secondary)]">
              {OVERALL_SUB[overview.overall]}
            </div>
          </div>
        </div>

        {/* カテゴリ別ステータスチップ（クリックでパネルへスクロール） */}
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
                  className={cn("h-2.5 w-2.5 rounded-full", PRINT_EXACT_CLASS)}
                  style={
                    tone
                      ? { backgroundColor: SEMANTIC_COLOR[tone] }
                      : { backgroundColor: "var(--color-text-disabled)" }
                  }
                />
                <span className="font-medium text-[var(--color-text-primary)]">{meta.label}</span>
              </button>
            );
          })}
        </div>

        {/* 件数（色ドット + 数字のコンパクトチップ）+ 期間 + 健康スコア */}
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <div className="flex flex-wrap items-center gap-2">
            {counts.map((c) => (
              <span
                key={c.tone}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs"
              >
                <span
                  className={cn("h-2 w-2 rounded-full", PRINT_EXACT_CLASS)}
                  style={{ backgroundColor: SEMANTIC_COLOR[c.tone] }}
                />
                <span className="text-[var(--color-text-secondary)]">{c.label}</span>
                <span className="font-bold tabular-nums text-[var(--color-text-primary)]">
                  {c.n}
                </span>
              </span>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">{periodLabel || "期間未指定"}</div>
          <HealthSparkline history={healthHistory} />
        </div>
      </div>
    </div>
  );
}
