/**
 * 業種別の経営知識データ。
 * 出典: 金融庁「業種別支援の着眼点」2026年3月再構成版（projects/Getsuji/）
 *
 * 用途:
 * - UI 反映: ① 当期財務サマリの業界平均比較、⑥ BS整理タスクの業種別ヒント
 * - データのみ保持（AI参照用）: pitfalls / scheduleExtras / generalContext
 */

export type IndustryCode =
  | "restaurant"     // 飲食業
  | "retail"         // 小売業
  | "wholesale"      // 卸売業
  | "construction"   // 建設業
  | "manufacturing"  // 製造業
  | "transport"      // 運送業
  | "service"        // サービス業
  | "medical"        // 医療(クリニック)
  | "care"           // 介護業
  | "lodging"        // 宿泊業
  | "other";         // その他

/** 業種別の業界平均指標（UIに表示） */
export interface IndustryMetrics {
  /** 売上総利益率(%) */
  grossMarginPct?: number;
  /** 売上原価率(%) */
  cogsRatioPct?: number;
  /** FL比率(%) — 飲食業のみ。FOOD(原材料費)+LABOR(人件費)/売上 */
  flCostRatioPct?: number;
  /** 販管費率(%) */
  sgaRatioPct?: number;
  /** 売上高営業利益率(%) */
  operatingMarginPct?: number;
  /** 人件費率(%) — 介護・サービス・医療等 */
  laborCostRatioPct?: number;
  /** 出典補足 */
  sourceNote?: string;
}

/** BS整理タスクの業種別ヒント — ⑥セクションで利用 */
export interface BsCleanupHints {
  /** 売掛金 */
  ar?: string;
  /** 棚卸資産 */
  inventory?: string;
  /** 固定資産 */
  fixedAsset?: string;
  /** 仮勘定 */
  tempAccount?: string;
}

/** 業種別の経営知識 */
export interface IndustryKnowledge {
  code: IndustryCode;
  label: string;
  /** ROA分解の主軸 (Getsuji 第2章) */
  roaAxis: "profit-margin" | "asset-turnover";
  metrics: IndustryMetrics;
  bsCleanupHints: BsCleanupHints;
  /** 業種特有の "やりがちな失敗" — UIには出さず AI参照用 */
  pitfalls: string[];
  /** 業種特有の決算スケジュール追加項目 — UIには出さず AI参照用 */
  scheduleExtras: Array<{ task: string; offsetDays?: number; note: string }>;
  /** 業種の一般的特性（AIに渡す文脈） */
  generalContext: string;
  /** 訪問時/対話のヒアリング項目（AI参照用） */
  hearingChecklist: string[];
}
