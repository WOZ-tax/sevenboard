import { Injectable } from '@nestjs/common';
import {
  MfReportRow,
  MfTrialBalance,
  MfTransition,
  TB_COL,
  FinancialStatementRow,
  FinancialIndicators,
  CashflowDerived,
  CashflowRow,
  DashboardSummary,
  PlTransitionPoint,
} from './types/mf-api.types';

/**
 * MF推移表のcolumns配列から月ラベルを動的生成。
 * 例: ["1","2",...,"12","settlement_balance","total"] → ["1月","2月",...,"12月"]
 * 例: ["4","5",...,"3","settlement_balance","total"]  → ["4月","5月",...,"3月"]
 */
function buildMonthLabels(columns: string[]): string[] {
  return columns
    .filter((c) => /^\d+$/.test(c)) // 数字のみ（settlement_balance, totalを除外）
    .map((c) => `${c}月`);
}

// フォールバック用（columnsがない場合のみ使用）
const DEFAULT_MONTH_COUNT = 12;

// 人件費科目
const PAYROLL_ACCOUNTS = new Set([
  '役員報酬',
  '給料賃金',
  '賞与',
  '雑給',
  '退職給与',
  '法定福利費',
  '福利厚生費',
]);

// 非資金科目（PLに計上されるがキャッシュアウトしない）
const NON_CASH_ACCOUNTS = new Set([
  '減価償却費',
  '繰延資産償却',
  '貸倒引当金繰入額',
]);

@Injectable()
export class MfTransformService {
  // ============================
  // Helper: 再帰的に行を検索
  // ============================
  private findRow(
    rows: MfReportRow[],
    name: string,
  ): MfReportRow | null {
    for (const row of rows) {
      if (row.name === name) return row;
      if (row.rows) {
        const found = this.findRow(row.rows, name);
        if (found) return found;
      }
    }
    return null;
  }

  private findRowByPartial(
    rows: MfReportRow[],
    partial: string,
  ): MfReportRow | null {
    for (const row of rows) {
      if (row.name.includes(partial)) return row;
      if (row.rows) {
        const found = this.findRowByPartial(row.rows, partial);
        if (found) return found;
      }
    }
    return null;
  }

  private val(row: MfReportRow | null, colIdx: number): number {
    if (!row) return 0;
    return (row.values[colIdx] as number) || 0;
  }

  /**
   * 推移表から月次値を取得（月数分）
   */
  private monthlyValues(row: MfReportRow | null, monthCount: number = DEFAULT_MONTH_COUNT): number[] {
    if (!row) return new Array(monthCount).fill(0);
    return Array.from({ length: monthCount }, (_, i) => (row.values[i] as number) || 0);
  }

  /**
   * 子行を集計（指定科目名に一致するもの）
   */
  private sumChildAccounts(
    parentRow: MfReportRow | null,
    accountNames: Set<string>,
    monthIndex: number,
  ): number {
    if (!parentRow?.rows) return 0;
    let sum = 0;
    for (const child of parentRow.rows) {
      if (accountNames.has(child.name)) {
        sum += (child.values[monthIndex] as number) || 0;
      }
    }
    return sum;
  }

  private sumChildAccountsMonthly(
    parentRow: MfReportRow | null,
    accountNames: Set<string>,
    monthCount: number = DEFAULT_MONTH_COUNT,
  ): number[] {
    return Array.from({ length: monthCount }, (_, i) =>
      this.sumChildAccounts(parentRow, accountNames, i),
    );
  }

  // ============================
  // PL 試算表 → 財務諸表画面
  // ============================
  transformTrialBalancePL(data: MfTrialBalance, priorData?: MfTrialBalance | null): FinancialStatementRow[] {
    const rows: FinancialStatementRow[] = [];

    const mapping: {
      name: string;
      label: string;
      isTotal?: boolean;
    }[] = [
      { name: '売上高合計', label: '売上高' },
      { name: '売上原価', label: '売上原価' },
      {
        name: '売上総利益',
        label: '売上総利益',
        isTotal: true,
      },
      {
        name: '売上総損失',
        label: '売上総利益',
        isTotal: true,
      },
      {
        name: '販売費及び一般管理費合計',
        label: '販売費及び一般管理費',
      },
      { name: '営業利益', label: '営業利益', isTotal: true },
      { name: '営業損失', label: '営業利益', isTotal: true },
      { name: '営業外収益合計', label: '営業外収益' },
      { name: '営業外費用合計', label: '営業外費用' },
      { name: '経常利益', label: '経常利益', isTotal: true },
      { name: '経常損失', label: '経常利益', isTotal: true },
      { name: '特別利益合計', label: '特別利益' },
      { name: '特別損失合計', label: '特別損失' },
      {
        name: '税引前当期純利益',
        label: '税引前当期純利益',
        isTotal: true,
      },
      {
        name: '税引前当期純損失',
        label: '税引前当期純利益',
        isTotal: true,
      },
      { name: '当期純利益', label: '当期純利益', isTotal: true },
      { name: '当期純損失', label: '当期純利益', isTotal: true },
    ];

    // 前期データの取得ヘルパー
    const getPrior = (name: string): number => {
      if (!priorData) return 0;
      // 利益↔損失のペア検索（当期が利益で前期が損失、またはその逆に対応）
      const priorRow = this.findRow(priorData.rows, name)
        || this.findRow(priorData.rows, name.replace('利益', '損失'))
        || this.findRow(priorData.rows, name.replace('損失', '利益'));
      return priorRow ? this.val(priorRow, TB_COL.CLOSING) : 0;
    };

    const seen = new Set<string>();
    for (const m of mapping) {
      const row = this.findRow(data.rows, m.name);
      if (!row) continue;
      if (seen.has(m.label)) continue;
      seen.add(m.label);

      rows.push({
        category: m.label,
        current: this.val(row, TB_COL.CLOSING),
        prior: getPrior(m.name),
        isTotal: m.isTotal,
      });
    }

    const taxRow = this.findRow(data.rows, '法人税等');
    if (taxRow) {
      const netIdx = rows.findIndex((r) => r.category === '当期純利益');
      if (netIdx >= 0) {
        rows.splice(netIdx, 0, {
          category: '法人税等',
          current: this.val(taxRow, TB_COL.CLOSING),
          prior: getPrior('法人税等'),
        });
      }
    }

    return rows;
  }

  // ============================
  // BS 試算表 → 財務諸表画面
  // ============================
  transformTrialBalanceBS(
    data: MfTrialBalance,
    _priorData?: MfTrialBalance | null,
  ): {
    assets: FinancialStatementRow[];
    liabilitiesEquity: FinancialStatementRow[];
  } {
    const assets: FinancialStatementRow[] = [];
    const liabilitiesEquity: FinancialStatementRow[] = [];

    const assetsRoot = data.rows.find((r) => r.type === 'assets');
    const liabRoot = data.rows.find((r) => r.type === 'liabilities');
    const netAssetsRoot = data.rows.find((r) => r.type === 'net_assets');
    const totalRoot = data.rows.find(
      (r) => r.type === 'liabilities_net_assets',
    );

    // 資産の部
    if (assetsRoot?.rows) {
      this.flattenBsSection(assetsRoot.rows, assets);
      assets.push({
        category: '資産合計',
        current: this.val(assetsRoot, TB_COL.CLOSING),
        prior: this.val(assetsRoot, TB_COL.OPENING),
        isTotal: true,
      });
    }

    // 負債の部
    if (liabRoot?.rows) {
      this.flattenBsSection(liabRoot.rows, liabilitiesEquity);
      liabilitiesEquity.push({
        category: '負債合計',
        current: this.val(liabRoot, TB_COL.CLOSING),
        prior: this.val(liabRoot, TB_COL.OPENING),
        isTotal: true,
      });
    }

    // 純資産の部
    if (netAssetsRoot?.rows) {
      this.flattenBsSection(netAssetsRoot.rows, liabilitiesEquity);
      liabilitiesEquity.push({
        category: '純資産合計',
        current: this.val(netAssetsRoot, TB_COL.CLOSING),
        prior: this.val(netAssetsRoot, TB_COL.OPENING),
        isTotal: true,
      });
    }

    // 負債純資産合計
    if (totalRoot) {
      liabilitiesEquity.push({
        category: '負債純資産合計',
        current: this.val(totalRoot, TB_COL.CLOSING),
        prior: this.val(totalRoot, TB_COL.OPENING),
        isTotal: true,
      });
    }

    return { assets, liabilitiesEquity };
  }

  private flattenBsSection(
    rows: MfReportRow[],
    out: FinancialStatementRow[],
  ) {
    for (const row of rows) {
      const isSubtotal = row.name.endsWith(`合計`);
      const hasChildren = row.rows && row.rows.length > 0;

      if (hasChildren && !isSubtotal) {
        // Header row with children
        out.push({
          category: `【${row.name}】`,
          current: 0,
          prior: 0,
          isHeader: true,
        });
        // Recurse into children
        this.flattenBsSection(row.rows!, out);
        // Section subtotal
        out.push({
          category: `${row.name}合計`,
          current: this.val(row, TB_COL.CLOSING),
          prior: this.val(row, TB_COL.OPENING),
          isTotal: true,
        });
      } else if (hasChildren && isSubtotal) {
        // Subtotal row that also has children - expand children then show subtotal
        this.flattenBsSection(row.rows!, out);
        out.push({
          category: row.name,
          current: this.val(row, TB_COL.CLOSING),
          prior: this.val(row, TB_COL.OPENING),
          isTotal: true,
        });
      } else {
        // Leaf row (account or standalone item)
        out.push({
          category: isSubtotal ? row.name : `  ${row.name}`,
          current: this.val(row, TB_COL.CLOSING),
          prior: this.val(row, TB_COL.OPENING),
          isTotal: isSubtotal,
        });
      }
    }
  }

  // ============================
  // 資金繰り導出（BS推移 + PL推移 + BS試算表(期首残高用)）
  // ============================
  deriveCashflow(
    bsTransition: MfTransition,
    plTransition: MfTransition,
    bsTrial?: MfTrialBalance | null,
    settledMonths?: number[],
  ): CashflowDerived {
    const monthLabels = buildMonthLabels(bsTransition.columns);
    const mc = monthLabels.length; // 月数

    // 1. 月次現預金残高（BS推移表は各月末の累計残高）
    const cashRow = this.findRowByPartial(bsTransition.rows, '現金及び預金');
    const cashBalances = this.monthlyValues(cashRow, mc);

    // 期首残高（前期末残高）: BS試算表の opening_balance 列が前期末値そのもの
    // bsTrial が無い場合のみ 0 にフォールバック
    const priorCash = bsTrial
      ? this.val(this.findRowByPartial(bsTrial.rows, '現金及び預金'), TB_COL.OPENING)
      : 0;

    // 2. 月次ネットCF
    const netCf = cashBalances.map((v, i) =>
      i === 0 ? v - priorCash : v - cashBalances[i - 1],
    );

    // 3. 収入側
    const revenueRow = this.findRow(plTransition.rows, '売上高合計');
    const revMonthly = this.monthlyValues(revenueRow, mc);

    const arRow =
      this.findRowByPartial(bsTransition.rows, '売上債権合計') ||
      this.findRow(bsTransition.rows, '売掛金');
    const arBalances = this.monthlyValues(arRow, mc);
    // 期首AR残高: BS試算表の opening_balance（前期末売掛）
    const priorAr = bsTrial
      ? this.val(
          this.findRowByPartial(bsTrial.rows, '売上債権合計') ||
            this.findRow(bsTrial.rows, '売掛金'),
          TB_COL.OPENING,
        )
      : 0;
    const salesCollection = revMonthly.map((rev, i) => {
      const prev = i === 0 ? priorAr : arBalances[i - 1];
      return rev + prev - arBalances[i];
    });

    // その他収入（営業外収益・特別利益）を現金ベースに変換
    //   = 発生主義(PL) + 期首未収入金 − 期末未収入金
    //   未収入金行が無ければ発生主義のままフォールバック
    const nonOpIncRow = this.findRowByPartial(plTransition.rows, '営業外収益');
    const extraIncRow = this.findRowByPartial(plTransition.rows, '特別利益');
    const otherIncomeAccrual = Array.from({ length: mc }, (_, i) =>
      this.val(nonOpIncRow, i) + this.val(extraIncRow, i),
    );
    const otherReceivableRow =
      this.findRowByPartial(bsTransition.rows, '未収入金') ||
      this.findRowByPartial(bsTransition.rows, '未収収益');
    const hasOtherReceivable = otherReceivableRow !== null;
    const otherReceivableBalances = hasOtherReceivable
      ? this.monthlyValues(otherReceivableRow, mc)
      : new Array<number>(mc).fill(0);
    const priorOtherReceivable =
      hasOtherReceivable && bsTrial
        ? this.val(
            this.findRowByPartial(bsTrial.rows, '未収入金') ||
              this.findRowByPartial(bsTrial.rows, '未収収益'),
            TB_COL.OPENING,
          )
        : 0;
    const otherIncome = otherIncomeAccrual.map((inc, i) => {
      if (!hasOtherReceivable) return inc;
      const prev = i === 0 ? priorOtherReceivable : otherReceivableBalances[i - 1];
      return inc + prev - otherReceivableBalances[i];
    });

    const shortBorrow = this.findRow(bsTransition.rows, '短期借入金');
    const longBorrow = this.findRow(bsTransition.rows, '長期借入金');
    const officerBorrow = this.findRow(bsTransition.rows, '役員借入金');
    const borrowBalances = Array.from({ length: mc }, (_, i) =>
      this.val(shortBorrow, i) + this.val(longBorrow, i) + this.val(officerBorrow, i),
    );
    const priorBorrow = bsTrial
      ? this.val(this.findRow(bsTrial.rows, '短期借入金'), TB_COL.OPENING) +
        this.val(this.findRow(bsTrial.rows, '長期借入金'), TB_COL.OPENING) +
        this.val(this.findRow(bsTrial.rows, '役員借入金'), TB_COL.OPENING)
      : 0;
    const borrowInflow = borrowBalances.map((v, i) => {
      const prev = i === 0 ? priorBorrow : borrowBalances[i - 1];
      return Math.max(0, v - prev);
    });

    // 増資（資本金純増）。減資は無視（純増のみ財務調達としてカウント）
    const capitalRow = this.findRow(bsTransition.rows, '資本金');
    const capitalSurplusRow = this.findRowByPartial(bsTransition.rows, '資本剰余金');
    const capitalBalances = Array.from({ length: mc }, (_, i) =>
      this.val(capitalRow, i) + this.val(capitalSurplusRow, i),
    );
    const priorCapital = bsTrial
      ? this.val(this.findRow(bsTrial.rows, '資本金'), TB_COL.OPENING) +
        this.val(this.findRowByPartial(bsTrial.rows, '資本剰余金'), TB_COL.OPENING)
      : 0;
    const equityInflow = capitalBalances.map((v, i) => {
      const prev = i === 0 ? priorCapital : capitalBalances[i - 1];
      return Math.max(0, v - prev);
    });

    // 借入＋増資 = 財務調達inflow
    const financingInflow = borrowInflow.map((b, i) => b + equityInflow[i]);

    // 営業現金収入（財務活動・投資活動を除く）
    const operatingIncome = Array.from({ length: mc }, (_, i) =>
      salesCollection[i] + otherIncome[i],
    );
    const incomeTotal = Array.from({ length: mc }, (_, i) =>
      operatingIncome[i] + financingInflow[i],
    );

    // 4. 支出側
    const cogsRow = this.findRowByPartial(plTransition.rows, '売上原価');
    const cogsMonthly = this.monthlyValues(cogsRow, mc);

    const apRow =
      this.findRowByPartial(bsTransition.rows, '仕入債務合計') ||
      this.findRow(bsTransition.rows, '買掛金');
    const apBalances = this.monthlyValues(apRow, mc);
    const priorAp = bsTrial
      ? this.val(
          this.findRowByPartial(bsTrial.rows, '仕入債務合計') ||
            this.findRow(bsTrial.rows, '買掛金'),
          TB_COL.OPENING,
        )
      : 0;
    const purchasePayment = cogsMonthly.map((cogs, i) => {
      const prev = i === 0 ? priorAp : apBalances[i - 1];
      return cogs + prev - apBalances[i];
    });

    const sgaRow = this.findRowByPartial(plTransition.rows, '販売費及び一般管理費');
    const payrollMonthly = this.sumChildAccountsMonthly(sgaRow, PAYROLL_ACCOUNTS, mc);
    const nonCashMonthly = this.sumChildAccountsMonthly(sgaRow, NON_CASH_ACCOUNTS, mc);

    const sgaMonthly = this.monthlyValues(sgaRow, mc);
    const otherExpense = sgaMonthly.map(
      (sga, i) => sga - payrollMonthly[i] - nonCashMonthly[i],
    );

    const faRow = this.findRowByPartial(bsTransition.rows, '固定資産');
    const faBalances = this.monthlyValues(faRow, mc);
    const priorFa = bsTrial
      ? this.val(this.findRowByPartial(bsTrial.rows, '固定資産'), TB_COL.OPENING)
      : 0;
    const capex = faBalances.map((v, i) => {
      const prev = i === 0 ? priorFa : faBalances[i - 1];
      return Math.max(0, (v - prev) + nonCashMonthly[i]);
    });

    const borrowOutflow = borrowBalances.map((v, i) => {
      const prev = i === 0 ? priorBorrow : borrowBalances[i - 1];
      return Math.max(0, prev - v);
    });

    // 法人税納付額: 期首未払法人税等 + PL計上 − 期末未払法人税等
    //   未払法人税等行が無ければ PL計上額をそのまま使用（フォールバック）
    const taxRow = this.findRow(plTransition.rows, '法人税等');
    const taxMonthly = this.monthlyValues(taxRow, mc);
    const taxPayableRow =
      this.findRowByPartial(bsTransition.rows, '未払法人税等') ||
      this.findRowByPartial(bsTransition.rows, '未払法人税');
    const hasTaxPayable = taxPayableRow !== null;
    const taxPayableBalances = hasTaxPayable
      ? this.monthlyValues(taxPayableRow, mc)
      : new Array<number>(mc).fill(0);
    const priorTaxPayable =
      hasTaxPayable && bsTrial
        ? this.val(
            this.findRowByPartial(bsTrial.rows, '未払法人税等') ||
              this.findRowByPartial(bsTrial.rows, '未払法人税'),
            TB_COL.OPENING,
          )
        : 0;
    const taxPaid = taxMonthly.map((tax, i) => {
      if (!hasTaxPayable) return tax;
      const prev = i === 0 ? priorTaxPayable : taxPayableBalances[i - 1];
      return tax + prev - taxPayableBalances[i];
    });

    // 支出を区分:
    //   営業現金支出（純）= 仕入支払 + 人件費 + その他経費 ← Burn の主計算用、税は除く
    //   税金納付         = 法人税納付（業界標準では Net Burn に含めない）
    //   投資現金支出     = CAPEX（設備投資）
    //   財務現金支出     = 借入返済
    //   ※ 消費税納付は BS差分調整（未払消費税の動き）で吸収
    const operatingCashOutPure = Array.from({ length: mc }, (_, i) =>
      purchasePayment[i] + payrollMonthly[i] + otherExpense[i],
    );
    const taxPayment = taxPaid; // 法人税納付（別建て）
    const investingCashOut = capex;
    const financingCashOut = borrowOutflow;

    const expenseTotal = Array.from({ length: mc }, (_, i) =>
      operatingCashOutPure[i] + taxPayment[i] + investingCashOut[i] + financingCashOut[i],
    );

    // 5. 収支差額
    const calculatedNet = Array.from({ length: mc }, (_, i) =>
      incomeTotal[i] - expenseTotal[i],
    );

    // 6. 調整差額（BS実残高変動 − 推移表からの収支差額。未捕捉項目の残差）
    const adjustment = Array.from({ length: mc }, (_, i) =>
      netCf[i] - calculatedNet[i],
    );

    // 6b. 調整差額の内訳: 既に資金繰り表で扱っていない BS 勘定の月次変動を抽出
    //   - 資産の増 → 現金減 (符号 -1)
    //   - 負債/純資産の増 → 現金増 (符号 +1)
    type AdjCandidate = {
      readonly search: string;
      readonly label: string;
      readonly sign: 1 | -1;
      readonly exact?: boolean;
    };
    const adjCandidates: AdjCandidate[] = [
      // 流動負債（仕入債務・借入金・未払法人税以外）
      { search: '未払金', label: '未払金増減', sign: 1, exact: true },
      { search: '未払費用', label: '未払費用増減', sign: 1, exact: true },
      { search: '預り金', label: '預り金増減（源泉等）', sign: 1, exact: true },
      { search: '前受金', label: '前受金増減', sign: 1, exact: true },
      { search: '前受収益', label: '前受収益増減', sign: 1, exact: true },
      { search: '仮受消費税', label: '仮受消費税増減', sign: 1 },
      // 流動資産（売掛金・固定資産・現預金・未収入金以外）
      { search: '棚卸資産', label: '棚卸資産増減', sign: -1 },
      { search: '商品', label: '商品増減', sign: -1, exact: true },
      { search: '製品', label: '製品増減', sign: -1, exact: true },
      { search: '原材料', label: '原材料増減', sign: -1, exact: true },
      { search: '前払費用', label: '前払費用増減', sign: -1, exact: true },
      { search: '立替金', label: '立替金増減', sign: -1, exact: true },
      { search: '仮払金', label: '仮払金増減', sign: -1, exact: true },
      { search: '仮払消費税', label: '仮払消費税増減', sign: -1 },
      // 投資その他の資産
      { search: '敷金', label: '敷金増減', sign: -1, exact: true },
      { search: '長期前払費用', label: '長期前払費用増減', sign: -1 },
      { search: '保証金', label: '保証金増減', sign: -1, exact: true },
      { search: '投資有価証券', label: '投資有価証券増減', sign: -1 },
      // 固定負債（借入金以外）
      { search: '社債', label: '社債増減', sign: 1, exact: true },
      { search: '退職給付引当金', label: '退職給付引当金増減', sign: 1 },
      { search: '長期未払金', label: '長期未払金増減', sign: 1, exact: true },
    ];

    const adjustmentBreakdown: { category: string; values: number[] }[] = [];
    const seenLabels = new Set<string>();
    for (const c of adjCandidates) {
      const row = c.exact
        ? this.findRow(bsTransition.rows, c.search)
        : this.findRow(bsTransition.rows, c.search) ||
          this.findRowByPartial(bsTransition.rows, c.search);
      if (!row) continue;
      // 同じ親科目を partial で複数回ヒットさせない
      if (seenLabels.has(row.name)) continue;
      seenLabels.add(row.name);

      const balances = this.monthlyValues(row, mc);
      const priorBal =
        bsTrial != null
          ? this.val(
              c.exact
                ? this.findRow(bsTrial.rows, c.search)
                : this.findRow(bsTrial.rows, c.search) ||
                    this.findRowByPartial(bsTrial.rows, c.search),
              TB_COL.OPENING,
            )
          : 0;
      const contribution = balances.map((v, i) => {
        const prev = i === 0 ? priorBal : balances[i - 1];
        return c.sign * (v - prev);
      });

      // 全月ゼロ（その勘定は不使用）または極小値だけの場合は除外
      const hasMaterial = contribution.some((v) => Math.abs(v) >= 1);
      if (!hasMaterial) continue;
      adjustmentBreakdown.push({ category: c.label, values: contribution });
    }

    // 残差（未捕捉分）
    const capturedSum = Array.from({ length: mc }, (_, i) =>
      adjustmentBreakdown.reduce((s, item) => s + item.values[i], 0),
    );
    const uncaptured = adjustment.map((v, i) => v - capturedSum[i]);
    if (uncaptured.some((v) => Math.abs(v) >= 1)) {
      adjustmentBreakdown.push({
        category: 'その他（未捕捉）',
        values: uncaptured,
      });
    }

    // 7. 資金繰り表
    const rows: CashflowRow[] = [
      { category: '前月繰越', values: cashBalances.map((_, i) => (i === 0 ? priorCash : cashBalances[i - 1])), isTotal: true },
      { category: '【収入の部】', values: new Array(mc).fill(null), isHeader: true },
      { category: '  売上回収', values: salesCollection },
      { category: '  その他収入', values: otherIncome },
      { category: '  借入・増資', values: financingInflow },
      { category: '収入合計', values: incomeTotal, isTotal: true },
      { category: '【支出の部】', values: new Array(mc).fill(null), isHeader: true },
      // 営業活動
      { category: '  仕入支払', values: purchasePayment },
      { category: '  人件費', values: payrollMonthly },
      { category: '  その他経費', values: otherExpense },
      // 投資活動
      { category: '  設備投資', values: capex },
      // 税金（営業バーンには含めないが現金は出ていく）
      { category: '  法人税等納付', values: taxPaid },
      // 財務活動
      { category: '  借入返済', values: borrowOutflow },
      { category: '支出合計', values: expenseTotal, isTotal: true },
      { category: '収支差額', values: calculatedNet, isTotal: true, isDiff: true },
      { category: 'BS差分調整', values: adjustment, isTotal: true },
      // 内訳（インデント付き）
      ...adjustmentBreakdown.map((item) => ({
        category: `    ${item.category}`,
        values: item.values,
      })),
      { category: '期末残高', values: cashBalances, isTotal: true },
    ];

    // 8. ランウェイ
    //   - Gross Burn  = 営業現金支出のみ（売上回収ゼロの保守ケース）
    //   - Net Burn    = -(PL経常利益 + 非資金費用)。AR回収など一時的な cash basis 入金を除く構造的損失
    //   - Actual Burn = BS現預金純減 + 財務ネット（流入プラス/流出マイナス）。実際の営業+投資キャッシュ消費
    //   - 借入・増資・借入返済（財務活動）は Actual Burn から除外
    const settlementIdx = plTransition.columns.indexOf('settlement_balance');
    let annualNonCash = 0;
    if (settlementIdx >= 0 && sgaRow?.rows) {
      for (const child of sgaRow.rows) {
        if (NON_CASH_ACCOUNTS.has(child.name)) {
          annualNonCash += (child.values[settlementIdx] as number) || 0;
        }
      }
    }
    const monthlyNonCashSum = nonCashMonthly.reduce((a, b) => a + b, 0);
    const settlementOnlyNonCash = Math.max(0, annualNonCash - monthlyNonCashSum);

    // Burn rate はレビュー中/締め済みの月だけを実績として扱う。
    // 月締めステータスが未設定の環境では、営業活動がある月へフォールバックする。
    const activityMonths: number[] = [];
    for (let i = 0; i < mc; i++) {
      const hasActivity =
        payrollMonthly[i] !== 0 ||
        otherExpense[i] !== 0 ||
        cogsMonthly[i] !== 0;
      if (hasActivity) activityMonths.push(i);
    }
    const settledMonthSet = settledMonths?.length ? new Set(settledMonths) : null;
    const settledIdxs = settledMonthSet
      ? monthLabels
          .map((label, i) => ({ i, month: parseInt(label, 10) }))
          .filter(({ month }) => settledMonthSet.has(month))
          .map(({ i }) => i)
      : [];
    const activeMonths = settledIdxs.length > 0 ? settledIdxs : activityMonths;

    // 営業現金収入 = 売上回収 + その他現金収入
    const operatingCashIn = operatingIncome;

    // 営業現金支出（既に非資金は otherExpense で除外済み、ここでは決算非資金の按分のみ補正）
    //   ※ operatingCashOutPure = purchasePayment + payroll + otherExpense
    //      otherExpense = sga - payroll - nonCash なので operatingCashOutPure = cogs+ΔAP + sga - nonCash
    //      → ここで再度 nonCashMonthly を引くと二重控除になるので引かない
    //   決算非資金（settlement_balance に集約された繰延償却等）は active 月に按分
    const activeCount = Math.max(1, activeMonths.length);
    const monthlyNonCashAdjustActive = settlementOnlyNonCash / activeCount;
    const operatingCashOut = operatingCashOutPure.map((exp, i) => {
      const adjust = activeMonths.includes(i) ? monthlyNonCashAdjustActive : 0;
      return exp - adjust;
    });
    const nonCashForBurn = nonCashMonthly.map((amount, i) => {
      const adjust = activeMonths.includes(i) ? monthlyNonCashAdjustActive : 0;
      return amount + adjust;
    });
    const recentIdx = activeMonths.slice(-3);
    const avgOf = (arr: number[], idxs: number[]) =>
      idxs.length > 0 ? idxs.reduce((s, i) => s + arr[i], 0) / idxs.length : 0;

    const avgOpCashOut = avgOf(operatingCashOut, recentIdx);
    const avgInvCashOut = avgOf(investingCashOut, recentIdx);
    const avgTaxPayment = avgOf(taxPayment, recentIdx);
    const ordinaryProfitRow =
      this.findRow(plTransition.rows, '経常利益') ||
      this.findRow(plTransition.rows, '経常損失');
    // フォールバック: 経常利益行が無い場合は PL 等価式で計算
    //   経常利益 = 売上 − 売上原価 − 販管費 + 営業外収益 − 営業外費用
    //   ※ 売上回収(cash basis)ではなく PL 売上を使う（PL 等価のため）
    const nonOpExpRow = this.findRowByPartial(plTransition.rows, '営業外費用');
    const nonOpExpMonthly = this.monthlyValues(nonOpExpRow, mc);
    const ordinaryProfitMonthly = ordinaryProfitRow
      ? this.monthlyValues(ordinaryProfitRow, mc).map((v) =>
          ordinaryProfitRow.name === '経常損失' && v > 0 ? -v : v,
        )
      : Array.from({ length: mc }, (_, i) => {
          const otherIncomeAccrualVal = this.val(nonOpIncRow, i) + this.val(extraIncRow, i);
          return revMonthly[i] - cogsMonthly[i] - sgaMonthly[i]
            + otherIncomeAccrualVal - nonOpExpMonthly[i];
        });
    const structuralCashProfit = ordinaryProfitMonthly.map(
      (profit, i) => profit + nonCashForBurn[i],
    );

    const grossBurn = Math.max(0, avgOpCashOut);
    const netBurnRate = -avgOf(structuralCashProfit, recentIdx);

    // BS残高変動から計算した「実バーン（純）」：これと actualBurn の差が「未捕捉」差分
    const avgFinancingNet = avgOf(
      borrowInflow.map((b, i) => b + equityInflow[i] - borrowOutflow[i]),
      recentIdx,
    );
    const avgRealBalanceDrop = (() => {
      const drops: number[] = [];
      for (let i = 0; i < mc; i++) {
        const prev = i === 0 ? priorCash : cashBalances[i - 1];
        drops.push(prev - cashBalances[i]); // プラス=減少
      }
      return avgOf(drops, recentIdx);
    })();
    const actualBurn = avgRealBalanceDrop + avgFinancingNet;
    const otherWorkingCapital = actualBurn - netBurnRate; // AR回収・前受金取崩し・税/CAPEX等による乖離

    // 最新月の現金残高 = 直近の active な月の月末残高
    //   activeMonths.slice(-1) を使うことで、未経過月（前月末からの carry forward）を除外
    const latestCash =
      activeMonths.length > 0
        ? cashBalances[activeMonths[activeMonths.length - 1]]
        : (() => {
            // 念のため active 月がゼロの場合のフォールバック
            for (let i = mc - 1; i >= 0; i--) {
              if (cashBalances[i] !== 0) return cashBalances[i];
            }
            return 0;
          })();

    const round1 = (v: number) =>
      Number.isFinite(v) ? Math.round(v * 10) / 10 : 999;
    const monthsToAlert = (m: number): 'SAFE' | 'CAUTION' | 'WARNING' | 'CRITICAL' => {
      if (m >= 12) return 'SAFE';
      if (m >= 6) return 'CAUTION';
      if (m >= 3) return 'WARNING';
      return 'CRITICAL';
    };

    // ∞(=999) は「Burn ≤ 0（= 営業/FCF 黒字）」の場合のみ
    const worstMonths = grossBurn > 0 ? round1(latestCash / grossBurn) : 999;
    const netBurnMonths =
      netBurnRate <= 0 ? 999 : round1(latestCash / netBurnRate);
    const actualMonths = actualBurn <= 0 ? 999 : round1(latestCash / actualBurn);

    const variants = {
      worstCase: {
        months: worstMonths,
        basis: Math.round(grossBurn),
        alertLevel: monthsToAlert(worstMonths),
      },
      netBurn: {
        months: netBurnMonths,
        basis: Math.round(netBurnRate),
        alertLevel: monthsToAlert(netBurnMonths),
      },
      actual: {
        months: actualMonths,
        basis: Math.round(actualBurn),
        alertLevel: monthsToAlert(actualMonths),
      },
    };

    // dataQuality: active 月の判定ソース
    //   - settled: MonthlyClose の締め済み月を採用（信頼度 HIGH）
    //   - heuristic: 月次締め未設定。人件費等の有無で推定（信頼度 MEDIUM）
    //   - none: active 月が特定できない（信頼度 LOW、数値は参考値）
    const dataQuality: 'settled' | 'heuristic' | 'none' =
      settledIdxs.length > 0
        ? 'settled'
        : activeMonths.length > 0
          ? 'heuristic'
          : 'none';
    // active 月のカレンダー月番号（1-12）に変換
    const activeMonthNumbers = activeMonths
      .map((i) => parseInt((monthLabels[i] ?? '').replace('月', ''), 10))
      .filter((m) => Number.isFinite(m));

    const composition = {
      netBurn: Math.round(netBurnRate),
      capex: Math.round(avgInvCashOut),
      taxPayment: Math.round(avgTaxPayment),
      actualBurn: Math.round(actualBurn),
      financingNet: Math.round(avgFinancingNet),
      realBalanceDrop: Math.round(avgRealBalanceDrop),
      otherWorkingCapital: Math.round(otherWorkingCapital),
      dataQuality,
      activeMonths: activeMonthNumbers,
    };

    // 既定は構造的な事業消費を示す Net Burn。
    const defaultMode: 'worstCase' | 'netBurn' | 'actual' = 'netBurn';
    const def = variants[defaultMode];

    return {
      months: monthLabels,
      cashBalances,
      rows,
      runway: {
        months: def.months,
        cashBalance: latestCash,
        monthlyBurnRate: def.basis,
        alertLevel: def.alertLevel,
        defaultMode,
        variants,
        composition,
      },
    };
  }

  // ============================
  // AI プロンプト用 Burn コンテキスト
  // ============================
  /**
   * AI プロンプトに渡すためのランウェイ/バーン情報を文字列化。
   * - **主指標 = ユーザーが資金繰りページで選択中のモード**（userMode）。
   *   未指定時は Net Burn を主指標とする
   * - 経営判断のアンカーとして Net Burn は常に併記（Actual と乖離があれば構造的体力を見失わせないため）
   * - composition で乖離原因（運転資本変動・財務）を伝える
   */
  formatBurnContextForPrompt(
    cashflowDerived: CashflowDerived,
    userMode?: 'worstCase' | 'netBurn' | 'actual',
  ): string {
    const r = cashflowDerived.runway;
    const cash = r.cashBalance;
    const fmtMonths = (m: number) => (m >= 999 ? '∞' : `${m.toFixed(1)}ヶ月`);
    const fmtYen = (n: number) => `${Math.round(n / 10000).toLocaleString('ja-JP')}万円`;
    const labels: Record<'worstCase' | 'netBurn' | 'actual', string> = {
      worstCase: 'Gross Burn(営業支出のみ・売上ゼロ最悪ケース)',
      netBurn: 'Net Burn(事業の構造的損失=−経常利益−非資金費用、つまり経常損失から非資金分を差し引いた実質損失)',
      actual: 'Actual Burn(BS現預金純減から財務ネット流入分を差し引いた実際の op+inv 消費=BS純減−財務ネット)',
    };
    const fmtMode = (mode: 'worstCase' | 'netBurn' | 'actual') => {
      const v = r.variants[mode];
      const burnSign = v.basis > 0 ? `${fmtYen(v.basis)}/月の消費` : v.basis < 0 ? `${fmtYen(Math.abs(v.basis))}/月の純流入` : '0';
      return `${labels[mode]}: ランウェイ ${fmtMonths(v.months)} (${burnSign}, ${v.alertLevel})`;
    };

    const lines: string[] = [];
    lines.push(`## ランウェイ（最新現預金 ${fmtYen(cash)}）`);
    if (r.composition?.dataQuality === 'heuristic') {
      lines.push(
        `※ データ信頼度 MEDIUM: 月次締め(MonthlyClose)が未設定のため、人件費・経費が動いた月をヒューリスティックに「実績月」と推定しています。月次締めを行うと信頼度が HIGH になります。`,
      );
    } else if (r.composition?.dataQuality === 'none') {
      lines.push(
        `※ データ信頼度 LOW: 実績月が特定できませんでした。月次締め(MonthlyClose)の運用開始 or PL データの入力状態を確認してください。`,
      );
    }
    // 主指標は資金繰りページのトグルに合わせる（ユーザーがページで見ている数字と AI レポートの主指標を一致させる）
    const primaryMode: 'worstCase' | 'netBurn' | 'actual' = userMode ?? 'netBurn';
    lines.push(`**主指標（ユーザー選択: ${primaryMode}）** ${fmtMode(primaryMode)}`);
    // 構造的体力のアンカーとして Net Burn は常に併記（主指標が Net Burn の場合は省略）
    if (primaryMode !== 'netBurn') {
      lines.push(`参考(構造的損失基準): ${fmtMode('netBurn')}`);
    }
    if (primaryMode !== 'worstCase') {
      lines.push(`参考(売上ゼロ最悪): ${fmtMode('worstCase')}`);
    }
    if (primaryMode !== 'actual') {
      lines.push(`参考(BS純減基準): ${fmtMode('actual')}`);
    }

    if (r.composition) {
      const c = r.composition;
      const wcSign = c.otherWorkingCapital > 0 ? '＋' : '−';
      const wcAbs = Math.abs(c.otherWorkingCapital);
      // 財務ネット流出 = -financingNet（プラス=純流出）
      // BS純減 = Actual Burn - financingNet なので「ActualBurn + 財務純流出 = BS純減」と表現する
      const finOut = -c.financingNet;
      const finOutSign = finOut > 0 ? '＋' : '−';
      const finOutAbs = Math.abs(finOut);
      lines.push(`乖離内訳（直近3ヶ月平均、Burn視点でプラス=現金消費）:`);
      lines.push(`- Net Burn(構造的損失=経常損失−非資金費用): ${fmtYen(c.netBurn)}/月`);
      lines.push(`- ${wcSign} 運転資本変動・税/CAPEX等: ${fmtYen(wcAbs)}/月 (${c.otherWorkingCapital < 0 ? 'AR回収・前受金等の追い風' : '消費税納付等の重し'})`);
      lines.push(`= Actual Burn: ${fmtYen(c.actualBurn)}/月`);
      lines.push(`- ${finOutSign} 財務純流出(借入返済−借入流入−増資): ${fmtYen(finOutAbs)}/月`);
      lines.push(`= BS現預金純減: ${fmtYen(c.realBalanceDrop)}/月`);
      lines.push(`(恒等式: BS純減 = Actual Burn − 財務ネット流入 = Actual Burn + 財務純流出)`);
    }

    const netMonths = r.variants.netBurn.months;
    const actualMonths = r.variants.actual.months;
    if (Number.isFinite(netMonths) && Number.isFinite(actualMonths) && Math.abs(netMonths - actualMonths) >= 3) {
      const lead = primaryMode === 'actual'
        ? '主指標 Actual Burn は楽観に振れている可能性があります。'
        : primaryMode === 'worstCase'
          ? '主指標 Gross Burn は最悪ケースで、現実は Net Burn / Actual Burn の中間に着地する想定です。'
          : '主指標 Net Burn と Actual Burn に乖離があります。';
      lines.push(
        `\n**注意**: ${lead} Net Burn と Actual Burn の乖離 ${Math.abs(netMonths - actualMonths).toFixed(1)}ヶ月。Actual の楽観値は AR 回収・前受金取崩しなど一時的要因に依存するため、それらが枯渇すると Net Burn ベースのペース(${fmtMonths(netMonths)})に収束します。**構造的判断のアンカーは Net Burn**。`,
      );
    }

    return lines.join('\n');
  }

  // ============================
  // ダッシュボードサマリー
  // ============================
  /**
   * 前年同期（YoY）の主要指標を抽出する小ヘルパー。
   * 前年 PL/BS が無ければ undefined を返す。
   */
  private extractPrevYearSummary(
    prevPl: MfTrialBalance | null,
    prevBs: MfTrialBalance | null,
  ): DashboardSummary['prevYear'] | undefined {
    if (!prevPl?.rows || !prevBs?.rows) return undefined;
    const revenue = this.val(this.findRow(prevPl.rows, '売上高合計'), TB_COL.CLOSING);
    const opRow = this.findRow(prevPl.rows, '営業利益');
    const opProfit = opRow
      ? this.val(opRow, TB_COL.CLOSING)
      : this.val(this.findRow(prevPl.rows, '営業損失'), TB_COL.CLOSING);
    const ordRow = this.findRow(prevPl.rows, '経常利益');
    const ordProfit = ordRow
      ? this.val(ordRow, TB_COL.CLOSING)
      : this.val(this.findRow(prevPl.rows, '経常損失'), TB_COL.CLOSING);
    const netRow = this.findRow(prevPl.rows, '当期純利益');
    const netIncome = netRow
      ? this.val(netRow, TB_COL.CLOSING)
      : this.val(this.findRow(prevPl.rows, '当期純損失'), TB_COL.CLOSING);
    const cashBalance = this.val(
      this.findRowByPartial(prevBs.rows, '現金及び預金'),
      TB_COL.CLOSING,
    );
    return {
      revenue,
      operatingProfit: opProfit,
      ordinaryProfit: ordProfit,
      netIncome,
      cashBalance,
      fiscalYear: parseInt(prevPl.start_date.slice(0, 4)),
    };
  }

  buildDashboardSummary(
    pl: MfTrialBalance,
    bs: MfTrialBalance,
    cashflowDerived?: CashflowDerived,
    prevPl?: MfTrialBalance | null,
    prevBs?: MfTrialBalance | null,
  ): DashboardSummary {
    const revenue = this.val(
      this.findRow(pl.rows, '売上高合計'),
      TB_COL.CLOSING,
    );
    // MFは損失を負値で返す。利益行が見つからなければ損失行を使う（既に負値）
    const opProfitRow = this.findRow(pl.rows, '営業利益');
    const opProfit = opProfitRow
      ? this.val(opProfitRow, TB_COL.CLOSING)
      : this.val(this.findRow(pl.rows, '営業損失'), TB_COL.CLOSING);
    const ordProfitRow = this.findRow(pl.rows, '経常利益');
    const ordProfit = ordProfitRow
      ? this.val(ordProfitRow, TB_COL.CLOSING)
      : this.val(this.findRow(pl.rows, '経常損失'), TB_COL.CLOSING);
    const netIncomeRow = this.findRow(pl.rows, '当期純利益');
    const netIncome = netIncomeRow
      ? this.val(netIncomeRow, TB_COL.CLOSING)
      : this.val(this.findRow(pl.rows, '当期純損失'), TB_COL.CLOSING);

    const cashRow = this.findRowByPartial(bs.rows, '現金及び預金');
    const cashBalance = this.val(cashRow, TB_COL.CLOSING);
    const totalAssets = this.val(
      bs.rows.find((r) => r.type === 'assets') || null,
      TB_COL.CLOSING,
    );

    // ランウェイ: 推移データがあれば資金繰り由来の全キャッシュバーン（仕入・CAPEX・借入返済・税を含む）を優先。
    // なければ販管費のみの簡易計算にフォールバック。
    let runway = 999;
    let alertLevel: DashboardSummary['alertLevel'] = 'SAFE';
    let runwayVariants: DashboardSummary['runwayVariants'] | undefined;

    if (cashflowDerived) {
      runway = cashflowDerived.runway.months;
      alertLevel = cashflowDerived.runway.alertLevel;
      runwayVariants = {
        defaultMode: cashflowDerived.runway.defaultMode,
        worstCase: cashflowDerived.runway.variants.worstCase,
        netBurn: cashflowDerived.runway.variants.netBurn,
        actual: cashflowDerived.runway.variants.actual,
      };
    } else {
      const sgaDash = this.findRowByPartial(pl.rows, '販売費及び一般管理費');
      const sgaTotal = this.val(sgaDash, TB_COL.CLOSING);
      let nonCashTotal = 0;
      if (sgaDash?.rows) {
        for (const child of sgaDash.rows) {
          if (NON_CASH_ACCOUNTS.has(child.name)) {
            nonCashTotal += this.val(child, TB_COL.CLOSING);
          }
        }
      }
      const startDate = new Date(pl.start_date);
      const endDate = new Date(pl.end_date);
      const elapsedMonths = Math.max(1,
        (endDate.getFullYear() - startDate.getFullYear()) * 12 +
        (endDate.getMonth() - startDate.getMonth()) + 1,
      );
      const monthlyBurn = (sgaTotal - nonCashTotal) / elapsedMonths;
      if (monthlyBurn > 0) {
        runway = Math.round((cashBalance / monthlyBurn) * 10) / 10;
      }

      if (runway < 3) alertLevel = 'CRITICAL';
      else if (runway < 6) alertLevel = 'WARNING';
      else if (runway < 12) alertLevel = 'CAUTION';
    }

    const prevYear = this.extractPrevYearSummary(prevPl ?? null, prevBs ?? null);

    return {
      revenue,
      operatingProfit: opProfit,
      ordinaryProfit: ordProfit,
      netIncome,
      cashBalance,
      totalAssets,
      runway,
      alertLevel,
      runwayVariants,
      // 信頼度: cashflowDerived 経由なら composition.dataQuality を反映、無ければ legacy fallback
      runwayDataQuality: cashflowDerived?.runway.composition?.dataQuality ?? 'none',
      fiscalYear: parseInt(pl.start_date.slice(0, 4)),
      period: { start: pl.start_date, end: pl.end_date },
      prevYear,
    };
  }

  // ============================
  // 科目別月次推移（ドリルダウン L2）
  // ============================
  getAccountTransition(
    transition: MfTransition,
    accountName: string,
  ): { month: string; amount: number }[] {
    const monthLabels = buildMonthLabels(transition.columns);
    const row = this.findRow(transition.rows, accountName)
      || this.findRowByPartial(transition.rows, accountName);
    const values = this.monthlyValues(row, monthLabels.length);
    return monthLabels.map((label, i) => ({
      month: label,
      amount: values[i],
    }));
  }

  // ============================
  // 財務指標計算
  // ============================
  calculateFinancialIndicators(
    pl: MfTrialBalance,
    bs: MfTrialBalance,
  ): FinancialIndicators {
    // PL
    const revenue = this.val(this.findRow(pl.rows, '売上高合計'), TB_COL.CLOSING);
    const cogs = this.val(this.findRow(pl.rows, '売上原価'), TB_COL.CLOSING);
    const grossProfit = revenue - cogs;
    const opProfitRow = this.findRow(pl.rows, '営業利益');
    const operatingProfit = opProfitRow
      ? this.val(opProfitRow, TB_COL.CLOSING)
      : this.val(this.findRow(pl.rows, '営業損失'), TB_COL.CLOSING);
    const netIncomeRow = this.findRow(pl.rows, '当期純利益');
    const netIncome = netIncomeRow
      ? this.val(netIncomeRow, TB_COL.CLOSING)
      : this.val(this.findRow(pl.rows, '当期純損失'), TB_COL.CLOSING);

    // BS
    const assetsRoot = bs.rows.find((r) => r.type === 'assets');
    const totalAssets = this.val(assetsRoot || null, TB_COL.CLOSING);

    const liabRoot = bs.rows.find((r) => r.type === 'liabilities');
    const totalLiabilities = this.val(liabRoot || null, TB_COL.CLOSING);

    const netAssetsRoot = bs.rows.find((r) => r.type === 'net_assets');
    const netAssets = this.val(netAssetsRoot || null, TB_COL.CLOSING);

    // 流動資産・流動負債
    const currentAssetsRow = this.findRowByPartial(bs.rows, '流動資産');
    const currentAssets = this.val(currentAssetsRow, TB_COL.CLOSING);
    const currentLiabRow = this.findRowByPartial(bs.rows, '流動負債');
    const currentLiabilities = this.val(currentLiabRow, TB_COL.CLOSING);

    // 売掛金
    const arRow = this.findRow(bs.rows, '売掛金')
      || this.findRowByPartial(bs.rows, '売上債権');
    const receivables = this.val(arRow, TB_COL.CLOSING);

    const safeDivide = (numerator: number, denominator: number, multiplier = 1): number => {
      if (denominator === 0) return 0;
      return Math.round((numerator / denominator) * multiplier * 100) / 100;
    };

    return {
      currentRatio: safeDivide(currentAssets, currentLiabilities, 100),
      equityRatio: safeDivide(netAssets, totalAssets, 100),
      // 債務超過（純資産<0）でも計算する。純資産=0の場合のみ0（ゼロ除算回避）
      debtEquityRatio: netAssets !== 0 ? safeDivide(totalLiabilities, netAssets, 100) : 0,
      grossProfitMargin: safeDivide(grossProfit, revenue, 100),
      operatingProfitMargin: safeDivide(operatingProfit, revenue, 100),
      roe: netAssets !== 0 ? safeDivide(netIncome, netAssets, 100) : 0,
      roa: safeDivide(netIncome, totalAssets, 100),
      totalAssetTurnover: safeDivide(revenue, totalAssets),
      receivablesTurnover: safeDivide(revenue, receivables),
    };
  }

  // ============================
  // PL 推移表 → チャート用
  // ============================
  transformTransitionPL(data: MfTransition): PlTransitionPoint[] {
    const monthLabels = buildMonthLabels(data.columns);
    const revRow = this.findRow(data.rows, '売上高合計');
    const opRow =
      this.findRow(data.rows, '営業利益') ||
      this.findRow(data.rows, '営業損失');

    return monthLabels.map((label, i) => ({
      month: label,
      revenue: this.val(revRow, i),
      operatingProfit: this.val(opRow, i),
    }));
  }

  // ============================
  // 予測分析（線形回帰）
  // ============================
  predictTrend(
    transitionPL: MfTransition,
    months: number = 3,
  ): { month: string; predicted: number }[] {
    // 売上高の月次値を取得
    const monthLabels = buildMonthLabels(transitionPL.columns);
    const revRow = this.findRow(transitionPL.rows, '売上高合計');
    const values = this.monthlyValues(revRow, monthLabels.length).filter((v) => v !== 0);
    if (values.length < 3) return [];

    // 線形回帰: y = ax + b
    const n = values.length;
    const xs = values.map((_, i) => i);
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((acc, x, i) => acc + x * values[i], 0);
    const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);
    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return [];
    const a = (n * sumXY - sumX * sumY) / denominator;
    const b = (sumY - a * sumX) / n;

    // 予測
    const predictions: { month: string; predicted: number }[] = [];
    // 最終月をcolumnsから動的取得
    const monthCols = transitionPL.columns.filter((c) => /^\d+$/.test(c));
    const lastMonthNum = monthCols.length > 0 ? parseInt(monthCols[monthCols.length - 1], 10) : 12;
    for (let i = 0; i < months; i++) {
      const x = n + i;
      const predicted = Math.round(a * x + b);
      const monthNum = ((lastMonthNum + i) % 12) + 1;
      predictions.push({
        month: `${monthNum}月(予測)`,
        predicted: Math.max(0, predicted),
      });
    }
    return predictions;
  }
}
