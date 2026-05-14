/**
 * MF (DashboardSummary / PL / BS) から ロカベン原データを抽出するマッピング。
 *
 * MF 側の値はすべて「円単位」。ロカベンは「千円単位」で扱うので変換 (四捨五入)。
 * 従業員数 (employeeCount) のみ MF から取れないため手入力。
 *
 * 勘定科目名の表記揺れに備え、完全一致 → 部分一致 の順で探索し、
 * 合算系 (売上債権=売掛金+受取手形 等) は複数候補の合計を取る。
 */

import type {
  BSStatement,
  DashboardSummary,
  FinancialStatementRow,
  PLStatement,
} from "../mf-types";
import type { SourceData } from "./metrics";

type Rows = readonly FinancialStatementRow[];

/**
 * BS の category は「  買掛金」(leaf、先頭スペース2つ) と「買掛金合計」(subtotal) の
 * 両方が存在しうる。leaf だけを対象にしたいので isTotal / isHeader を除外し、
 * 先頭の空白を除いた純粋な勘定名で比較する。
 */
function leafRows(rows: Rows): { name: string; current: number }[] {
  return rows
    .filter((r) => !r.isTotal && !r.isHeader)
    .map((r) => ({ name: r.category.trim(), current: r.current }))
    .filter((r) => Number.isFinite(r.current));
}

function totalRows(rows: Rows): { name: string; current: number }[] {
  return rows
    .filter((r) => r.isTotal && !r.isHeader)
    .map((r) => ({ name: r.category.trim(), current: r.current }))
    .filter((r) => Number.isFinite(r.current));
}

function findCurrent(rows: Rows, names: readonly string[]): number | null {
  const leaves = leafRows(rows);
  for (const name of names) {
    const exact = leaves.find((r) => r.name === name);
    if (exact) return exact.current;
  }
  for (const name of names) {
    const partial = leaves.find((r) => r.name.includes(name));
    if (partial) return partial.current;
  }
  // leaf に見つからなければ subtotal にもフォールバック (純資産合計など)
  const totals = totalRows(rows);
  for (const name of names) {
    const t = totals.find((r) => r.name === name || r.name.includes(name));
    if (t) return t.current;
  }
  return null;
}

function sumCurrent(rows: Rows, names: readonly string[]): number | null {
  const leaves = leafRows(rows);
  let sum = 0;
  let found = false;
  const matched = new Set<string>();
  for (const name of names) {
    for (const r of leaves) {
      if (matched.has(r.name)) continue;
      if (r.name === name || r.name.includes(name)) {
        sum += r.current;
        matched.add(r.name);
        found = true;
      }
    }
  }
  return found ? sum : null;
}

function yenToThousand(v: number | null): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  return Math.round(v / 1000);
}

/**
 * MF データから ロカベン原データ (千円単位) を抽出。
 * 取得できなかった項目は null のまま返す (UI 側でユーザー入力を促す)。
 */
export function extractMfSourceData(input: {
  dashboard?: DashboardSummary | null;
  pl?: PLStatement | null;
  bs?: BSStatement | null;
}): Partial<SourceData> {
  const r: Partial<SourceData> = {};

  if (input.dashboard) {
    r.revenueCurrent = yenToThousand(input.dashboard.revenue);
    r.operatingProfit = yenToThousand(input.dashboard.operatingProfit);
    r.totalAssets = yenToThousand(input.dashboard.totalAssets);
    if (input.dashboard.prevYear) {
      r.revenuePrior = yenToThousand(input.dashboard.prevYear.revenue);
    }
  }

  // 減価償却費は PL Statement の集約レベルには含まれていないため
  // page 側で `useMfAccountTransition("減価償却費")` を呼んで個別取得する。
  // ここでは PL から探すフォールバックだけ残す (科目別 PL が来ている場合に備えて)。
  if (input.pl) {
    const dep = findCurrent(input.pl, ["減価償却費"]);
    if (dep !== null) r.depreciation = yenToThousand(dep);
  }

  if (input.bs) {
    const assets = input.bs.assets;
    const le = input.bs.liabilitiesEquity;

    r.cashAndDeposits = yenToThousand(
      findCurrent(assets, ["現金及び預金", "現金預金", "現金・預金", "現金", "預金"]),
    );
    r.receivables = yenToThousand(
      sumCurrent(assets, ["売掛金", "受取手形", "電子記録債権"]),
    );
    r.inventory = yenToThousand(
      sumCurrent(assets, [
        "棚卸資産",
        "商品",
        "製品",
        "仕掛品",
        "原材料",
        "貯蔵品",
      ]),
    );
    r.payables = yenToThousand(
      sumCurrent(le, ["買掛金", "支払手形", "電子記録債務"]),
    );
    r.borrowings = yenToThousand(
      sumCurrent(le, [
        "短期借入金",
        "1年内返済予定の長期借入金",
        "長期借入金",
        "役員借入金",
      ]),
    );
    r.netAssets = yenToThousand(
      findCurrent(le, ["純資産合計", "株主資本合計", "純資産"]),
    );
  }

  return r;
}
