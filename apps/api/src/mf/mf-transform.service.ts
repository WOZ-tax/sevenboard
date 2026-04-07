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
      const isSubtotal = row.name.endsWith('合計');
      const isHeader =
        row.type === 'financial_statement_item' &&
        !isSubtotal &&
        row.rows &&
        row.rows.length > 0;

      if (isHeader) {
        // ヘッダー行 (e.g. "流動資産合計" の子を展開)
        out.push({
          category: `【${row.name.replace('合計', '')}】`,
          current: 0,
          prior: 0,
          isHeader: true,
        });
        // 子科目
        if (row.rows) {
          for (const child of row.rows) {
            if (child.type === 'account') {
              out.push({
                category: `  ${child.name}`,
                current: this.val(child, TB_COL.CLOSING),
                prior: this.val(child, TB_COL.OPENING),
              });
            } else if (child.rows) {
              // 更にネスト（現金及び預金合計 → 現金, 普通預金）
              for (const grandchild of child.rows) {
                out.push({
                  category: `  ${grandchild.name}`,
                  current: this.val(grandchild, TB_COL.CLOSING),
                  prior: this.val(grandchild, TB_COL.OPENING),
                });
              }
            }
          }
          // 小計
          out.push({
            category: row.name,
            current: this.val(row, TB_COL.CLOSING),
            prior: this.val(row, TB_COL.OPENING),
            isTotal: true,
          });
        }
      } else if (row.type === 'account') {
        out.push({
          category: `  ${row.name}`,
          current: this.val(row, TB_COL.CLOSING),
          prior: this.val(row, TB_COL.OPENING),
        });
      }
    }
  }

  // ============================
  // 資金繰り導出（BS推移 + PL推移）
  // ============================
  deriveCashflow(
    bsTransition: MfTransition,
    plTransition: MfTransition,
  ): CashflowDerived {
    const monthLabels = buildMonthLabels(bsTransition.columns);
    const mc = monthLabels.length; // 月数

    // 1. 月次現預金残高（BS推移表は各月末の累計残高）
    const cashRow = this.findRowByPartial(bsTransition.rows, '現金及び預金');
    const cashBalances = this.monthlyValues(cashRow, mc);

    // 前期末残高: 前期BS試算表がないため、推移表の初月値から推定不可
    // settlement_balanceは当期末値なので前期末には使えない → 0とする
    const priorCash = 0;

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
    const salesCollection = revMonthly.map((rev, i) => {
      const arPrev = i === 0 ? 0 : arBalances[i - 1];
      return rev + arPrev - arBalances[i];
    });

    const nonOpIncRow = this.findRowByPartial(plTransition.rows, '営業外収益');
    const extraIncRow = this.findRowByPartial(plTransition.rows, '特別利益');
    const otherIncome = Array.from({ length: mc }, (_, i) =>
      this.val(nonOpIncRow, i) + this.val(extraIncRow, i),
    );

    const shortBorrow = this.findRow(bsTransition.rows, '短期借入金');
    const longBorrow = this.findRow(bsTransition.rows, '長期借入金');
    const officerBorrow = this.findRow(bsTransition.rows, '役員借入金');
    const borrowBalances = Array.from({ length: mc }, (_, i) =>
      this.val(shortBorrow, i) + this.val(longBorrow, i) + this.val(officerBorrow, i),
    );
    const borrowInflow = borrowBalances.map((v, i) => {
      const prev = i === 0 ? 0 : borrowBalances[i - 1];
      return Math.max(0, v - prev);
    });

    const incomeTotal = Array.from({ length: mc }, (_, i) =>
      salesCollection[i] + otherIncome[i] + borrowInflow[i],
    );

    // 4. 支出側
    const cogsRow = this.findRowByPartial(plTransition.rows, '売上原価');
    const cogsMonthly = this.monthlyValues(cogsRow, mc);

    const apRow =
      this.findRowByPartial(bsTransition.rows, '仕入債務合計') ||
      this.findRow(bsTransition.rows, '買掛金');
    const apBalances = this.monthlyValues(apRow, mc);
    const purchasePayment = cogsMonthly.map((cogs, i) => {
      const apPrev = i === 0 ? 0 : apBalances[i - 1];
      return cogs + apPrev - apBalances[i];
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
    const capex = faBalances.map((v, i) => {
      const prev = i === 0 ? 0 : faBalances[i - 1];
      return Math.max(0, (v - prev) + nonCashMonthly[i]);
    });

    const borrowOutflow = borrowBalances.map((v, i) => {
      const prev = i === 0 ? 0 : borrowBalances[i - 1];
      return Math.max(0, prev - v);
    });

    const taxRow = this.findRow(plTransition.rows, '法人税等');
    const taxMonthly = this.monthlyValues(taxRow, mc);

    const expenseTotal = Array.from({ length: mc }, (_, i) =>
      purchasePayment[i] + payrollMonthly[i] + otherExpense[i] +
      capex[i] + borrowOutflow[i] + taxMonthly[i],
    );

    // 5. 収支差額
    const calculatedNet = Array.from({ length: mc }, (_, i) =>
      incomeTotal[i] - expenseTotal[i],
    );

    // 6. 調整差額
    const adjustment = Array.from({ length: mc }, (_, i) =>
      netCf[i] - calculatedNet[i],
    );

    // 7. 資金繰り表
    const rows: CashflowRow[] = [
      { category: '前月繰越', values: cashBalances.map((_, i) => (i === 0 ? priorCash : cashBalances[i - 1])), isTotal: true },
      { category: '【収入の部】', values: new Array(mc).fill(null), isHeader: true },
      { category: '  売上回収', values: salesCollection },
      { category: '  その他収入', values: otherIncome },
      { category: '  借入・増資', values: borrowInflow },
      { category: '収入合計', values: incomeTotal, isTotal: true },
      { category: '【支出の部】', values: new Array(mc).fill(null), isHeader: true },
      { category: '  仕入支払', values: purchasePayment },
      { category: '  人件費', values: payrollMonthly },
      { category: '  その他経費', values: otherExpense },
      { category: '  設備投資', values: capex },
      { category: '  借入返済', values: borrowOutflow },
      { category: '  法人税等', values: taxMonthly },
      { category: '支出合計', values: expenseTotal, isTotal: true },
      { category: '収支差額', values: calculatedNet, isTotal: true, isDiff: true },
      { category: '調整額', values: adjustment },
      { category: '期末残高', values: cashBalances, isTotal: true },
    ];

    // 8. ランウェイ（非資金項目を除外した実キャッシュバーン）
    // settlement_balance列に集約された非資金（減価償却費等）を月次按分
    const settlementIdx = plTransition.columns.indexOf('settlement_balance');
    let annualNonCash = 0;
    if (settlementIdx >= 0 && sgaRow?.rows) {
      for (const child of sgaRow.rows) {
        if (NON_CASH_ACCOUNTS.has(child.name)) {
          annualNonCash += (child.values[settlementIdx] as number) || 0;
        }
      }
    }
    // 月次で既に計上済みの非資金を差し引き、settlement固有分のみ按分（二重控除防止）
    const monthlyNonCashSum = nonCashMonthly.reduce((a, b) => a + b, 0);
    const settlementOnlyNonCash = Math.max(0, annualNonCash - monthlyNonCashSum);
    const monthlyNonCashAdjust = mc > 0 ? settlementOnlyNonCash / mc : 0;

    const latestCash = [...cashBalances].reverse().find((v) => v !== 0) || 0;
    // 月次の非資金 + settlement按分（重複なし）を除外
    const cashExpenses = expenseTotal.map((exp, i) => exp - nonCashMonthly[i] - monthlyNonCashAdjust);
    const nonZeroCashExp = cashExpenses.filter((v) => v > 0);
    const recentExpenses = nonZeroCashExp.slice(-3);
    const avgBurn =
      recentExpenses.length > 0
        ? recentExpenses.reduce((a, b) => a + b, 0) / recentExpenses.length
        : 0;
    const runwayMonths =
      avgBurn > 0 ? Math.round((latestCash / avgBurn) * 10) / 10 : Infinity;

    let alertLevel: 'SAFE' | 'CAUTION' | 'WARNING' | 'CRITICAL';
    if (runwayMonths >= 18) alertLevel = 'SAFE';
    else if (runwayMonths >= 12) alertLevel = 'CAUTION';
    else if (runwayMonths >= 6) alertLevel = 'WARNING';
    else alertLevel = 'CRITICAL';

    return {
      months: monthLabels,
      cashBalances,
      rows,
      runway: {
        months: runwayMonths === Infinity ? 999 : runwayMonths,
        cashBalance: latestCash,
        monthlyBurnRate: Math.round(avgBurn),
        alertLevel,
      },
    };
  }

  // ============================
  // ダッシュボードサマリー
  // ============================
  buildDashboardSummary(
    pl: MfTrialBalance,
    bs: MfTrialBalance,
    bsTransition?: MfTransition,
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

    // ランウェイ（推移表があれば精密計算、なければ簡易計算）
    let runway = 999;
    let alertLevel: DashboardSummary['alertLevel'] = 'SAFE';

    // 販管費から非資金を除外してキャッシュバーンを計算
    const sgaDash = this.findRowByPartial(pl.rows, '販売費及び一般管理費');
    const sgaTotal = this.val(sgaDash, TB_COL.CLOSING);
    // 非資金を除外
    let nonCashTotal = 0;
    if (sgaDash?.rows) {
      for (const child of sgaDash.rows) {
        if (NON_CASH_ACCOUNTS.has(child.name)) {
          nonCashTotal += this.val(child, TB_COL.CLOSING);
        }
      }
    }
    // 経過月数で割る（期中の場合、12で割ると過小になる）
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

    if (runway < 6) alertLevel = 'CRITICAL';
    else if (runway < 12) alertLevel = 'WARNING';
    else if (runway < 18) alertLevel = 'CAUTION';

    return {
      revenue,
      operatingProfit: opProfit,
      ordinaryProfit: ordProfit,
      netIncome,
      cashBalance,
      totalAssets,
      runway,
      alertLevel,
      fiscalYear: parseInt(pl.start_date.slice(0, 4)),
      period: { start: pl.start_date, end: pl.end_date },
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
      // 債務超過（純資産<0）の場合、負債比率とROEは意味をなさない → 0（N/A）
      debtEquityRatio: netAssets > 0 ? safeDivide(totalLiabilities, netAssets, 100) : 0,
      grossProfitMargin: safeDivide(grossProfit, revenue, 100),
      operatingProfitMargin: safeDivide(operatingProfit, revenue, 100),
      roe: netAssets > 0 ? safeDivide(netIncome, netAssets, 100) : 0,
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
