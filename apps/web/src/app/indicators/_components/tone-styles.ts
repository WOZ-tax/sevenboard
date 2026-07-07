import type { CSSProperties } from "react";
import type { Judgment, JudgmentTone } from "./derive-overview";
import { JUDGMENT_LABEL } from "./derive-overview";
import { SEMANTIC_COLOR, SEMANTIC_SOFT_BG, SEMANTIC_TEXT } from "./indicator-tokens";

/**
 * tone → inline style（React.CSSProperties）の写像。
 *
 * 色「値」の真実点は indicator-tokens.ts にあり、ここはそれを束ねるだけ（重複定義を持たない）。
 * className の Tailwind 任意値（bg-[var(--…)] 等）は JIT が文字列リテラルを検出する必要があり、
 * 定数から動的合成できない。そのため tone 着色は inline style に統一している。
 *
 * 印刷での塗り欠けは PRINT_EXACT_CLASS（indicator-tokens）を className 側で局所付与して防ぐ。
 */

/** tone → 日本語ラベル（良好 / 注意 / 要改善）。derive-overview の正準写像を再輸出。 */
export const TONE_LABEL: Record<JudgmentTone, Judgment["label"]> = JUDGMENT_LABEL;

const byTone = <T,>(fn: (tone: JudgmentTone) => T): Record<JudgmentTone, T> => ({
  good: fn("good"),
  caution: fn("caution"),
  warning: fn("warning"),
});

/** 濃色ソリッド背景（状態ドット / ミニステータスバーのフィル）。 */
export const TONE_SOLID_STYLE = byTone<CSSProperties>((tone) => ({
  backgroundColor: SEMANTIC_COLOR[tone],
}));

/** 状態文字色。 */
export const TONE_TEXT_STYLE = byTone<CSSProperties>((tone) => ({
  color: SEMANTIC_TEXT[tone],
}));

/** pill バッジ（淡背景 + 濃文字）。 */
export const TONE_PILL_STYLE = byTone<CSSProperties>((tone) => ({
  backgroundColor: SEMANTIC_SOFT_BG[tone],
  color: SEMANTIC_TEXT[tone],
}));

/** 淡背景のみ（アイコンチップ等）。 */
export const TONE_SOFT_BG_STYLE = byTone<CSSProperties>((tone) => ({
  backgroundColor: SEMANTIC_SOFT_BG[tone],
}));
