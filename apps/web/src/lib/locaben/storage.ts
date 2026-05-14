/**
 * ロカベン LocalStorage 読み込みヘルパー。
 * funding-report 等の AI 生成リクエストで「ユーザー手入力データ + 業種上書き」を
 * サーバーに送って反映するために使う。
 */

const STORAGE_KEY_PREFIX = "sb_locaben_v2_";

export interface LocabenOverride {
  industry?: string | null;
  values?: Record<string, number | null>;
}

export function loadLocabenOverride(orgId: string | null | undefined): LocabenOverride | undefined {
  if (!orgId || typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + orgId);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as {
      industryOverride?: string | null;
      values?: Record<string, number | null>;
    };
    const hasIndustry = !!parsed.industryOverride;
    const hasValues =
      parsed.values && Object.values(parsed.values).some((v) => v !== null);
    if (!hasIndustry && !hasValues) return undefined;
    return {
      industry: parsed.industryOverride ?? null,
      values: parsed.values,
    };
  } catch {
    return undefined;
  }
}
