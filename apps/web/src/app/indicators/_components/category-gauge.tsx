import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { Judgment } from "./derive-overview";
import {
  GAUGE,
  GAUGE_TICKS,
  PRINT_EXACT_CLASS,
  SEMANTIC_COLOR,
  SLATE,
} from "./indicator-tokens";
import { TONE_PILL_STYLE } from "./tone-styles";

/**
 * カテゴリのスピードメーター（依存追加なしの自作 SVG）。
 *
 * - 半円（180°）の色帯を 3 分割: 0-40=レッド / 40-75=アンバー / 75-100=グリーン。
 *   全帯ソリッド + 針を濃いスレートにする方式を採用（薄塗り+現在ゾーン強調より視認性が高い）。
 * - 針（score を指す）と、中央の状態 pill（カテゴリの最悪判定）は役割が異なる。
 *   針=スコア（categoryScore）/ pill=最悪判定（judgment）。両者は意図的に食い違い得る。
 * - 印刷でも色が飛ばないよう帯・針・pill に print-color-adjust:exact を局所付与。
 */

const { cx, cy, r, band, needleLen, needleRoot, tickLen, viewW, viewH } = GAUGE;

function clampScore(s: number): number {
  return Math.min(100, Math.max(0, s));
}

/** score(0-100) → 半円上の座標。0=左端(180°) / 100=右端(0°) / 50=天頂(90°)。 */
function pointAt(score: number, radius: number): { x: number; y: number } {
  const a = Math.PI * (1 - clampScore(score) / 100);
  return { x: cx + radius * Math.cos(a), y: cy - radius * Math.sin(a) };
}

const n = (v: number) => Math.round(v * 100) / 100;

/** score s0→s1 の円弧パス（半円の上側、時計回り）。 */
function arcPath(s0: number, s1: number, radius: number): string {
  const p0 = pointAt(s0, radius);
  const p1 = pointAt(s1, radius);
  return `M ${n(p0.x)} ${n(p0.y)} A ${radius} ${radius} 0 0 1 ${n(p1.x)} ${n(p1.y)}`;
}

// 全帯を butt キャップで隣接させる（round にすると内側の境界で隣帯に食い込むため）。
// 端は角丸を諦めた素直なセグメント表現にして境界の視認性を優先する。
const BANDS: { from: number; to: number; color: string }[] = [
  { from: 0, to: GAUGE.redMax, color: SEMANTIC_COLOR.warning },
  { from: GAUGE.redMax, to: GAUGE.amberMax, color: SEMANTIC_COLOR.caution },
  { from: GAUGE.amberMax, to: 100, color: SEMANTIC_COLOR.good },
];

export function CategoryGauge({
  title,
  icon: Icon,
  iconClassName,
  score,
  judgment,
}: {
  title: string;
  icon: LucideIcon;
  iconClassName?: string;
  score: number;
  judgment: Judgment;
}) {
  const value = clampScore(score);
  const needleTip = pointAt(value, needleLen);
  const ariaLabel = `${title}スコア${value}、${judgment.label}`;

  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]",
        "p-4",
      )}
    >
      {/* ヘッダー: アイコン + カテゴリ名 */}
      <div className="mb-1 flex items-center gap-2">
        <Icon className={cn("h-5 w-5", iconClassName)} />
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
      </div>

      {/* スピードメーター本体 */}
      <div className="flex flex-col items-center">
        <svg
          viewBox={`0 0 ${viewW} ${viewH}`}
          className={cn("w-full max-w-[280px]", PRINT_EXACT_CLASS)}
          role="img"
          aria-label={ariaLabel}
        >
          {/* 3 色帯（全帯ソリッド、butt キャップで隣接） */}
          {BANDS.map((b) => (
            <path
              key={b.from}
              d={arcPath(b.from, b.to, r)}
              fill="none"
              stroke={b.color}
              strokeWidth={band}
              strokeLinecap="butt"
            />
          ))}

          {/* 目盛り（0 / 40 / 75 / 100、帯の外側に小ティック） */}
          {GAUGE_TICKS.map((t) => {
            const inner = pointAt(t, r + band / 2);
            const outer = pointAt(t, r + band / 2 + tickLen);
            return (
              <line
                key={t}
                x1={n(inner.x)}
                y1={n(inner.y)}
                x2={n(outer.x)}
                y2={n(outer.y)}
                stroke={SLATE.tick}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            );
          })}

          {/* 針 + 根本ドット（濃いスレート） */}
          <line
            x1={cx}
            y1={cy}
            x2={n(needleTip.x)}
            y2={n(needleTip.y)}
            stroke={SLATE.needle}
            strokeWidth={3.5}
            strokeLinecap="round"
          />
          <circle cx={cx} cy={cy} r={needleRoot} fill={SLATE.needle} />
        </svg>

        {/* 中央下: スコア数値 + 状態 pill（半円の空きに引き上げる） */}
        <div className="-mt-7 flex flex-col items-center gap-1">
          <div
            className="text-3xl font-bold tabular-nums leading-none text-[var(--color-text-primary)]"
            aria-hidden="true"
          >
            {value}
          </div>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              PRINT_EXACT_CLASS,
            )}
            style={TONE_PILL_STYLE[judgment.tone]}
          >
            {judgment.label}
          </span>
        </div>
      </div>
    </div>
  );
}
