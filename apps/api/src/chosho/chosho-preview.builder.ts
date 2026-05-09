/**
 * 残高調書 preview builder — MF 推移表レスポンスを純関数で 3 階層 row 配列に変換する。
 *
 * 純関数として切り出す理由:
 * - Unit 2B 以降の異常検知 (零残高違反 / 3ヶ月以上滞留) ロジックを同じ row 配列に
 *   ぶら下げて書けるようにする。
 * - 単体テストを controller/service から切り離して書けるようにする。
 * - MF レスポンスの shape が変わった時、このモジュールだけ追従すればよい。
 */

import type { MfReportRow, MfTransition } from '../mf/types/mf-api.types';
import type { ChoshoPreviewRow } from './chosho-preview.types';

interface BuildInput {
  /** MF 推移表 (BS) のレスポンス。null なら空配列を返す。 */
  bsTransition: MfTransition | null;
}

interface BuildOutput {
  rows: ChoshoPreviewRow[];
  /** MF columns から解釈した月順 (例: [4,5,6,...,3])。 */
  monthOrder: number[];
}

export function buildChoshoPreviewRows(input: BuildInput): BuildOutput {
  if (!input.bsTransition) {
    return { rows: [], monthOrder: [] };
  }

  // columns 例: ["4","5","6","7","8","9","10","11","12","1","2","3","settlement_balance","total"]
  // 数字 column のみ拾って月配列を作る。残りは settlement / total として扱う。
  const monthOrder: number[] = input.bsTransition.columns
    .filter((c) => /^\d+$/.test(c))
    .map((c) => parseInt(c, 10));

  const out: ChoshoPreviewRow[] = [];
  flattenMfRows(input.bsTransition.rows, null, 0, monthOrder, out, 'bs');
  return { rows: out, monthOrder };
}

/**
 * MF rows を再帰的に flatten。displayOrder は DFS 順で連番。
 * 戻り値は副作用 (out への push) で返す。
 */
function flattenMfRows(
  rows: MfReportRow[],
  parentKey: string | null,
  level: number,
  monthOrder: number[],
  out: ChoshoPreviewRow[],
  pathSeed: string,
): void {
  rows.forEach((row, idx) => {
    const rowKey = makeRowKey(pathSeed, idx, row.name);
    const monthlyBalances: Record<number, number> = {};
    monthOrder.forEach((m, i) => {
      const v = row.values[i];
      if (typeof v === 'number') {
        monthlyBalances[m] = v;
      }
    });

    // settlement_balance は monthOrder の直後 column、total はその次。
    const settlementBalance = numberOrNull(row.values[monthOrder.length]);
    const total = numberOrNull(row.values[monthOrder.length + 1]);

    const hasChildren = Array.isArray(row.rows) && row.rows.length > 0;

    out.push({
      rowKey,
      parentRowKey: parentKey,
      level,
      displayOrder: out.length,
      name: row.name,
      mfType: row.type,
      monthlyBalances,
      settlementBalance,
      total,
      hasChildren,
    });

    if (hasChildren && row.rows) {
      flattenMfRows(row.rows, rowKey, level + 1, monthOrder, out, rowKey);
    }
  });
}

function numberOrNull(v: number | null | undefined): number | null {
  return typeof v === 'number' ? v : null;
}

/**
 * row.name は同じ階層内で重複しうるので、index を必ず prefix して衝突回避。
 * UI の React key 用なのでスラッシュ区切りで人間にも追える形。
 */
function makeRowKey(parent: string, index: number, name: string): string {
  // name の slash と空白だけ簡易 escape (key 衝突回避が目的、URL safety は不要)
  const safeName = name.replace(/[\/\s]+/g, '_').slice(0, 32);
  return `${parent}/${index}-${safeName}`;
}
