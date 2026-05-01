/**
 * 業種マスタ (API 側のミラー)。フロント `apps/web/src/lib/industries.ts` と同期させる。
 *
 * 13 業種 + 業種未設定 (null) の合計 14 状態。
 * health-score-calculator が業種別ベンチマークと突き合わせる。
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

/** 旧 5 種からの自動移行マッピング (industry-benchmarks の検索フォールバック用) */
const LEGACY_INDUSTRY_MIGRATION: Record<string, IndustryCode> = {
  SaaS: '情報通信業',
  製造業: '製造業',
  情報通信業: '情報通信業',
  小売業: '小売業',
  コンサルティング: '学術研究・専門・技術サービス業',
};

export function normalizeIndustry(
  raw: string | null | undefined,
): IndustryCode | null {
  if (!raw) return null;
  if ((INDUSTRIES as readonly string[]).includes(raw)) {
    return raw as IndustryCode;
  }
  return LEGACY_INDUSTRY_MIGRATION[raw] ?? null;
}

export function isValidIndustry(raw: unknown): raw is IndustryCode {
  return typeof raw === 'string' && (INDUSTRIES as readonly string[]).includes(raw);
}
