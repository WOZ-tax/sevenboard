/**
 * 業種マスタ。中小企業実態基本調査 (中小企業庁 / e-Stat) の業種分類に揃える。
 *
 * 13 業種:
 *   - 各業種に対して industry-benchmarks (API 側) で標準値を持つ
 *   - 「その他サービス業」は分類困難なケース用のフォールバック
 *
 * 旧 5 種 (SaaS / 製造業 / 情報通信業 / 小売業 / コンサルティング) からのマッピング:
 *   SaaS                 → 情報通信業
 *   製造業               → 製造業
 *   情報通信業           → 情報通信業
 *   小売業               → 小売業
 *   コンサルティング     → 学術研究・専門・技術サービス業
 */

export const INDUSTRIES = [
  '建設業',
  '製造業',
  '情報通信業',
  '運輸業・郵便業',
  '卸売業',
  '小売業',
  '不動産業・物品賃貸業',
  '学術研究・専門・技術サービス業',
  '宿泊業・飲食サービス業',
  '生活関連サービス業・娯楽業',
  '教育・学習支援業',
  '医療・福祉',
  'その他サービス業',
] as const;

export type IndustryCode = (typeof INDUSTRIES)[number];

/** 旧 5 種からの自動移行マッピング */
export const LEGACY_INDUSTRY_MIGRATION: Record<string, IndustryCode> = {
  SaaS: '情報通信業',
  製造業: '製造業',
  情報通信業: '情報通信業',
  小売業: '小売業',
  コンサルティング: '学術研究・専門・技術サービス業',
};

/** 表示時に未設定や旧値だった場合のフォールバック */
export function normalizeIndustry(raw: string | null | undefined): IndustryCode | null {
  if (!raw) return null;
  if ((INDUSTRIES as readonly string[]).includes(raw)) {
    return raw as IndustryCode;
  }
  return LEGACY_INDUSTRY_MIGRATION[raw] ?? null;
}
