/** 会計実績からの自動反映と手入力を区別する。税額計算・金額単位は変更しない。 */
export const TAX_PREFILL_FIELDS = [
  "pretaxProfit",
  "capital",
  "vatReceived",
  "vatPaid",
] as const;

export type TaxPrefillField = (typeof TAX_PREFILL_FIELDS)[number];
export type TaxPrefillModes = Partial<Record<TaxPrefillField, "auto" | "manual">>;
export type TaxForecastPreset = Partial<Record<TaxPrefillField, string | null>>;

interface PrefillForm {
  pretaxProfit: string;
  capital: string;
  vatReceived: string;
  vatPaid: string;
  prefill?: TaxPrefillModes;
}

export function applyTaxForecastPreset<T extends PrefillForm>(
  form: T,
  preset: TaxForecastPreset,
  replaceManual = false,
): T {
  let next = form;
  for (const field of TAX_PREFILL_FIELDS) {
    const value = preset[field];
    // 未取得の科目は、既存値を0で置き換えない。
    if (value == null) continue;
    // 旧保存データには出自がないため、明示的な再反映までは既存値を保持する。
    if (!replaceManual && form.prefill?.[field] !== "auto") continue;
    if (form[field] === value && form.prefill?.[field] === "auto") continue;
    next = { ...next, [field]: value, prefill: { ...next.prefill, [field]: "auto" } };
  }
  return next;
}

export function setTaxForecastManualValue<T extends PrefillForm>(
  form: T,
  field: TaxPrefillField,
  value: string,
): T {
  // 0や空欄も、利用者が入力した値として保持する。
  return { ...form, [field]: value, prefill: { ...form.prefill, [field]: "manual" } };
}

export function sanitizeTaxAmount(value: string, allowNegative = false): string {
  const negative = allowNegative && value.startsWith("-");
  return `${negative ? "-" : ""}${value.replace(/[^\d]/g, "")}`;
}
