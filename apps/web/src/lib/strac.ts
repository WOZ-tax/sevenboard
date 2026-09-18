/** STRAC: all monetary values are yen. Missing evidence stays distinct from zero. */
export interface StracPeriod { fiscal_year: number; start_date: string; end_date: string }
export interface StracWindow { fiscalYear: number; start: string; end: string; endMonth: number; months: number; nextStart: string; nextEnd: string; capped: boolean }
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dateOK = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && iso(new Date(s)) === s;

export function stracWindow(period: StracPeriod, month?: number, dataAsOf?: string, today = iso(new Date(Date.now() + 9 * 60 * 60 * 1000))): StracWindow | null {
  if (!dateOK(period.start_date) || !dateOK(period.end_date) || !dateOK(today)) return null;
  const start = new Date(period.start_date), fiscalEnd = new Date(period.end_date);
  if (start.getUTCDate() !== 1 || fiscalEnd < start) return null;
  const fiscalMonths = (fiscalEnd.getUTCFullYear() - start.getUTCFullYear()) * 12 + fiscalEnd.getUTCMonth() - start.getUTCMonth() + 1;
  if (fiscalMonths > 12 || iso(new Date(Date.UTC(fiscalEnd.getUTCFullYear(), fiscalEnd.getUTCMonth() + 1, 0))) !== period.end_date) return null;
  if (month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12)) return null;
  const offset = month === undefined ? fiscalMonths - 1 : (month - 1 - start.getUTCMonth() + 12) % 12;
  if (offset >= fiscalMonths) return null;
  const requested = iso(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset + 1, 0)));
  const now = new Date(today);
  let ceiling = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)));
  if (dataAsOf && dateOK(dataAsOf) && dataAsOf < ceiling) ceiling = dataAsOf;
  const rawEnd = requested < ceiling ? requested : ceiling;
  const d = new Date(rawEnd);
  // Only complete calendar months can be annualized. A mid-month cutoff uses the preceding month.
  const end = d.getUTCDate() === new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
    ? rawEnd : iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)));
  if (end < period.start_date) return null;
  const endDate = new Date(end);
  return {
    fiscalYear: period.fiscal_year, start: period.start_date, end, endMonth: endDate.getUTCMonth() + 1,
    months: (endDate.getUTCFullYear() - start.getUTCFullYear()) * 12 + endDate.getUTCMonth() - start.getUTCMonth() + 1,
    nextStart: iso(new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, 1))),
    nextEnd: iso(new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() + 13, 0))), capped: end !== requested,
  };
}

type Cost = { name: string; amount: number };
type Pl = { category: string; current: number };
export interface StracSource { revenue: number; variableCosts: Cost[]; fixedCosts: Cost[] }
export interface StracCost extends Cost { variable: boolean; personnel: boolean }
const personnelPattern = /役員報酬|役員賞与|給料|給与|賃金|雑給|賞与|法定福利|福利厚生|退職金|退職給付|人件費/;
const depreciationPattern = /減価償却|一括償却資産償却|ソフトウェア償却|のれん償却/;

export function stracActual(source: StracSource, pl: Pl[], classification: Record<string, boolean> = {}) {
  const grouped = new Map<string, StracCost>();
  for (const [items, isVariable] of [[source.variableCosts, true], [source.fixedCosts, false]] as const) {
    for (const item of items) {
      const prior = grouped.get(item.name);
      const variable = typeof classification[item.name] === 'boolean' ? classification[item.name] : isVariable;
      grouped.set(item.name, { ...item, amount: item.amount + (prior?.amount ?? 0), variable, personnel: personnelPattern.test(item.name) });
    }
  }
  const costs = [...grouped.values()];
  const get = (category: string) => pl.find(r => r.category === category)?.current;
  const revenue = source.revenue;
  const variable = costs.filter(c => c.variable).reduce((s, c) => s + c.amount, 0);
  const personnel = costs.filter(c => !c.variable && c.personnel).reduce((s, c) => s + c.amount, 0);
  const otherFixed = costs.filter(c => !c.variable && !c.personnel).reduce((s, c) => s + c.amount, 0);
  const fixed = personnel + otherFixed, contribution = revenue - variable, operating = contribution - fixed;
  const ordinary = get('経常利益'), pretax = get('税引前当期純利益'), net = get('当期純利益');
  const issues: string[] = [];
  if (![revenue, variable, fixed, ...source.variableCosts.map(c => c.amount), ...source.fixedCosts.map(c => c.amount), ...pl.map(r => r.current)].every(Number.isFinite)) issues.push('数値として確認できない損益データがあります。');
  for (const label of ['売上高', '営業利益', '経常利益', '税引前当期純利益', '当期純利益']) {
    if (!Number.isFinite(get(label))) issues.push(`${label}を取得できていません。`);
  }
  if (get('売上高') !== undefined && Math.abs(revenue - get('売上高')!) > 1) issues.push('費用内訳とP/Lの売上高が一致しません。');
  if (get('営業利益') !== undefined && Math.abs(operating - get('営業利益')!) > 1) issues.push('費用内訳から計算した営業利益がP/Lと一致しません。科目の重複・控除・集計漏れを確認してください。');
  if (get('法人税等') !== undefined && pretax !== undefined && net !== undefined && Math.abs(pretax - net - get('法人税等')!) > 1) issues.push('税引前利益・法人税等・当期純利益が一致しません。');
  const margin = revenue > 0 ? contribution / revenue : null;
  const breakEven = margin !== null && margin > 0 && fixed >= 0 ? fixed / margin : null;
  const depreciationCosts = costs.filter(c => depreciationPattern.test(c.name));
  return {
    revenue, costs, variable, personnel, otherFixed, fixed, contribution, operating,
    ordinary: ordinary ?? null, pretax: pretax ?? null, net: net ?? null,
    nonOperating: ordinary === undefined ? null : ordinary - operating,
    extraordinary: pretax === undefined || ordinary === undefined ? null : pretax - ordinary,
    tax: pretax === undefined || net === undefined ? null : pretax - net,
    depreciation: depreciationCosts.reduce((s, c) => s + c.amount, 0), depreciationFound: depreciationCosts.length > 0,
    margin, breakEven, safetyMargin: breakEven !== null && revenue > 0 ? (revenue - breakEven) / revenue : null,
    laborShare: contribution > 0 ? personnel / contribution : null, issues,
  };
}
export type StracActual = ReturnType<typeof stracActual>;

export interface StracLoan {
  id: string; lenderName: string; principal: number; startDate: string; maturityDate: string | null;
  scheduleEntries: { seq: number; dueDate: string; principalAmount: number; interestAmount: number; balanceAfter: number; isEstimated?: boolean }[];
}
/** Full schedules are checked, including already-repaid loans for a historical reference date. */
export function stracRepayments(loans: StracLoan[], start: string, end: string, asOf: string, bookDebt: number | null) {
  const issues: string[] = [], rows: { id: string; name: string; principal: number; interest: number }[] = [];
  let principal = 0, interest = 0, balance = 0, estimated = false;
  for (const loan of loans) {
    if (loan.startDate > end) continue;
    const entries = [...loan.scheduleEntries].sort((a, b) => a.seq - b.seq);
    let previous = loan.principal, previousDate = loan.startDate, previousSeq = 0;
    let valid = Number.isFinite(previous) && previous >= 0 && dateOK(loan.startDate);
    for (const entry of entries) {
      if (!dateOK(entry.dueDate) || entry.dueDate < previousDate || entry.seq !== previousSeq + 1 ||
          ![entry.principalAmount, entry.interestAmount, entry.balanceAfter].every(v => Number.isFinite(v) && v >= 0) ||
          Math.abs(previous - entry.principalAmount - entry.balanceAfter) > 1) valid = false;
      previous = entry.balanceAfter; previousDate = entry.dueDate; previousSeq = entry.seq;
    }
    if (!entries.length || Math.abs(previous) > 1 || (loan.maturityDate && entries.at(-1)!.dueDate !== loan.maturityDate)) valid = false;
    if (!valid) issues.push(`${loan.lenderName}の返済予定表が完済まで揃っていないか、日付・残高に不整合があります。`);
    const selected = entries.filter(e => e.dueDate >= start && e.dueDate <= end);
    const p = selected.reduce((s, e) => s + e.principalAmount, 0), i = selected.reduce((s, e) => s + e.interestAmount, 0);
    principal += p; interest += i; estimated ||= selected.some(e => !!e.isEstimated);
    rows.push({ id: loan.id, name: loan.lenderName, principal: p, interest: i });
    if (loan.startDate <= asOf) balance += entries.filter(e => e.dueDate <= asOf).at(-1)?.balanceAfter ?? loan.principal;
  }
  if (bookDebt === null) issues.push('基準月の帳簿借入残高を確認できていません。');
  else if (Math.abs(balance - bookDebt) > 1) issues.push('基準月の帳簿借入残高と返済予定表の残高が一致しません。未登録の借入・返済を確認してください。');
  if (!loans.length && bookDebt !== 0) issues.push('借入金管理に返済予定表が登録されていません。');
  return { principal, interest, balance, rows, estimated, issues, complete: issues.length === 0 };
}

export interface StracAssumptions {
  depreciation: string; taxRate: string; workingCapital: string; capex: string; otherCash: string;
  principal: string; retainedCash: string; salesChange: string; marginChange: string; fixedReduction: string; confirmed: boolean; confirmationBasis: string;
}
export const DEFAULT_STRAC_ASSUMPTIONS: StracAssumptions = {
  depreciation: '', taxRate: '30', workingCapital: '0', capex: '0', otherCash: '0', principal: '', retainedCash: '0',
  salesChange: '0', marginChange: '0', fixedReduction: '0', confirmed: false, confirmationBasis: '',
};
export function normalizeStracAssumptions(input: unknown): StracAssumptions {
  const result = { ...DEFAULT_STRAC_ASSUMPTIONS };
  if (!input || typeof input !== 'object') return result;
  for (const key of Object.keys(result) as (keyof StracAssumptions)[]) {
    const value = (input as Record<string, unknown>)[key];
    if (key === 'confirmed') result.confirmed = value === true;
    else if (typeof value === 'string' && value.length <= 32) result[key] = value;
  }
  return result;
}

export function stracPlan(actual: StracActual, months: number, assumptions: StracAssumptions, scheduledPrincipal: number | null) {
  const issues = [...actual.issues];
  const n = (key: Exclude<keyof StracAssumptions, 'confirmed' | 'confirmationBasis'>, fallback?: number | null) => {
    const str = assumptions[key].trim();
    const value = str === '' && fallback !== undefined ? fallback : str === '' ? NaN : Number(str);
    if (value !== null && (!Number.isFinite(value) || Math.abs(value) > 1e14)) issues.push('入力金額・割合は有効な数値で指定してください。');
    return value;
  };
  const factor = 12 / months;
  if (!Number.isInteger(months) || months < 1 || months > 12) issues.push('年換算の対象月数を確認できません。');
  const revenue = actual.revenue * factor, fixed = actual.fixed * factor, nonOperating = (actual.nonOperating ?? 0) * factor;
  const depreciation = n('depreciation', actual.depreciation * factor)!;
  const taxRate = n('taxRate')! / 100, workingCapital = n('workingCapital')!, capex = n('capex')!, otherCash = n('otherCash')!;
  const principal = n('principal', scheduledPrincipal), retainedCash = n('retainedCash')!;
  const salesChange = n('salesChange')! / 100, marginChange = n('marginChange')! / 100, fixedReduction = n('fixedReduction')!;
  if (taxRate < 0 || taxRate >= 1) issues.push('想定税率は0%以上100%未満で指定してください。');
  if (depreciation < 0 || capex < 0 || (principal !== null && principal < 0) || retainedCash < 0 || fixedReduction < 0) issues.push('償却・投資・元金返済・残したい資金・固定費削減額は0円以上で指定してください。');
  if (salesChange < -1 || salesChange > 10 || Math.abs(marginChange) > 1) issues.push('売上増減率は−100〜1,000%、限界利益率の改善は−100〜100ポイントで指定してください。');
  if (fixedReduction > fixed) issues.push('固定費削減額が年換算固定費を超えています。');
  if (actual.margin === null || actual.margin > 1 || actual.variable < 0 || fixed < 0) issues.push('売上・費用の構成が年換算モデルの対象外です。費用区分を確認してください。');
  const calc = (sales: number, margin: number | null, annualFixed: number) => {
    const operating = sales * (margin ?? 0) - annualFixed;
    const pretax = operating + nonOperating; // Extraordinary income/expense is not repeated into the next year.
    const tax = Math.max(0, pretax) * taxRate, net = pretax - tax;
    const simpleCash = net + depreciation, availableCash = simpleCash - workingCapital - capex + otherCash;
    const surplus = principal === null ? null : availableCash - principal;
    const coverage = principal !== null && principal > 0 ? availableCash / principal : null;
    const netNeeded = principal === null ? null : principal + retainedCash + workingCapital + capex - otherCash - depreciation;
    const pretaxNeeded = netNeeded === null ? null : netNeeded > 0 ? netNeeded / (1 - taxRate) : netNeeded;
    const requiredRevenue = pretaxNeeded !== null && margin !== null && margin > 0 ? Math.max(0, (annualFixed - nonOperating + pretaxNeeded) / margin) : null;
    return { revenue: sales, margin, fixed: annualFixed, operating, pretax, tax, net, simpleCash, availableCash, surplus, coverage, requiredRevenue };
  };
  const scenarioMargin = actual.margin === null ? null : actual.margin + marginChange;
  if (scenarioMargin !== null && scenarioMargin > 1) issues.push('改善後の限界利益率が100%を超えています。');
  return {
    base: calc(revenue, actual.margin, fixed), scenario: calc(revenue * (1 + salesChange), scenarioMargin, fixed - fixedReduction),
    depreciation, taxRate, workingCapital, capex, otherCash, principal, retainedCash, factor,
    issues: [...new Set(issues)],
    manualPrincipal: assumptions.principal.trim() !== '',
  };
}

export function stracBookDebt(bs: { liabilitiesEquity: Pl[] }): number | null {
  if (!bs.liabilitiesEquity.length) return null;
  const rows = bs.liabilitiesEquity.filter(r => /借入金/.test(r.category) && !/合計|総額/.test(r.category));
  if (!rows.every(r => Number.isFinite(r.current) && r.current >= 0)) return null;
  return rows.reduce((sum, r) => sum + r.current, 0);
}

/** A change marker for human-reviewed source numbers (not a security hash). */
export function stracFingerprint(value: unknown): string {
  let hash = 2166136261;
  for (const char of JSON.stringify(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}
