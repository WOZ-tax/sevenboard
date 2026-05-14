/**
 * 元データから6指標を計算する pure 関数群。
 * 入力単位: 金額は千円、人員は人。
 */

import type { LocabenMetricKey } from "./constants";
import { SOURCE_DATA_KEYS, type SourceDataKey } from "./constants";

export type SourceData = Record<SourceDataKey, number | null>;

export function emptySourceData(): SourceData {
  return Object.fromEntries(SOURCE_DATA_KEYS.map((k) => [k, null])) as SourceData;
}

function safeDiv(num: number, denom: number): number | null {
  if (!Number.isFinite(num) || !Number.isFinite(denom) || denom === 0) return null;
  return num / denom;
}

function val(d: SourceData, k: SourceDataKey): number | null {
  const v = d[k];
  return v !== null && Number.isFinite(v) ? v : null;
}

export function computeLocabenMetrics(
  d: SourceData,
): Record<LocabenMetricKey, number | null> {
  const rev = val(d, "revenueCurrent");
  const revPrior = val(d, "revenuePrior");
  const op = val(d, "operatingProfit");
  const dep = val(d, "depreciation");
  const ta = val(d, "totalAssets");
  const na = val(d, "netAssets");
  const ar = val(d, "receivables");
  const inv = val(d, "inventory");
  const ap = val(d, "payables");
  const debt = val(d, "borrowings");
  const cash = val(d, "cashAndDeposits");
  const emp = val(d, "employeeCount");

  // 売上増加率 (%)
  const revenueGrowthRate =
    rev !== null && revPrior !== null
      ? safeDiv(rev - revPrior, revPrior)
      : null;

  // 営業利益率 (%)
  const opMargin =
    rev !== null && op !== null ? safeDiv(op, rev) : null;

  // 労働生産性 (千円/人) — 営業利益 ÷ 従業員数
  const laborProductivity =
    op !== null && emp !== null && emp > 0 ? op / emp : null;

  // EBITDA有利子負債倍率 (倍)
  // (借入金 - 現預金) / (営業利益 + 減価償却費)
  let ebitda: number | null = null;
  if (debt !== null && cash !== null && op !== null && dep !== null) {
    const ebitdaCash = op + dep;
    ebitda = safeDiv(debt - cash, ebitdaCash);
  }

  // 営業運転資本回転期間 (ヶ月)
  // (売上債権 + 棚卸資産 - 仕入債務) / (売上 / 12)
  let workingCapital: number | null = null;
  if (ar !== null && inv !== null && ap !== null && rev !== null && rev > 0) {
    workingCapital = (ar + inv - ap) / (rev / 12);
  }

  // 自己資本比率 (%)
  const equityRatio = na !== null && ta !== null ? safeDiv(na, ta) : null;

  return {
    revenueGrowthRate: revenueGrowthRate !== null ? revenueGrowthRate * 100 : null,
    operatingProfitMargin: opMargin !== null ? opMargin * 100 : null,
    laborProductivity,
    ebitdaInterestBearingDebtRatio: ebitda,
    workingCapitalTurnoverPeriod: workingCapital,
    equityRatio: equityRatio !== null ? equityRatio * 100 : null,
  };
}
