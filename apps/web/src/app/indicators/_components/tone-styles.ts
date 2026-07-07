import type { JudgmentTone } from "./derive-overview";

/**
 * tone → Tailwind クラスの写像。既存トークン（--color-success/warning/error）と
 * 既存カード配色（#e8f5e9 / #fff8e1 / #fce4ec, 注意テキスト #8d6e00）に揃える。
 * 新しい原色は持ち込まない。
 */

export const TONE_LABEL: Record<JudgmentTone, string> = {
  good: "良好",
  caution: "注意",
  warning: "要改善",
};

/** 状態ドット / スケールバーのマーカー（濃色ソリッド）。 */
export const TONE_SOLID_BG: Record<JudgmentTone, string> = {
  good: "bg-[var(--color-success)]",
  caution: "bg-[var(--color-warning)]",
  warning: "bg-[var(--color-error)]",
};

/** 文字色。注意だけは薄背景上での可読性のため濃いアンバーを使う。 */
export const TONE_TEXT: Record<JudgmentTone, string> = {
  good: "text-[var(--color-success)]",
  caution: "text-[#8d6e00]",
  warning: "text-[var(--color-error)]",
};

/** カード左端の状態アクセントボーダー色（border-l-4 と併用）。 */
export const TONE_ACCENT_BORDER: Record<JudgmentTone, string> = {
  good: "border-l-[var(--color-success)]",
  caution: "border-l-[var(--color-warning)]",
  warning: "border-l-[var(--color-error)]",
};

/** ヒーローの総合判定ボックス等に使う淡いトーン背景。 */
export const TONE_SOFT_BG: Record<JudgmentTone, string> = {
  good: "bg-[#e8f5e9]",
  caution: "bg-[#fff8e1]",
  warning: "bg-[#fce4ec]",
};

export const TONE_SOFT_BORDER: Record<JudgmentTone, string> = {
  good: "border-green-200",
  caution: "border-amber-200",
  warning: "border-red-200",
};

/** ゾーンスケールバーの各ゾーン（淡色塗り）。 */
export const ZONE_BG: Record<JudgmentTone, string> = {
  good: "bg-green-100",
  caution: "bg-amber-100",
  warning: "bg-red-100",
};
