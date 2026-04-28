/**
 * 令和8年度（2026年度）税制改正大綱・協会けんぽ東京都料率に基づく税率・料率の SSOT。
 * projects/board/reference.html の値を移植したもの。
 * 役員報酬シミュ / 納税予想 / 減資 など全機能から参照する。
 *
 * 単位: 金額は「万円」（HTMLシミュ流儀） / 率は小数（0.232 = 23.2%）
 */

// ===========================================================
// 法人税系
// ===========================================================

/** 法人税率 — 中小法人(資本金1億円以下)の特例 */
export const CORP_TAX_RATES_SMB = {
  /** 800万円以下の所得部分 */
  lowBracket: 0.15,
  /** 800万円超の所得部分 */
  highBracket: 0.232,
  /** 区切りの所得（万円） */
  bracketThreshold: 800,
} as const;

/** 法人税率 — 大法人 */
export const CORP_TAX_RATES_LARGE = {
  flat: 0.232,
} as const;

/** 防衛特別法人税: (法人税額 - 500万円) × 4% */
export const DEFENSE_TAX = {
  rate: 0.04,
  /** 控除額（万円） */
  deduction: 500,
} as const;

/** 法人住民税(税割) — 都道府県+市区町村合計 */
export const CORP_RESIDENT_TAX_RATE = 0.104;

/** 法人事業税 — 中小法人(資本金1億円以下) */
export const CORP_BIZ_TAX_RATES_SMB = {
  /** 400万円以下 */
  lv1: { threshold: 400, rate: 0.035 },
  /** 400万〜800万 */
  lv2: { threshold: 800, rate: 0.053 },
  /** 800万円超 */
  lv3: { rate: 0.07 },
} as const;

/** 大法人の事業税は所得割のみで一律 */
export const CORP_BIZ_TAX_RATE_LARGE = 0.07;

/** 特別法人事業税 = 事業税額 × 37% */
export const SPECIAL_CORP_BIZ_TAX_RATE = 0.37;

/**
 * 法人住民税 均等割（都道府県+市区町村合計、東京都基準・万円）
 * 資本金等の額 × 従業員数 のマトリクス
 */
export function getKintowariYen(capitalManYen: number, employees: number): number {
  let pref: number;
  if (capitalManYen <= 1000) pref = 2;
  else if (capitalManYen <= 10000) pref = 5;
  else if (capitalManYen <= 100000) pref = 13;
  else if (capitalManYen <= 500000) pref = 54;
  else pref = 80;

  let city: number;
  if (capitalManYen <= 1000) city = employees <= 50 ? 5 : 12;
  else if (capitalManYen <= 10000) city = employees <= 50 ? 13 : 15;
  else if (capitalManYen <= 100000) city = employees <= 50 ? 16 : 40;
  else if (capitalManYen <= 500000) city = employees <= 50 ? 41 : 175;
  else city = employees <= 50 ? 41 : 300;

  return pref + city;
}

// ===========================================================
// 外形標準課税（資本金1億円超）
// ===========================================================

/** 資本金割: 資本金等の額 × 0.525% */
export const GAIKEI_CAPITAL_RATE = 0.00525;

// ===========================================================
// 個人所得税
// ===========================================================

/** 給与所得控除（年収「万円」入力 → 控除額「万円」） */
export function salaryIncomeDeduction(annualManYen: number): number {
  if (annualManYen <= 220) return 74;
  if (annualManYen <= 360) return annualManYen * 0.3 + 8;
  if (annualManYen <= 660) return annualManYen * 0.2 + 44;
  if (annualManYen <= 850) return annualManYen * 0.1 + 110;
  return 195;
}

/** 所得税の累進テーブル — 課税所得「万円」入力 → 税額「万円」 */
export function incomeTax(taxableManYen: number): number {
  if (taxableManYen <= 0) return 0;
  // [上限, 税率, 控除額] (万円)
  const brackets: Array<[number, number, number]> = [
    [195, 0.05, 0],
    [330, 0.1, 9.75],
    [695, 0.2, 42.75],
    [900, 0.23, 63.6],
    [1800, 0.33, 153.6],
    [4000, 0.4, 279.6],
    [Number.MAX_SAFE_INTEGER, 0.45, 479.6],
  ];
  for (const [limit, rate, deduction] of brackets) {
    if (taxableManYen <= limit) return taxableManYen * rate - deduction;
  }
  return 0;
}

/** 復興特別所得税率 */
export const RECONSTRUCTION_TAX_RATE = 0.021;

/** 個人住民税率 */
export const PERSONAL_RESIDENT_TAX_RATE = 0.1;

/**
 * 基礎控除（令和8・9年分の特例上乗せを反映、万円）
 * 合計所得金額により段階的に減額
 */
export function basicDeduction(salaryIncomeManYen: number): number {
  if (salaryIncomeManYen <= 489) return 104;
  if (salaryIncomeManYen <= 2350) return 62;
  if (salaryIncomeManYen <= 2400) return 32;
  if (salaryIncomeManYen <= 2450) return 16;
  return 0;
}

/** 配偶者控除（万円、納税者所得・配偶者所得・配偶者年齢から算出） */
export function spouseDeduction(
  taxpayerIncomeManYen: number,
  spouseAnnualManYen: number,
  spouseAge: "general" | "elderly",
): number {
  if (spouseAnnualManYen <= 0) return 0;
  if (taxpayerIncomeManYen > 1000) return 0;
  const spSalDed = salaryIncomeDeduction(spouseAnnualManYen);
  const spIncome = Math.max(0, spouseAnnualManYen - spSalDed);
  let base = 0;
  if (spIncome <= 62) base = spouseAge === "elderly" ? 48 : 38;
  else if (spIncome <= 95) base = 38;
  else if (spIncome <= 100) base = 36;
  else if (spIncome <= 105) base = 31;
  else if (spIncome <= 110) base = 26;
  else if (spIncome <= 115) base = 21;
  else if (spIncome <= 120) base = 16;
  else if (spIncome <= 125) base = 11;
  else if (spIncome <= 130) base = 6;
  else if (spIncome <= 133) base = 3;
  else return 0;

  if (taxpayerIncomeManYen <= 900) return base;
  if (taxpayerIncomeManYen <= 950) return Math.floor((base * 2) / 3);
  return Math.floor(base / 3);
}

// ===========================================================
// 社会保険
// ===========================================================

/**
 * 標準報酬月額（健康保険50等級・厚生年金32等級、東京都・万円単位）
 * 月額報酬から上下限を考慮した health/pension の標準月額を返す。
 * 月額が最低等級閾値(53,000円)未満の場合は社保適用外として 0 を返す。
 */
export function standardCompensation(monthlyManYen: number): {
  health: number;
  pension: number;
} {
  const grades = [
    5.8, 6.8, 7.8, 8.8, 9.8, 10.4, 11, 11.8, 12.6, 13.4, 14.2, 15, 16, 17, 18,
    19, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 41, 44, 47, 50, 53, 56, 59, 62,
    65, 68, 71, 75, 79, 83, 88, 93, 98, 103, 107, 114, 121, 127, 133, 139,
  ];
  // 月額が最低等級の境界(5.3万円)未満なら社保適用外
  const minThresholdYen = grades[0] * 10000 - 5000;
  if (monthlyManYen * 10000 < minThresholdYen) {
    return { health: 0, pension: 0 };
  }
  let h = grades[0];
  for (const g of grades) {
    if (monthlyManYen * 10000 >= g * 10000 - 5000) h = g;
  }
  return {
    health: Math.min(h, 139),
    pension: Math.min(h, 65),
  };
}

/** 社保料率（協会けんぽ東京都・労使それぞれ） */
export const SI_RATES = {
  health: 0.04925,
  /** 介護保険(40-64歳) */
  care: 0.0081,
  pension: 0.0915,
  /** 子ども子育て拠出金（会社のみ） */
  childContribution: 0.0036,
  /** 子育て支援金（労使共通） */
  childcareSupport: 0.00115,
} as const;

/** 役員年齢区分 */
export type ExecAgeBracket = "under40" | "40to64" | "65to69" | "over70";

/** 介護保険対象判定 */
export function appliesCareInsurance(age: ExecAgeBracket): boolean {
  return age === "40to64";
}
