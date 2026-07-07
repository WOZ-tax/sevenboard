import type { CategoryKey, IndicatorDef } from "./derive-overview";

/**
 * 財務指標の定義（ラベル・しきい値・ヘルプ文言）。
 *
 * しきい値 (good/caution)・help 文言はデータ取得ロジック同様に不変。
 * category は集計・パネル振り分けのために付与している（値自体はカテゴリ配列から自明）。
 */

export const safetyIndicators: IndicatorDef[] = [
  {
    key: "currentRatio",
    label: "流動比率",
    unit: "%",
    good: 200,
    caution: 100,
    higherIsBetter: true,
    category: "safety",
    help: {
      formula: "流動資産 ÷ 流動負債 × 100",
      meaning:
        "1年以内に現金化できる資産で、1年以内に支払う負債をどれだけカバーできるかを示す短期支払能力の指標。",
      benchmark: "200%以上=良好、100%未満=資金繰りに警戒、150%前後が業種平均の目安。",
      caveat:
        "在庫や未回収売掛金が多いと数字は良く見えても実際の支払能力は低いことがある。当座比率(流動資産から在庫を除いたもの÷流動負債)も合わせて確認推奨。",
    },
  },
  {
    key: "equityRatio",
    label: "自己資本比率",
    unit: "%",
    good: 40,
    caution: 20,
    higherIsBetter: true,
    category: "safety",
    help: {
      formula: "純資産 ÷ 総資産 × 100",
      meaning:
        "総資産のうち、返済不要の自己資本がどれだけを占めるか。財務基盤の安定性・倒産リスクの低さを示す。",
      benchmark: "40%以上=良好、20%未満=警戒、中小企業全体平均は約30%、製造業は40%超が一般的。",
      caveat:
        "高ければ良いというだけではなく、過剰な内部留保で投資機会を逸している場合もある。ROEとあわせて見るのが基本。",
    },
  },
  {
    key: "debtEquityRatio",
    label: "負債比率",
    unit: "%",
    good: 100,
    caution: 200,
    higherIsBetter: false,
    category: "safety",
    help: {
      formula: "負債 ÷ 純資産 × 100",
      meaning: "自己資本に対して何倍の負債を抱えているか。低いほど財務的に健全。",
      benchmark: "100%以下=良好、200%超=注意、300%超は財務リスク高め。",
      caveat:
        "純資産がマイナス(債務超過)の場合は計算不能となるため、自己資本比率とセットで判断する。",
    },
  },
];

export const profitIndicators: IndicatorDef[] = [
  {
    key: "grossProfitMargin",
    label: "売上総利益率",
    unit: "%",
    good: 40,
    caution: 20,
    higherIsBetter: true,
    category: "profit",
    help: {
      formula: "(売上 − 売上原価) ÷ 売上 × 100",
      meaning: "売上からどれだけ粗利を生み出せているか。商品・サービス自体の収益力を示す。",
      benchmark:
        "業種により大きく異なる。製造業20-30%、小売業20-40%、サービス業40-60%、SaaS70%超が目安。",
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
    category: "profit",
    help: {
      formula: "営業利益 ÷ 売上 × 100",
      meaning: "本業から1円の売上を上げるごとにいくら利益が残るか。事業そのものの収益力。",
      benchmark: "全業種平均3-5%、製造業4-6%、SaaS優良企業20%超、10%超は優秀の目安。",
      caveat:
        "粗利率は高くても販管費が重いと営業利益率は低くなる。販管費の内訳(人件費・家賃・広告費)も確認する。",
    },
  },
  {
    key: "roe",
    label: "ROE (自己資本利益率)",
    unit: "%",
    good: 10,
    caution: 5,
    higherIsBetter: true,
    category: "profit",
    help: {
      formula: "純利益 ÷ 純資産 × 100",
      meaning: "株主が投じた資本に対してどれだけ利益を生み出しているか。投資家の効率指標。",
      benchmark: "10%超=良好、東証上場企業平均は8-10%、20%超は高効率企業。",
      caveat:
        "借入を増やして自己資本を圧縮するとROEは上がるので、自己資本比率と必ずセットで見る。純資産がマイナスなら計算意義なし。",
    },
  },
  {
    key: "roa",
    label: "ROA (総資産利益率)",
    unit: "%",
    good: 5,
    caution: 2,
    higherIsBetter: true,
    category: "profit",
    help: {
      formula: "純利益 ÷ 総資産 × 100",
      meaning: "保有している資産全体(自己資本+他人資本)からどれだけ利益を生み出しているか。",
      benchmark: "5%超=良好、上場企業平均は3-5%、製造業3-4%、サービス業6-8%。",
      caveat:
        "ROEは借入レバレッジで膨らむが、ROAは資本構成に左右されないため事業の本質的な効率を測れる。",
    },
  },
];

export const efficiencyIndicators: IndicatorDef[] = [
  {
    key: "totalAssetTurnover",
    label: "総資産回転率",
    unit: "回",
    good: 1.0,
    caution: 0.5,
    higherIsBetter: true,
    category: "efficiency",
    help: {
      formula: "売上 ÷ 総資産",
      meaning: "保有資産で年間に何回売上を作れているか。資産の有効活用度を示す。",
      benchmark:
        "1.0回以上=良好、製造業0.8-1.2回、小売業1.5-3回、不動産業0.2-0.5回など業種差が大きい。",
      caveat:
        "在庫過多・遊休固定資産・回収遅延の売掛金などで分母が膨らむと数字が低く出る。改善余地のヒントになる。",
    },
  },
  {
    key: "receivablesTurnover",
    label: "売上債権回転率",
    unit: "回",
    good: 6,
    caution: 4,
    higherIsBetter: true,
    category: "efficiency",
    help: {
      formula: "売上 ÷ 売掛金",
      meaning: "売掛金が年間で何回回収されているか。回収サイクルの効率を示す。",
      benchmark: "12回以上(月次回収)=良好、6回以上=標準、4回未満は回収遅延の可能性。",
      caveat:
        "12 ÷ この値 = 平均回収日数(月)。例: 6回なら平均2ヶ月後回収。回収サイトを延ばされている顧客がないか確認推奨。",
    },
  },
];

export interface CategoryMeta {
  key: CategoryKey;
  label: string;
  /** ヒーローのチップ → パネルへスムーススクロールする際のアンカー id。 */
  anchorId: string;
}

export const CATEGORY_META: Record<CategoryKey, CategoryMeta> = {
  safety: { key: "safety", label: "安全性", anchorId: "indicator-panel-safety" },
  profit: { key: "profit", label: "収益性", anchorId: "indicator-panel-profit" },
  efficiency: { key: "efficiency", label: "効率性", anchorId: "indicator-panel-efficiency" },
};
