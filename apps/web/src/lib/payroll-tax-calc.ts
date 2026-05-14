/**
 * 役員報酬シミュレーター + 納税予想 の計算ロジック。
 * projects/board/index.html の関数群を TS化したもの。SSOT は tax-rates-2026.ts。
 *
 * 単位: 全て「万円」（HTMLシミュ流儀）。
 */

import {
  CORP_TAX_RATES_SMB,
  CORP_TAX_RATES_LARGE,
  DEFENSE_TAX,
  LOCAL_CORPORATE_TAX_RATE,
  DEFAULT_LOCAL_TAX_RATES,
  type LocalTaxRates,
  RECONSTRUCTION_TAX_RATE,
  PERSONAL_RESIDENT_TAX_RATE,
  SI_RATES,
  appliesCareInsurance,
  basicDeduction,
  incomeTax,
  salaryIncomeDeduction,
  spouseDeduction,
  standardCompensation,
  type ExecAgeBracket,
} from "@/lib/tax-rates-2026";

const floor1000 = (manYen: number): number => Math.floor(manYen * 10) / 10;
const floor100 = (manYen: number): number => Math.floor(manYen * 100) / 100;

// ===========================================================
// 法人税計算
// ===========================================================

/** 税目1行ぶんの内訳 (課税標準 / 税率 / 年税額) */
export interface TaxLineRow {
  /** 課税標準 (万円) */
  base: number;
  /** 適用税率 (0.15 = 15%) */
  rate: number;
  /** 年税額 (万円) */
  tax: number;
}

/**
 * 法人税等の内訳。税目別に課税標準・税率・年税額を保持し、UI で表形式表示できる。
 *
 * 国税: 法人税(軽減/本則)、地方法人税、防衛特別法人税
 * 地方税: 法人住民税(法人税割/均等割)、法人事業税(3段階)、特別法人事業税
 */
export interface CorpTaxBreakdown {
  /** 法人税 軽減税率部分 (中小法人、所得800万円以下、15%) */
  corporateTaxLow: TaxLineRow;
  /** 法人税 本則部分 (800万円超、23.2%) */
  corporateTaxHigh: TaxLineRow;
  /** 地方法人税 (法人税合計 × 10.3%、国税) */
  localCorporateTax: TaxLineRow;
  /** 防衛特別法人税 ((法人税合計 - 500万円) × 4%、国税) */
  defenseTax: TaxLineRow;
  /** 法人住民税 法人税割 (法人税合計 × 税率、地方税) */
  residentTaxOnIncome: TaxLineRow;
  /** 法人住民税 均等割 年税額 (万円、手入力、地方税) */
  kintowariManYen: number;
  /** 法人事業税 軽減1 (所得400万円以下、3.5%、地方税) */
  bizTaxLv1: TaxLineRow;
  /** 法人事業税 軽減2 (400-800万円、5.3%、地方税) */
  bizTaxLv2: TaxLineRow;
  /** 法人事業税 本則 (800万円超、7.0%、地方税) */
  bizTaxLv3: TaxLineRow;
  /** 特別法人事業税 (事業税合計 × 37%、地方税) */
  specialBizTax: TaxLineRow;
  /** 法人税合計 (corporateTaxLow + corporateTaxHigh、万円) */
  corporateTaxTotal: number;
  /** 法人事業税合計 (bizTaxLv1 + lv2 + lv3、万円) */
  bizTaxTotal: number;
  /** 法人税等合計 (万円) */
  total: number;
}

const emptyLine = (rate: number): TaxLineRow => ({ base: 0, rate, tax: 0 });

/**
 * 法人税等の計算（万円単位）。
 *
 * @param taxableIncomeManYen 課税所得（万円）
 * @param capitalManYen 資本金（万円） — 中小法人特例の判定 (1億円以下) に使用
 * @param localRates 地方税率 + 均等割年税額 (ユーザー編集可。省略時は東京都標準)
 */
export function calcCorpTax(
  taxableIncomeManYen: number,
  capitalManYen: number,
  localRates: LocalTaxRates = DEFAULT_LOCAL_TAX_RATES,
): CorpTaxBreakdown {
  const ti = floor1000(Math.max(0, taxableIncomeManYen));
  const isSmb = capitalManYen <= 10000;
  const kw = floor100(localRates.kintowariManYen);

  // 法人税 (軽減/本則) — 中小特例なら 800万円以下 15%, 超 23.2%。大法人は本則一律。
  const lowThreshold = CORP_TAX_RATES_SMB.bracketThreshold;
  const corporateTaxLowBase = isSmb ? Math.min(ti, lowThreshold) : 0;
  const corporateTaxHighBase = isSmb
    ? Math.max(0, ti - lowThreshold)
    : ti;
  const corporateTaxLowRate = isSmb ? CORP_TAX_RATES_SMB.lowBracket : 0;
  const corporateTaxHighRate = isSmb
    ? CORP_TAX_RATES_SMB.highBracket
    : CORP_TAX_RATES_LARGE.flat;
  const corporateTaxLowTax = floor100(corporateTaxLowBase * corporateTaxLowRate);
  const corporateTaxHighTax = floor100(
    corporateTaxHighBase * corporateTaxHighRate,
  );
  const corporateTaxTotal = corporateTaxLowTax + corporateTaxHighTax;

  // 地方法人税 (国税付加税)
  const localCorporateTax: TaxLineRow = {
    base: corporateTaxTotal,
    rate: LOCAL_CORPORATE_TAX_RATE,
    tax: floor100(corporateTaxTotal * LOCAL_CORPORATE_TAX_RATE),
  };

  // 防衛特別法人税
  const defenseBase = Math.max(0, corporateTaxTotal - DEFENSE_TAX.deduction);
  const defenseTax: TaxLineRow = {
    base: defenseBase,
    rate: DEFENSE_TAX.rate,
    tax: floor100(defenseBase * DEFENSE_TAX.rate),
  };

  // 法人住民税 法人税割
  const residentTaxOnIncome: TaxLineRow = {
    base: corporateTaxTotal,
    rate: localRates.residentTaxRate,
    tax: floor100(corporateTaxTotal * localRates.residentTaxRate),
  };

  // 法人事業税 (3段階、中小特例)。大法人は全額 本則扱い。
  let lv1Base = 0;
  let lv2Base = 0;
  let lv3Base = ti;
  if (isSmb) {
    lv1Base = Math.min(ti, 400);
    lv2Base = Math.min(Math.max(0, ti - 400), 400);
    lv3Base = Math.max(0, ti - 800);
  }
  const bizTaxLv1: TaxLineRow = {
    base: lv1Base,
    rate: localRates.bizTaxLv1Rate,
    tax: floor100(lv1Base * localRates.bizTaxLv1Rate),
  };
  const bizTaxLv2: TaxLineRow = {
    base: lv2Base,
    rate: localRates.bizTaxLv2Rate,
    tax: floor100(lv2Base * localRates.bizTaxLv2Rate),
  };
  const bizTaxLv3: TaxLineRow = {
    base: lv3Base,
    rate: localRates.bizTaxLv3Rate,
    tax: floor100(lv3Base * localRates.bizTaxLv3Rate),
  };
  const bizTaxTotal = bizTaxLv1.tax + bizTaxLv2.tax + bizTaxLv3.tax;

  // 特別法人事業税
  const specialBizTax: TaxLineRow = {
    base: bizTaxTotal,
    rate: localRates.specialBizTaxRate,
    tax: floor100(bizTaxTotal * localRates.specialBizTaxRate),
  };

  // 所得が 0 以下なら均等割のみ
  if (ti <= 0) {
    return {
      corporateTaxLow: emptyLine(corporateTaxLowRate),
      corporateTaxHigh: emptyLine(corporateTaxHighRate),
      localCorporateTax: emptyLine(LOCAL_CORPORATE_TAX_RATE),
      defenseTax: emptyLine(DEFENSE_TAX.rate),
      residentTaxOnIncome: emptyLine(localRates.residentTaxRate),
      kintowariManYen: kw,
      bizTaxLv1: emptyLine(localRates.bizTaxLv1Rate),
      bizTaxLv2: emptyLine(localRates.bizTaxLv2Rate),
      bizTaxLv3: emptyLine(localRates.bizTaxLv3Rate),
      specialBizTax: emptyLine(localRates.specialBizTaxRate),
      corporateTaxTotal: 0,
      bizTaxTotal: 0,
      total: kw,
    };
  }

  return {
    corporateTaxLow: {
      base: corporateTaxLowBase,
      rate: corporateTaxLowRate,
      tax: corporateTaxLowTax,
    },
    corporateTaxHigh: {
      base: corporateTaxHighBase,
      rate: corporateTaxHighRate,
      tax: corporateTaxHighTax,
    },
    localCorporateTax,
    defenseTax,
    residentTaxOnIncome,
    kintowariManYen: kw,
    bizTaxLv1,
    bizTaxLv2,
    bizTaxLv3,
    specialBizTax,
    corporateTaxTotal,
    bizTaxTotal,
    total:
      corporateTaxTotal +
      localCorporateTax.tax +
      defenseTax.tax +
      residentTaxOnIncome.tax +
      kw +
      bizTaxTotal +
      specialBizTax.tax,
  };
}

// ===========================================================
// 社会保険料計算
// ===========================================================

export interface SocialInsuranceBreakdown {
  /** 標準報酬月額（health 用、万円） */
  standardComp: number;
  /** 健康保険(年額・各負担、万円) */
  healthCorp: number;
  healthPersonal: number;
  /** 介護保険(年額・各負担、万円) */
  careCorp: number;
  carePersonal: number;
  /** 厚生年金(年額・各負担、万円) */
  pensionCorp: number;
  pensionPersonal: number;
  /** 子ども子育て拠出金(会社のみ・年額) */
  childCorp: number;
  /** 子育て支援金(年額・各負担) */
  childcareCorp: number;
  childcarePersonal: number;
  /** 会社負担合計(年額) */
  totalCorp: number;
  /** 個人負担合計(年額) */
  totalPersonal: number;
  /** 労使合計(年額) */
  totalAll: number;
}

export function calcSocialInsurance(
  monthlyManYen: number,
  age: ExecAgeBracket,
): SocialInsuranceBreakdown {
  const std = standardCompensation(monthlyManYen);
  const isCareApplied = appliesCareInsurance(age);

  const healthRate = SI_RATES.health;
  const careRate = isCareApplied ? SI_RATES.care : 0;
  const pensionRate = SI_RATES.pension;
  const childRate = SI_RATES.childContribution;
  const childcareRate = SI_RATES.childcareSupport;

  const healthM = std.health * healthRate;
  const careM = std.health * careRate;
  const pensionM = std.pension * pensionRate;
  const childM = std.health * childRate;
  const childcareM = std.health * childcareRate;

  const corpM = healthM + careM + pensionM + childM + childcareM;
  const persM = healthM + careM + pensionM + childcareM;

  return {
    standardComp: std.health,
    healthCorp: healthM * 12,
    healthPersonal: healthM * 12,
    careCorp: careM * 12,
    carePersonal: careM * 12,
    pensionCorp: pensionM * 12,
    pensionPersonal: pensionM * 12,
    childCorp: childM * 12,
    childcareCorp: childcareM * 12,
    childcarePersonal: childcareM * 12,
    totalCorp: corpM * 12,
    totalPersonal: persM * 12,
    totalAll: (corpM + persM) * 12,
  };
}

// ===========================================================
// 統合シミュレーション
// ===========================================================

export interface SimulationInput {
  /** 売上(年・万円) */
  revenueManYen: number;
  /** 経費(年・役員報酬除く・万円) */
  expensesManYen: number;
  /** 役員報酬(月額・万円) */
  monthlyCompManYen: number;
  age: ExecAgeBracket;
  /** 扶養人数（配偶者除く） */
  dependents: number;
  /** 配偶者の年収(万円) */
  spouseAnnualManYen: number;
  spouseAge: "general" | "elderly";
  /** その他所得控除(万円) */
  otherDeductionManYen: number;
  /** 資本金(万円) */
  capitalManYen: number;
  /** 従業員数 */
  employees: number;
  /** 減価償却費(年・万円) */
  depreciationManYen: number;
  /** 借入金返済(年・万円) */
  loanRepaymentManYen: number;
  /** 小規模企業共済掛金(年・万円) — 個人の所得控除 */
  smallBizKyosaiManYen?: number;
}

export interface SimulationResult {
  /** 役員報酬年額 */
  annualComp: number;
  /** 社保 */
  si: SocialInsuranceBreakdown;
  /** 法人課税所得（赤字なら負値） */
  corpTaxableIncome: number;
  /** 法人税等内訳 */
  corpTax: CorpTaxBreakdown;
  /** 法人税引後利益 */
  corpNetProfit: number;
  /** 法人キャッシュフロー(税引後利益 + 減価償却 - 借入返済) */
  corpCashflow: number;
  /** 給与所得控除 */
  salaryDed: number;
  /** 給与所得 */
  salaryIncome: number;
  /** 基礎控除 */
  basicDed: number;
  /** 配偶者控除 */
  spouseDed: number;
  /** 扶養控除 */
  dependentDed: number;
  /** 個人課税所得 */
  personalTaxableIncome: number;
  /** 所得税 */
  it: number;
  /** 復興特別所得税 */
  rt: number;
  /** 個人住民税 */
  re: number;
  /** 個人税・社保合計 */
  personalTotalTax: number;
  /** 個人手取り */
  personalNet: number;
  /** トータル手残り(法人税引後 + 個人手取り) */
  totalNet: number;
  /** 全税負担(法人税等 + 所得税 + 復興 + 住民 + 社保労使計) */
  totalTaxBurden: number;
  /** 税負担率(全税負担/売上) */
  taxRate: number;
}

export function simulate(p: SimulationInput): SimulationResult {
  const annualComp = p.monthlyCompManYen * 12;
  const si = calcSocialInsurance(p.monthlyCompManYen, p.age);

  // 法人側
  const ctiRaw = p.revenueManYen - p.expensesManYen - annualComp - si.totalCorp;
  const cti = ctiRaw >= 0 ? floor1000(ctiRaw) : ctiRaw;
  const corpTax = calcCorpTax(Math.max(0, ctiRaw), p.capitalManYen);
  const corpNetProfit = Math.max(0, cti) - corpTax.total;
  const corpCashflow =
    corpNetProfit + p.depreciationManYen - p.loanRepaymentManYen;

  // 個人側
  const sd = salaryIncomeDeduction(annualComp);
  const salInc = Math.max(0, annualComp - sd);
  const bd = basicDeduction(salInc);
  const spd = spouseDeduction(salInc, p.spouseAnnualManYen, p.spouseAge);
  const dd = p.dependents * 38;
  const smallBizKyosai = p.smallBizKyosaiManYen ?? 0;
  const pti = floor1000(
    Math.max(
      0,
      salInc - bd - spd - dd - si.totalPersonal - p.otherDeductionManYen - smallBizKyosai,
    ),
  );
  const it = floor100(incomeTax(pti));
  const rt = floor100(it * RECONSTRUCTION_TAX_RATE);
  const re = floor100(pti * PERSONAL_RESIDENT_TAX_RATE + 0.5);
  const ptt = it + rt + re + si.totalPersonal;
  const pn = annualComp - ptt;
  const tn = corpNetProfit + pn;
  const ttb = corpTax.total + it + rt + re + si.totalAll;

  return {
    annualComp,
    si,
    corpTaxableIncome: cti,
    corpTax,
    corpNetProfit,
    corpCashflow,
    salaryDed: sd,
    salaryIncome: salInc,
    basicDed: bd,
    spouseDed: spd,
    dependentDed: dd,
    personalTaxableIncome: pti,
    it,
    rt,
    re,
    personalTotalTax: ptt,
    personalNet: pn,
    totalNet: tn,
    totalTaxBurden: ttb,
    taxRate: p.revenueManYen > 0 ? (ttb / p.revenueManYen) * 100 : 0,
  };
}

/** 最適報酬月額を探索（0〜maxまで5万円刻み + ±5万円精緻化） */
export function findOptimalMonthlyComp(p: SimulationInput): {
  monthlyComp: number;
  totalNet: number;
} {
  const max = Math.min(500, Math.max(0, Math.ceil((p.revenueManYen - p.expensesManYen) / 12)));
  let best = 0;
  let bestVal = -Infinity;
  for (let m = 0; m <= max; m += 5) {
    const r = simulate({ ...p, monthlyCompManYen: m });
    if (r.corpTaxableIncome >= 0 && r.totalNet > bestVal) {
      bestVal = r.totalNet;
      best = m;
    }
  }
  for (let m = Math.max(0, best - 5); m <= Math.min(max, best + 5); m++) {
    const r = simulate({ ...p, monthlyCompManYen: m });
    if (r.corpTaxableIncome >= 0 && r.totalNet > bestVal) {
      bestVal = r.totalNet;
      best = m;
    }
  }
  return { monthlyComp: best, totalNet: bestVal };
}

// ===========================================================
// 表示用フォーマッタ
// ===========================================================

/** 万円単位の数値を「¥XX,XXX」形式に */
export function formatYenFromManYen(manYen: number): string {
  return `¥${Math.round(manYen * 10000).toLocaleString()}`;
}

/** 「百万円」「億円」など短縮形 */
export function formatYenShort(manYen: number): string {
  const yen = Math.round(manYen * 10000);
  if (Math.abs(yen) >= 100_000_000)
    return `${(yen / 100_000_000).toFixed(1)}億円`;
  if (Math.abs(yen) >= 10_000)
    return `${Math.round(yen / 10_000).toLocaleString()}万円`;
  return `${yen.toLocaleString()}円`;
}
