/**
 * ロカベン LocalStorage 読み込みヘルパー。
 * funding-report 等の AI 生成リクエストで「ユーザー手入力データ + 業種上書き」を
 * サーバーに送って反映するために使う。
 */

const STORAGE_KEY_PREFIX = "sb_locaben_v2_";

export interface LocabenOverride {
  industry?: string | null;
  values?: Record<string, number | null>;
  /** 非財務4シート (経営者/関係者/事業/内部管理) のユーザー入力 */
  nonFinancial?: Record<string, Record<string, string>>;
}

export function loadLocabenOverride(
  orgId: string | null | undefined,
): LocabenOverride | undefined {
  if (!orgId || typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + orgId);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as {
      industryOverride?: string | null;
      values?: Record<string, number | null>;
      nonFinancial?: Record<string, Record<string, string>>;
    };
    const hasIndustry = !!parsed.industryOverride;
    const hasValues =
      parsed.values && Object.values(parsed.values).some((v) => v !== null);
    const hasNonFinancial =
      parsed.nonFinancial &&
      Object.values(parsed.nonFinancial).some(
        (section) =>
          section && Object.values(section).some((v) => (v ?? "").trim() !== ""),
      );
    if (!hasIndustry && !hasValues && !hasNonFinancial) return undefined;
    return {
      industry: parsed.industryOverride ?? null,
      values: parsed.values,
      nonFinancial: parsed.nonFinancial,
    };
  } catch {
    return undefined;
  }
}
