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
  CORP_RESIDENT_TAX_RATE,
  CORP_BIZ_TAX_RATES_SMB,
  CORP_BIZ_TAX_RATE_LARGE,
  SPECIAL_CORP_BIZ_TAX_RATE,
  RECONSTRUCTION_TAX_RATE,
  PERSONAL_RESIDENT_TAX_RATE,
  SI_RATES,
  appliesCareInsurance,
  basicDeduction,
  getKintowariYen,
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

export interface CorpTaxBreakdown {
  /** 法人税 */
  corporateTax: number;
  /** 防衛特別法人税 */
  defenseTax: number;
  /** 法人住民税(税割+均等割) */
  residentTax: number;
  /** 法人事業税 */
  bizTax: number;
  /** 特別法人事業税 */
  specialBizTax: number;
  /** 均等割 */
  kintowari: number;
  /** 法人税等合計 */
  total: number;
}

/**
 * 法人税等の計算（万円単位）
 * @param taxableIncomeManYen 課税所得（万円）
 * @param capitalManYen 資本金（万円）
 * @param employees 従業員数
 */
export function calcCorpTax(
  taxableIncomeManYen: number,
  capitalManYen: number,
  employees: number,
): CorpTaxBreakdown {
  const ti = floor1000(taxableIncomeManYen);
  const kw = getKintowariYen(capitalManYen, employees);
  if (ti <= 0) {
    return {
      corporateTax: 0,
      defenseTax: 0,
      residentTax: kw,
      bizTax: 0,
      specialBizTax: 0,
      kintowari: kw,
      total: kw,
    };
  }

  const isSmb = capitalManYen <= 10000;

  // 法人税
  const corporateTax = floor100(
    isSmb
      ? ti <= CORP_TAX_RATES_SMB.bracketThreshold
        ? ti * CORP_TAX_RATES_SMB.lowBracket
        : CORP_TAX_RATES_SMB.bracketThreshold * CORP_TAX_RATES_SMB.lowBracket +
          (ti - CORP_TAX_RATES_SMB.bracketThreshold) *
            CORP_TAX_RATES_SMB.highBracket
      : ti * CORP_TAX_RATES_LARGE.flat,
  );

  // 防衛特別法人税
  const defenseTax = floor100(
    Math.max(0, corporateTax - DEFENSE_TAX.deduction) * DEFENSE_TAX.rate,
  );

  // 法人住民税(税割+均等割)
  const residentTax = floor100(corporateTax * CORP_RESIDENT_TAX_RATE + kw);

  // 法人事業税
  let bizTax: number;
  if (isSmb) {
    if (ti <= CORP_BIZ_TAX_RATES_SMB.lv1.threshold) {
      bizTax = ti * CORP_BIZ_TAX_RATES_SMB.lv1.rate;
    } else if (ti <= CORP_BIZ_TAX_RATES_SMB.lv2.threshold) {
      bizTax =
        CORP_BIZ_TAX_RATES_SMB.lv1.threshold * CORP_BIZ_TAX_RATES_SMB.lv1.rate +
        (ti - CORP_BIZ_TAX_RATES_SMB.lv1.threshold) *
          CORP_BIZ_TAX_RATES_SMB.lv2.rate;
    } else {
      bizTax =
        CORP_BIZ_TAX_RATES_SMB.lv1.threshold * CORP_BIZ_TAX_RATES_SMB.lv1.rate +
        (CORP_BIZ_TAX_RATES_SMB.lv2.threshold -
          CORP_BIZ_TAX_RATES_SMB.lv1.threshold) *
          CORP_BIZ_TAX_RATES_SMB.lv2.rate +
        (ti - CORP_BIZ_TAX_RATES_SMB.lv2.threshold) *
          CORP_BIZ_TAX_RATES_SMB.lv3.rate;
    }
  } else {
    bizTax = ti * CORP_BIZ_TAX_RATE_LARGE;
  }
  bizTax = floor100(bizTax);

  // 特別法人事業税
  const specialBizTax = floor100(bizTax * SPECIAL_CORP_BIZ_TAX_RATE);

  return {
    corporateTax,
    defenseTax,
    residentTax,
    bizTax,
    specialBizTax,
    kintowari: kw,
    total: corporateTax + defenseTax + residentTax + bizTax + specialBizTax,
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
  const corpTax = calcCorpTax(Math.max(0, ctiRaw), p.capitalManYen, p.employees);
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
