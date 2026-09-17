import type { ExecAgeBracket } from '@/lib/tax-rates-2026';

export const EXEC_PREFILL_FIELDS = ['revenue', 'expenses', 'monthlyComp', 'depreciation', 'capital'] as const;
type PrefillField = typeof EXEC_PREFILL_FIELDS[number];
export interface ExecCompForm {
  revenue: string;
  expenses: string;
  monthlyComp: number;
  age: ExecAgeBracket;
  dependents: number;
  spouseAnnual: string;
  spouseAge: 'general' | 'elderly';
  otherDeduction: string;
  capital: string;
  depreciation: string;
  loanRepayment: string;
  smallBizKyosai: string;
  prefill?: Partial<Record<PrefillField, 'auto' | 'manual'>>;
}
export const DEFAULT_EXEC_FORM: ExecCompForm = {
  revenue:'50000000', expenses:'20000000', monthlyComp:1000000,
  age:'40to64', dependents:0, spouseAnnual:'0', spouseAge:'general',
  otherDeduction:'0', capital:'1000000', depreciation:'0', loanRepayment:'0', smallBizKyosai:'0',
  prefill:{revenue:'auto',expenses:'auto',monthlyComp:'auto',depreciation:'auto',capital:'auto'},
};

export function normalizeExecForm(raw: Partial<ExecCompForm> | null | undefined): ExecCompForm {
  const defined = Object.fromEntries(Object.entries(raw ?? {}).filter(([, value]) => value != null));
  const form = { ...DEFAULT_EXEC_FORM, ...defined } as ExecCompForm;
  if (!Number.isFinite(form.monthlyComp)) form.monthlyComp = DEFAULT_EXEC_FORM.monthlyComp;
  if (!Number.isFinite(form.dependents)) form.dependents = 0;
  // Existing values without provenance are user-owned; missing fields may be filled.
  form.prefill = Object.fromEntries(EXEC_PREFILL_FIELDS.map(field => [field,
    raw?.prefill?.[field] ?? (raw?.[field] != null ? 'manual' : 'auto'),
  ]));
  return form;
}

export function applyExecPreset(form: ExecCompForm, preset: Partial<Pick<ExecCompForm, PrefillField>>, force = false): ExecCompForm {
  let next = form;
  for (const field of EXEC_PREFILL_FIELDS) {
    const value = preset[field];
    if (value == null || (!force && form.prefill?.[field] !== 'auto')) continue;
    if (form[field] === value && form.prefill?.[field] === 'auto') continue;
    next = {...next, [field]:value, prefill:{...next.prefill,[field]:'auto'}};
  }
  return next;
}

export function sumTransitionToMonth(rows: {month:string;amount:number}[] | undefined, startMonth:number, elapsed:number): number {
  return (rows ?? []).reduce((total,row) => {
    const month = /^\d{4}-\d{2}/.test(row.month)
      ? Number(row.month.slice(5,7))
      : Number(row.month.match(/^(\d{1,2})月$/)?.[1]);
    const order = (month - startMonth + 12) % 12 + 1;
    return month >= 1 && month <= 12 && order <= elapsed && Number.isFinite(row.amount) ? total + row.amount : total;
  },0);
}
