import type { FinancialIndicators } from "@/lib/mf-types";

/**
 * 財務指標ページの純粋な派生計算ロジック。
 *
 * ここには React / DOM / スタイルを一切持ち込まない（node で単体テスト可能に保つ）。
 * 色クラスへの写像は tone-styles.ts 側が担当し、この層は "tone"（good/caution/warning）
 * までを算出する。
 *
 * テスト: node apps/web/src/app/indicators/_components/derive-overview.spec.mjs
 */

export type IndicatorKey = keyof FinancialIndicators;
export type CategoryKey = "safety" | "profit" | "efficiency";
export type JudgmentTone = "good" | "caution" | "warning";

export interface IndicatorHelp {
  /** 計算式 */
  formula: string;
  /** 何を測っているか（1-2文） */
  meaning: string;
  /** 目安・判定基準 */
  benchmark: string;
  /** 解釈の注意点（任意） */
  caveat?: string;
}

export interface IndicatorDef {
  key: IndicatorKey;
  label: string;
  unit: string;
  good: number;
  caution: number;
  higherIsBetter: boolean;
  category: CategoryKey;
  help: IndicatorHelp;
}

export interface Judgment {
  label: "良好" | "注意" | "要改善";
  tone: JudgmentTone;
}

/** tone の深刻度。数字が大きいほど悪い（カテゴリ / 総合の最悪値を取るのに使う）。 */
const TONE_SEVERITY: Record<JudgmentTone, number> = {
  good: 0,
  caution: 1,
  warning: 2,
};

type JudgeableDef = Pick<IndicatorDef, "good" | "caution" | "higherIsBetter">;

/**
 * 単一指標の判定。旧 getJudgment のしきい値ロジックをそのまま踏襲する。
 * higherIsBetter=false かつ純資産マイナス等で value<0 の場合は良好扱いしない。
 */
export function getJudgment(def: JudgeableDef, value: number): Judgment {
  if (def.higherIsBetter) {
    if (value >= def.good) return { label: "良好", tone: "good" };
    if (value >= def.caution) return { label: "注意", tone: "caution" };
    return { label: "要改善", tone: "warning" };
  }
  if (value < 0) return { label: "要改善", tone: "warning" };
  if (value <= def.good) return { label: "良好", tone: "good" };
  if (value <= def.caution) return { label: "注意", tone: "caution" };
  return { label: "要改善", tone: "warning" };
}

export interface OverviewItem {
  def: Pick<IndicatorDef, "category" | "good" | "caution" | "higherIsBetter">;
  value: number;
}

export interface OverviewResult {
  counts: Record<JudgmentTone, number>;
  /** 総合 tone: 要改善が1つでもあれば warning、注意のみ caution、全良好 good。 */
  overall: JudgmentTone;
  /** ヒーロー表示用の日本語ラベル。 */
  overallLabel: "良好" | "注意あり" | "要改善あり";
  /** カテゴリ別の最悪 tone。指標が無いカテゴリは null。 */
  categories: Record<CategoryKey, JudgmentTone | null>;
}

const OVERALL_LABEL: Record<JudgmentTone, OverviewResult["overallLabel"]> = {
  good: "良好",
  caution: "注意あり",
  warning: "要改善あり",
};

/**
 * 表示中の指標群から総合判定・カテゴリ集計・件数を導出する。
 * 優先順位は 要改善 > 注意 > 良好（要改善が1つでもあれば総合は「要改善あり」）。
 */
export function deriveOverview(items: OverviewItem[]): OverviewResult {
  const counts: Record<JudgmentTone, number> = { good: 0, caution: 0, warning: 0 };
  const categories: Record<CategoryKey, JudgmentTone | null> = {
    safety: null,
    profit: null,
    efficiency: null,
  };

  for (const { def, value } of items) {
    const { tone } = getJudgment(def, value);
    counts[tone] += 1;
    const current = categories[def.category];
    if (current === null || TONE_SEVERITY[tone] > TONE_SEVERITY[current]) {
      categories[def.category] = tone;
    }
  }

  const overall: JudgmentTone =
    counts.warning > 0 ? "warning" : counts.caution > 0 ? "caution" : "good";

  return { counts, overall, overallLabel: OVERALL_LABEL[overall], categories };
}

/** しきい値 / 目盛りの数値整形（末尾 .0 を落とす）。 */
export function formatThreshold(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * バー下に常設する目安1行を def から機械生成する。
 * higherIsBetter: 「良好 ≥200% / 注意 <100%」
 * lowerIsBetter : 「良好 ≤100% / 注意 >200%」
 */
export function formatBenchmark(
  def: Pick<IndicatorDef, "good" | "caution" | "unit" | "higherIsBetter">,
): string {
  const g = formatThreshold(def.good);
  const c = formatThreshold(def.caution);
  const u = def.unit;
  return def.higherIsBetter
    ? `良好 ≥${g}${u} / 注意 <${c}${u}`
    : `良好 ≤${g}${u} / 注意 >${c}${u}`;
}

function clampPct(pct: number): number {
  return Math.min(100, Math.max(0, pct));
}

export interface ScaleZone {
  tone: JudgmentTone;
  startPct: number;
  endPct: number;
}

export interface ScaleTick {
  value: number;
  label: string;
  pct: number;
}

export interface ScaleModel {
  zones: ScaleZone[];
  ticks: ScaleTick[];
  marker: { pct: number; clampedHigh: boolean; clampedLow: boolean };
}

type ScalableDef = Pick<IndicatorDef, "good" | "caution" | "higherIsBetter" | "unit">;

/**
 * ゾーンスケールバーの幾何モデル。
 * higherIsBetter=true : 左=赤[0〜caution] 中=黄[caution〜good] 右=緑[good〜good*1.5]
 * higherIsBetter=false: 左=緑[0〜good]     中=黄[good〜caution] 右=赤[caution〜caution*1.5]
 * value がスケール外なら marker.pct は端にクランプし clampedHigh/Low を立てる。
 */
export function buildScale(def: ScalableDef, value: number): ScaleModel {
  const fmt = (n: number) => `${formatThreshold(n)}${def.unit}`;
  let scaleMax: number;
  let zones: ScaleZone[];
  let ticks: ScaleTick[];

  if (def.higherIsBetter) {
    scaleMax = def.good * 1.5;
    const cautionPct = clampPct((def.caution / scaleMax) * 100);
    const goodPct = clampPct((def.good / scaleMax) * 100);
    zones = [
      { tone: "warning", startPct: 0, endPct: cautionPct },
      { tone: "caution", startPct: cautionPct, endPct: goodPct },
      { tone: "good", startPct: goodPct, endPct: 100 },
    ];
    ticks = [
      { value: def.caution, label: fmt(def.caution), pct: cautionPct },
      { value: def.good, label: fmt(def.good), pct: goodPct },
    ];
  } else {
    scaleMax = def.caution * 1.5;
    const goodPct = clampPct((def.good / scaleMax) * 100);
    const cautionPct = clampPct((def.caution / scaleMax) * 100);
    zones = [
      { tone: "good", startPct: 0, endPct: goodPct },
      { tone: "caution", startPct: goodPct, endPct: cautionPct },
      { tone: "warning", startPct: cautionPct, endPct: 100 },
    ];
    ticks = [
      { value: def.good, label: fmt(def.good), pct: goodPct },
      { value: def.caution, label: fmt(def.caution), pct: cautionPct },
    ];
  }

  const rawPct = scaleMax > 0 ? (value / scaleMax) * 100 : 0;
  return {
    zones,
    ticks,
    marker: { pct: clampPct(rawPct), clampedHigh: rawPct > 100, clampedLow: rawPct < 0 },
  };
}
