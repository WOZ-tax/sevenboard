import type { JudgmentTone } from "./derive-overview";

/**
 * 財務指標ページ専用のデザイントークン（このページの単一の真実点）。
 *
 * IMPORTANT: globals.css / アプリ全体の CSS 変数は一切変更しない。ここはこのページ内でのみ
 * 参照する定数の集約であり、色は既存の機能カラー（--color-success/warning/error）に一致させる。
 *
 * 役割分担:
 *  - このファイル = 色「値」（inline style / SVG の fill・stroke に渡せる文字列）と寸法・レイアウト定数
 *  - tone-styles.ts = ここの値を束ねた「tone → React.CSSProperties」の写像（className 経由の tone 着色を廃し、
 *    Tailwind JIT の文字列リテラル依存を避けるため inline style に寄せる）
 */

// --- セマンティックカラー（判定色） ---------------------------------------
// 面塗り・原色は増やさない。good=緑 / caution=アンバー / warning(要改善)=赤。
// 赤は「要改善」判定のみに使う（装飾・中立目的では使わない）。
export const SEMANTIC_COLOR: Record<JudgmentTone, string> = {
  good: "var(--color-success)", // #2e7d32
  caution: "var(--color-warning)", // #f9a825
  warning: "var(--color-error)", // #e01e5a  ← 赤は要改善のみ
};

/** 淡背景（pill バッジ・アイコンチップ）上での文字色。注意は可読性のため濃いアンバー。 */
export const SEMANTIC_TEXT: Record<JudgmentTone, string> = {
  good: "var(--color-success)",
  caution: "#8d6e00",
  warning: "var(--color-error)",
};

/** pill バッジ / アイコンチップ専用の淡背景。面塗り（カード全面）には使わない。 */
export const SEMANTIC_SOFT_BG: Record<JudgmentTone, string> = {
  good: "#e8f5e9",
  caution: "#fff8e1",
  warning: "#fce4ec",
};

// --- スレート基調（見出し / 枠 / ゲージのトラック・針・目盛り） --------------
// 中立色。ゲージ描画（SVG）と細トラックにのみ用いる。Tailwind の slate 系相当。
export const SLATE = {
  needle: "#334155", // slate-700  針・根本ドット
  tick: "#94a3b8", // slate-400  目盛り
  barTrack: "#f1f5f9", // slate-100  ミニステータスバーのトラック
} as const;

// --- スピードメーター寸法（viewBox 座標系） --------------------------------
// 半円（180°）。score 0 = 左端 / 100 = 右端 / 50 = 天頂。
export const GAUGE = {
  viewW: 200,
  viewH: 112,
  cx: 100,
  cy: 100,
  r: 80, // 帯の中心半径
  band: 18, // 帯の太さ
  needleLen: 66, // 針長
  needleRoot: 5, // 根本ドット半径
  tickLen: 6, // 目盛りの長さ（帯の外側）
  // スコア帯の境界: 0-40 レッド / 40-75 アンバー / 75-100 グリーン
  redMax: 40,
  amberMax: 75,
} as const;

/** スコア帯の境界目盛り位置。 */
export const GAUGE_TICKS: readonly number[] = [0, GAUGE.redMax, GAUGE.amberMax, 100];

// --- レイアウト定数 -------------------------------------------------------
export const LAYOUT = {
  radius: "rounded-lg", // 角丸は rounded-lg で統一
  cardPad: "p-4", // カード padding
  gap: "gap-3", // 指標カードの縦積み gap
  columnGap: "gap-4", // カラム内・カラム間の gap
} as const;

/**
 * 印刷時に淡背景・塗りを飛ばさないための Tailwind ユーティリティ（局所付与）。
 * グローバルの print CSS は変更しない。Tailwind JIT が検出できるよう文字列リテラルで持つ。
 */
export const PRINT_EXACT_CLASS =
  "[-webkit-print-color-adjust:exact] [print-color-adjust:exact]";
