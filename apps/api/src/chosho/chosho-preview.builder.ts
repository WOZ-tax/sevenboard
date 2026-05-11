/**
 * 残高調書 preview builder — MF 推移表レスポンスを純関数で 3 階層 row 配列に変換する。
 *
 * 純関数として切り出す理由:
 * - 異常検知 (零残高違反 / 3ヶ月以上滞留) ロジックを同じ row 配列に集約する。
 * - 単体テストを controller/service から切り離して書ける。
 * - MF レスポンスの shape が変わった時、このモジュールだけ追従すればよい。
 *
 * Unit 2B-1 で追加: 異常検知ロジック (零残高違反 / 3ヶ月以上滞留) を選択月セルに対して付与。
 */

import type { MfReportRow, MfTransition } from '../mf/types/mf-api.types';
import type {
  ChoshoAnomaly,
  ChoshoPreviewRow,
  ChoshoRuleOverride,
} from './chosho-preview.types';

interface BuildInput {
  /** MF 推移表 (BS) のレスポンス。null なら空配列を返す。 */
  bsTransition: MfTransition | null;
  /** 異常検知の対象月 (カレンダー月、1-12)。指定が無い場合は検知をスキップ。 */
  selectedMonth?: number;
  /**
   * 行ごとのルール上書き。Unit 2B-2 以降で DB の chosho_rows から渡される。
   * Unit 2B-1 では undefined / 空 Map を想定。
   */
  ruleOverrides?: Map<string, ChoshoRuleOverride>;
  /**
   * 補助科目の表示対象とする勘定キーワード。
   *
   * 動作:
   *   - BS 全体 (大区分・中区分・全勘定) はそのまま残す
   *   - **指定 keyword の勘定の補助科目・取引先だけ展開可能**
   *   - 非対象勘定 (棚卸資産・短期借入金 等) の補助科目・取引先は drop
   *     (親勘定の行自体は残るので BS 残高は読める)
   *
   * 省略時 / 空配列 [] は全補助科目を残す。
   * 指定時だけ、その勘定の補助科目・取引先を展開する。
   */
  filterAccountKeywords?: string[];
  /** rowKeyの先頭prefix。BS/PLを同じUIで扱うため、コメント用keyの衝突を防ぐ。 */
  rowKeyPrefix?: string;
  /**
   * 直近3ヶ月の各勘定の借方/貸方発生額。AGING_3M 誤検知抑制に使う。
   * key = '/' 区切りの name path (例: "資産の部/流動資産/売掛金/株式会社サンプル")。
   *
   * 動作:
   *   - 直近3ヶ月で debit > 0 OR credit > 0 の勘定 = 「動きあり」 → AGING_3M 抑制
   *   - 「毎月55万売上 + 毎月55万入金 = 残高一定」のような相殺パターンでも、
   *     debit/credit 両方発生しているので activity ありと判定される
   *   - 売掛金のような回転勘定は両側発生で OK、前払/仮払は片側発生でも意味があるので
   *     とりあえず「片側でも発生していれば抑制」の暫定ルール
   *
   * 未指定時は抑制なし (= 既存の純粋な月末残高同額判定のまま)。
   */
  recentActivityByPath?: Map<string, { debit: number; credit: number }>;
}

interface BuildOutput {
  rows: ChoshoPreviewRow[];
  /** MF columns から解釈した月順 (例: [4,5,6,...,3])。 */
  monthOrder: number[];
}

interface MonthColumn {
  month: number;
  index: number;
}

interface MetricColumnIndexes {
  settlementBalance: number;
  total: number;
}

/**
 * 回転性勘定の親キーワード。これらが祖先 row.name に含まれ、かつ自身が level >= 2 (補助 or 取引先)
 * の行は agingCheckEnabled = true をデフォルト適用する。
 *
 * 中小企業の調書で 3ヶ月以上滞留検知が刺さる定番科目。
 * 棚卸資産・短期借入金は同額が正しい場合があるため除外。
 */
const RECEIVABLE_ACCOUNT_KEYWORDS = [
  '売掛金',
  '未収金',
  '前払金',
  '仮払金',
  '立替金',
] as const;

export function buildChoshoPreviewRows(input: BuildInput): BuildOutput {
  if (!input.bsTransition) {
    return { rows: [], monthOrder: [] };
  }

  // columns 例: ["4","5","6","7","8","9","10","11","12","1","2","3","settlement_balance","total"]
  // 数字 column の index を保持し、PL の total-only 形式にも耐える。
  const monthColumns: MonthColumn[] = input.bsTransition.columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => /^\d+$/.test(column))
    .map(({ column, index }) => ({ month: parseInt(column, 10), index }));
  const monthOrder = monthColumns.map(({ month }) => month);
  const metricIndexes: MetricColumnIndexes = {
    settlementBalance: input.bsTransition.columns.indexOf('settlement_balance'),
    total: input.bsTransition.columns.indexOf('total'),
  };

  const out: ChoshoPreviewRow[] = [];
  flattenMfRows(
    input.bsTransition.rows,
    null,
    0,
    monthColumns,
    metricIndexes,
    out,
    input.rowKeyPrefix ?? 'bs',
  );

  // 階層情報 (祖先 name list) を解決してから rule defaults / anomalies を埋める。
  applyRulesAndDetectAnomalies(
    out,
    monthOrder,
    input.selectedMonth,
    input.ruleOverrides,
    input.recentActivityByPath,
  );

  // BS/PL 全体は残す。filterAccountKeywords 指定時だけ、非対象勘定の補助科目以下を drop。
  const keywords = input.filterAccountKeywords ?? [];
  const filtered =
    keywords.length > 0 ? filterSubAccountsToTargetAccounts(out, keywords) : out;

  // hasChildren を抽出後の状態で再計算 (drop された補助があれば false に)
  // displayOrder は新配列の index で再付与
  const parentRowKeys = new Set(
    filtered.map((r) => r.parentRowKey).filter((v): v is string => !!v),
  );
  const result = filtered.map((r, i) => ({
    ...r,
    hasChildren: parentRowKeys.has(r.rowKey),
    displayOrder: i,
  }));

  return { rows: result, monthOrder };
}

/**
 * 補助科目以下 (= mfType==='account' の行の子孫) を、指定 keyword を含む親勘定の
 * 下にあるものだけ残し、それ以外は drop する純関数。
 *
 * 残す:
 *   - 大区分 / 中区分 (mfType !== 'account')
 *   - すべての親勘定 (= mfType==='account' で祖先に account を持たない行)
 *   - 対象 keyword を含む親勘定の補助科目・取引先
 *
 * drop:
 *   - 非対象勘定 (棚卸資産・短期借入金 等) の補助科目・取引先
 *   - つまり親勘定の行自体は残るので BS 残高合計は崩れない
 */
export function filterSubAccountsToTargetAccounts(
  rows: ChoshoPreviewRow[],
  keywords: string[],
): ChoshoPreviewRow[] {
  if (rows.length === 0) return [];
  const byKey = new Map(rows.map((r) => [r.rowKey, r]));

  return rows.filter((r) => {
    // 大区分・中区分は素通し
    if (r.mfType !== 'account') return true;

    // 自身は account。祖先 chain を辿って最初に見つかる account 祖先で判定:
    //   - account 祖先がある = 自身は「補助科目 or 取引先」 → 親勘定が対象 keyword を含むか
    //   - account 祖先が無い = 自身は「親勘定」 → 残す
    let cur: ChoshoPreviewRow | undefined =
      r.parentRowKey ? byKey.get(r.parentRowKey) : undefined;
    while (cur) {
      if (cur.mfType === 'account') {
        // 補助/取引先と判明。 cur (親勘定) が対象 keyword を含めば残す。
        // ただし cur の祖先にさらに account があれば cur 自体も補助で、その上の親勘定で判定する必要あり。
        // 親勘定の特定: account chain の最も上 (祖先で account でない最初の親の直下)
        let topAccount: ChoshoPreviewRow = cur;
        while (true) {
          const grand = topAccount.parentRowKey
            ? byKey.get(topAccount.parentRowKey)
            : undefined;
          if (!grand || grand.mfType !== 'account') break;
          topAccount = grand;
        }
        return keywords.some((k) => topAccount.name.includes(k));
      }
      cur = cur.parentRowKey ? byKey.get(cur.parentRowKey) : undefined;
    }
    // 自身が親勘定 (account 祖先なし) → 残す
    return true;
  });
}

// ============================================================
// flatten
// ============================================================

function flattenMfRows(
  rows: MfReportRow[],
  parentKey: string | null,
  level: number,
  monthColumns: MonthColumn[],
  metricIndexes: MetricColumnIndexes,
  out: ChoshoPreviewRow[],
  pathSeed: string,
): void {
  rows.forEach((row, idx) => {
    const rowKey = makeRowKey(pathSeed, idx, row.name);
    const monthlyBalances: Record<number, number> = {};
    monthColumns.forEach(({ month, index }) => {
      const v = row.values[index];
      if (typeof v === 'number') {
        monthlyBalances[month] = v;
      }
    });

    const settlementBalance = numberOrNull(
      metricIndexes.settlementBalance >= 0
        ? row.values[metricIndexes.settlementBalance]
        : undefined,
    );
    const total = numberOrNull(
      metricIndexes.total >= 0 ? row.values[metricIndexes.total] : undefined,
    );
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
      // Rule fields は applyRulesAndDetectAnomalies で上書き。一旦 NONE でプレースホルド。
      expectedRule: 'NONE',
      expectedValue: null,
      agingCheckEnabled: false,
      anomalies: [],
      agingSuppressedBy: null,
    });

    if (hasChildren && row.rows) {
      flattenMfRows(
        row.rows,
        rowKey,
        level + 1,
        monthColumns,
        metricIndexes,
        out,
        rowKey,
      );
    }
  });
}

function numberOrNull(v: number | null | undefined): number | null {
  return typeof v === 'number' ? v : null;
}

function makeRowKey(parent: string, index: number, name: string): string {
  const safeName = name.replace(/[\/\s]+/g, '_').slice(0, 32);
  return `${parent}/${index}-${safeName}`;
}

// ============================================================
// rule defaults + anomaly detection
// ============================================================

/**
 * 全行を 1 パスで走査し、(1) ヒューリスティックで agingCheckEnabled を仮設定、
 * (2) ruleOverrides で上書き、(3) selectedMonth に対して異常検知を実行。
 *
 * 副作用で out の各行の expectedRule / agingCheckEnabled / anomalies を更新する。
 */
function applyRulesAndDetectAnomalies(
  out: ChoshoPreviewRow[],
  monthOrder: number[],
  selectedMonth: number | undefined,
  ruleOverrides: Map<string, ChoshoRuleOverride> | undefined,
  recentActivityByPath: Map<string, { debit: number; credit: number }> | undefined,
): void {
  // rowKey -> row 引きの map
  const byKey = new Map(out.map((r) => [r.rowKey, r]));

  for (const row of out) {
    // (1) ヒューリスティック: 祖先 name に回転性勘定キーワードが含まれ、自身が level >= 2 なら ON
    row.agingCheckEnabled = isReceivableDescendant(row, byKey);

    // (2) ruleOverrides
    const ov = ruleOverrides?.get(row.rowKey);
    if (ov) {
      if (ov.expectedRule != null) row.expectedRule = ov.expectedRule;
      if (ov.expectedValue !== undefined) row.expectedValue = ov.expectedValue;
      if (ov.agingCheckEnabled != null) row.agingCheckEnabled = ov.agingCheckEnabled;
    }

    // (3) 異常検知 (selectedMonth 指定時のみ)
    if (selectedMonth != null) {
      // recentActivity の lookup 用に name path を解決
      const path = recentActivityByPath ? buildNamePath(row, byKey) : null;
      const activity =
        path != null ? (recentActivityByPath?.get(path) ?? null) : null;
      const result = detectAnomalies(row, monthOrder, selectedMonth, activity);
      row.anomalies = result.anomalies;
      row.agingSuppressedBy = result.agingSuppressedBy;
    }
  }
}

/**
 * 行の祖先を辿って '/' 区切りの name path を組み立てる。
 * recentActivityByPath / 試算表 row 側でも同じロジックで path を作って match させる。
 */
export function buildNamePath(
  row: ChoshoPreviewRow,
  byKey: Map<string, ChoshoPreviewRow>,
): string {
  const parts: string[] = [row.name];
  let cur: ChoshoPreviewRow | undefined = row;
  while (cur && cur.parentRowKey) {
    const parent = byKey.get(cur.parentRowKey);
    if (!parent) break;
    parts.unshift(parent.name);
    cur = parent;
  }
  return parts.join('/');
}

/**
 * level >= 2 (補助 or 取引先) で、祖先の name に回転性勘定キーワードが含まれるか。
 * level 0/1 自身は判定対象外。
 */
function isReceivableDescendant(
  row: ChoshoPreviewRow,
  byKey: Map<string, ChoshoPreviewRow>,
): boolean {
  if (row.level < 2) return false;
  let cur: ChoshoPreviewRow | undefined = row;
  // 祖先を辿って一致するか確認。自身は対象外なので親から開始。
  while (cur && cur.parentRowKey) {
    const parent = byKey.get(cur.parentRowKey);
    if (!parent) break;
    if (RECEIVABLE_ACCOUNT_KEYWORDS.some((k) => parent.name.includes(k))) {
      return true;
    }
    cur = parent;
  }
  return false;
}

/**
 * 1 行に対する選択月の異常を全種類チェックして返す。
 * 異常が複数発火する設計だが Unit 2B-1 のルールセットでは実質 1 件。
 *
 * @param activity 直近3ヶ月の借方/貸方発生額。AGING_3M 抑制判定に使う。null なら抑制なし。
 */
interface DetectResult {
  anomalies: ChoshoAnomaly[];
  /** 同額条件は満たしたが activity 抑制で aging が発火しなかった場合の活動量。 */
  agingSuppressedBy: { debit: number; credit: number } | null;
}

function detectAnomalies(
  row: ChoshoPreviewRow,
  monthOrder: number[],
  selectedMonth: number,
  activity: { debit: number; credit: number } | null,
): DetectResult {
  const anomalies: ChoshoAnomaly[] = [];
  let agingSuppressedBy: { debit: number; credit: number } | null = null;

  // 期待残高違反: expectedRule === EXPECTED_VALUE で対象月残高が expected_value と一致しない
  if (row.expectedRule === 'EXPECTED_VALUE' && row.expectedValue !== null) {
    const v = row.monthlyBalances[selectedMonth];
    if (typeof v === 'number' && v !== row.expectedValue) {
      anomalies.push({
        type: 'EXPECTED_VALUE_VIOLATION',
        month: selectedMonth,
        message: `期待残高 ${formatYen(row.expectedValue)} と一致しません (実残高 ${formatYen(v)})`,
        detail: { actualAmount: v, expectedValue: row.expectedValue },
      });
    }
  }

  // 3ヶ月以上滞留: agingCheckEnabled or expectedRule === AGING_3M
  // 条件: 対象月を含む直近3ヶ月の非ゼロ残高が同額、かつその期間に増減がない
  if (row.agingCheckEnabled || row.expectedRule === 'AGING_3M') {
    const aging = checkAging3M(row.monthlyBalances, monthOrder, selectedMonth);
    if (aging.stagnant) {
      // activity 抑制: 直近3ヶ月で debit > 0 OR credit > 0 なら「動きあり」
      // (毎月55万売上 + 毎月55万入金 = 残高一定 のような相殺パターンも debit/credit
      //  両方発生しているので、ここで滞留判定を抑制できる)
      const hasActivity =
        activity != null && (activity.debit > 0 || activity.credit > 0);
      if (!hasActivity) {
        anomalies.push({
          type: 'AGING_3M',
          month: selectedMonth,
          message: `直近3ヶ月 (${aging.monthsChecked!.join('/')}月) の残高が ${formatYen(aging.sameAmount!)} で動いていません`,
          detail: {
            sameAmount: aging.sameAmount,
            monthsChecked: aging.monthsChecked,
          },
        });
      } else {
        // UI tooltip で「動きあり」と理由を見せるため、抑制元の数値を出力に残す
        agingSuppressedBy = activity;
      }
    }
  }

  return { anomalies, agingSuppressedBy };
}

interface AgingResult {
  stagnant: boolean;
  sameAmount?: number;
  /** 比較に使った月 [古い→新しい] */
  monthsChecked?: number[];
}

/**
 * 3ヶ月以上滞留判定。
 *
 * 定義 (Unit 2B-1):
 *   対象月を含む直近3ヶ月の非ゼロ残高が同額、かつその期間に増減がない。
 *
 * 判定不能 = false:
 *   - selectedMonth が monthOrder の先頭2月以内 (比較材料が足りない)
 *   - いずれかの月で残高が欠落 (MF 未取得)
 *   - 対象月残高が 0 (滞留判定の対象外)
 *
 * 部分入金や軽微変動の許容は将来 detail に閾値を持たせて拡張する。
 */
function checkAging3M(
  monthlyBalances: Record<number, number>,
  monthOrder: number[],
  selectedMonth: number,
): AgingResult {
  const idx = monthOrder.indexOf(selectedMonth);
  if (idx < 2) return { stagnant: false };

  const m0 = monthOrder[idx - 2];
  const m1 = monthOrder[idx - 1];
  const m2 = monthOrder[idx];
  const v0 = monthlyBalances[m0];
  const v1 = monthlyBalances[m1];
  const v2 = monthlyBalances[m2];

  if (v0 == null || v1 == null || v2 == null) return { stagnant: false };
  if (v2 === 0) return { stagnant: false };
  if (v0 !== v1 || v1 !== v2) return { stagnant: false };

  return { stagnant: true, sameAmount: v2, monthsChecked: [m0, m1, m2] };
}

function formatYen(n: number): string {
  return `¥${Math.round(n).toLocaleString()}`;
}
