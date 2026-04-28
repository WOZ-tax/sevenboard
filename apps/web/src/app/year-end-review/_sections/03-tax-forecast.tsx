"use client";

import { useEffect, useMemo, useState } from "react";
import { useMfPL, useMfBS } from "@/hooks/use-mf-data";
import { usePeriodStore } from "@/lib/period-store";
import { calcCorpTax, formatYenFromManYen } from "@/lib/payroll-tax-calc";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "sevenboard:tax-forecast-input";

interface AddSubItem {
  id: string;
  label: string;
  amount: string;
  kind: "add" | "sub";
}

const DEFAULT_ITEMS: AddSubItem[] = [
  { id: "entertainment", label: "交際費損金不算入", amount: "0", kind: "add" },
  { id: "depreciation-over", label: "減価償却超過額", amount: "0", kind: "add" },
  { id: "received-dividends", label: "受取配当益金不算入", amount: "0", kind: "sub" },
  { id: "donation", label: "寄附金損金不算入", amount: "0", kind: "add" },
  { id: "carry-loss", label: "繰越欠損金", amount: "0", kind: "sub" },
];

interface FormState {
  pretaxProfit: string;
  capital: string;
  employees: string;
  items: AddSubItem[];
  midPayment: string;
  vatReceived: string;
  vatPaid: string;
  vatMid: string;
}

const DEFAULT_FORM: FormState = {
  pretaxProfit: "0",
  capital: "1000000",
  employees: "5",
  items: DEFAULT_ITEMS,
  midPayment: "0",
  vatReceived: "0",
  vatPaid: "0",
  vatMid: "0",
};

const parseNum = (s: string): number => parseFloat(s.replace(/,/g, "")) || 0;
const fmtComma = (n: number): string =>
  Number.isFinite(n) ? Math.round(n).toLocaleString() : "0";

export function TaxForecastSection() {
  const pl = useMfPL();
  const bs = useMfBS();
  const lockedMonth = usePeriodStore((s) => s.month);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 復元（client only）
      if (raw) setForm((p) => ({ ...p, ...JSON.parse(raw) }));
    } catch {
      // ignore
    }
     
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY)) return;

    const findPl = (key: string): number | null => {
      if (!Array.isArray(pl.data)) return null;
      const row = pl.data.find((r) => r.category.includes(key));
      return row?.current ?? null;
    };
    const findBs = (key: string): number | null => {
      if (!bs.data) return null;
      const all = [...bs.data.assets, ...bs.data.liabilitiesEquity];
      const row = all.find((r) => r.category.includes(key));
      return row?.current ?? null;
    };

    const elapsed = lockedMonth ? Math.max(1, lockedMonth) : 12;
    const annualize = (v: number) => Math.round((v / elapsed) * 12);
    const annualizeManYen = (v: number) => Math.round(((v / elapsed) * 12) / 10000);

    const ord = findPl("経常利益") ?? 0;
    const cap = findBs("資本金") ?? 0;
    const vatRecv = findBs("仮受消費税") ?? 0;
    const vatPaid = findBs("仮払消費税") ?? 0;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- MF実績からの初期プリセット
    setForm((prev) => ({
      ...prev,
      pretaxProfit: ord ? String(annualizeManYen(ord)) : prev.pretaxProfit,
      capital: cap ? String(cap) : prev.capital,
      vatReceived: vatRecv ? String(annualize(vatRecv)) : prev.vatReceived,
      vatPaid: vatPaid ? String(annualize(vatPaid)) : prev.vatPaid,
    }));
  }, [hydrated, pl.data, bs.data, lockedMonth]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    } catch {
      // ignore
    }
  }, [form, hydrated]);

  const taxableIncome = useMemo(() => {
    const base = parseNum(form.pretaxProfit);
    const adj = form.items.reduce(
      (acc, it) => (it.kind === "add" ? acc + parseNum(it.amount) : acc - parseNum(it.amount)),
      0,
    );
    return base + adj;
  }, [form.pretaxProfit, form.items]);

  const corpTax = useMemo(
    () =>
      calcCorpTax(
        taxableIncome,
        Math.max(100, parseNum(form.capital) / 10000),
        parseInt(form.employees, 10) || 0,
      ),
    [taxableIncome, form.capital, form.employees],
  );

  const vatPayable = useMemo(() => {
    const recv = parseNum(form.vatReceived);
    const paid = parseNum(form.vatPaid);
    const mid = parseNum(form.vatMid);
    const annual = Math.max(0, recv - paid);
    return { annual, periodEnd: Math.max(0, annual - mid) };
  }, [form.vatReceived, form.vatPaid, form.vatMid]);

  const totalCorp = corpTax.total;
  const corpMid = parseNum(form.midPayment);
  const corpPeriodEnd = Math.max(0, totalCorp - corpMid);

  const setItem = (id: string, amount: string) =>
    setForm((p) => ({
      ...p,
      items: p.items.map((it) => (it.id === id ? { ...it, amount } : it)),
    }));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          <div className="rounded-md border bg-white shadow-sm">
            <div className="border-b px-3 py-2 text-xs font-bold text-[var(--color-primary)]">
              所得計算
            </div>
            <div className="space-y-1.5 p-2.5">
              <YenField
                label="通期予想税引前利益（万円）"
                value={form.pretaxProfit}
                onChange={(v) => setForm((p) => ({ ...p, pretaxProfit: v }))}
              />
              <div className="border-t pt-2">
                <div className="mb-1 text-[11px] font-semibold text-muted-foreground">
                  別表加減算（万円）
                </div>
                {form.items.map((it) => (
                  <div key={it.id} className="mb-1.5 flex items-center gap-2">
                    <span
                      className={cn(
                        "w-6 text-center text-[10px] font-bold",
                        it.kind === "add" ? "text-rose-600" : "text-emerald-600",
                      )}
                    >
                      {it.kind === "add" ? "+" : "−"}
                    </span>
                    <span className="flex-1 truncate text-[11px]">{it.label}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={fmtComma(parseNum(it.amount))}
                      onChange={(e) => setItem(it.id, e.target.value.replace(/[^\d]/g, ""))}
                      className="w-20 rounded border px-1.5 py-1 text-right text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-md border bg-white shadow-sm">
            <div className="border-b px-3 py-2 text-xs font-bold text-[var(--color-primary)]">
              法人区分
            </div>
            <div className="space-y-1.5 p-2.5">
              <YenField
                label="資本金（円）"
                value={form.capital}
                onChange={(v) => setForm((p) => ({ ...p, capital: v }))}
              />
              <NumField
                label="従業員数"
                value={parseInt(form.employees, 10) || 0}
                onChange={(v) => setForm((p) => ({ ...p, employees: String(v) }))}
              />
              <YenField
                label="法人税系 中間納付額（万円）"
                value={form.midPayment}
                onChange={(v) => setForm((p) => ({ ...p, midPayment: v }))}
              />
            </div>
          </div>

          <div className="rounded-md border bg-white shadow-sm">
            <div className="border-b px-3 py-2 text-xs font-bold text-[var(--color-primary)]">
              消費税
            </div>
            <div className="space-y-1.5 p-2.5">
              <YenField
                label="仮受消費税（年換算・円）"
                value={form.vatReceived}
                onChange={(v) => setForm((p) => ({ ...p, vatReceived: v }))}
              />
              <YenField
                label="仮払消費税（年換算・円）"
                value={form.vatPaid}
                onChange={(v) => setForm((p) => ({ ...p, vatPaid: v }))}
              />
              <YenField
                label="中間納付額（円）"
                value={form.vatMid}
                onChange={(v) => setForm((p) => ({ ...p, vatMid: v }))}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-md border-l-4 border-l-blue-500 bg-blue-50/50 p-3">
            <div className="text-xs font-semibold text-muted-foreground">当期予想所得金額</div>
            <div className="text-xl font-bold tabular-nums text-blue-700">
              {formatYenFromManYen(taxableIncome)}
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              税引前利益 {formatYenFromManYen(parseNum(form.pretaxProfit))} ± 別表加減算
            </div>
          </div>

          <div className="rounded-md border bg-white shadow-sm">
            <div className="border-b px-3 py-2 text-xs font-bold text-[var(--color-primary)]">
              法人税等
            </div>
            <table className="w-full text-xs">
              <thead className="text-[10px] text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 text-left">税目</th>
                  <th className="px-3 py-1.5 text-right">年税額</th>
                  <th className="px-3 py-1.5 text-right">中間納付</th>
                  <th className="px-3 py-1.5 text-right">期末納付額</th>
                </tr>
              </thead>
              <tbody>
                <TaxRow label="法人税" annual={corpTax.corporateTax} />
                <TaxRow label="防衛特別法人税" annual={corpTax.defenseTax} />
                <TaxRow label="地方法人税(住民税・税割+均等割)" annual={corpTax.residentTax} />
                <TaxRow label="法人事業税" annual={corpTax.bizTax} />
                <TaxRow label="特別法人事業税" annual={corpTax.specialBizTax} />
                <tr className="border-t font-bold">
                  <td className="px-3 py-1.5">国税地方税合計</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatYenFromManYen(totalCorp)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatYenFromManYen(corpMid)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-rose-700">
                    {formatYenFromManYen(corpPeriodEnd)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded-md border bg-white shadow-sm">
            <div className="border-b px-3 py-2 text-xs font-bold text-[var(--color-primary)]">
              消費税
            </div>
            <table className="w-full text-xs">
              <tbody>
                <tr>
                  <td className="px-3 py-1.5 text-muted-foreground">仮受消費税(年換算)</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    ¥{fmtComma(parseNum(form.vatReceived))}
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-1.5 text-muted-foreground">仮払消費税(年換算)</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    −¥{fmtComma(parseNum(form.vatPaid))}
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-1.5 font-bold">差引納付額(年)</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-bold">
                    ¥{fmtComma(vatPayable.annual)}
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-1.5 text-muted-foreground">中間納付</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    −¥{fmtComma(parseNum(form.vatMid))}
                  </td>
                </tr>
                <tr className="border-t bg-rose-50/40">
                  <td className="px-3 py-1.5 font-bold">期末納付予想額</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-bold text-rose-700">
                    ¥{fmtComma(vatPayable.periodEnd)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded-md border-l-4 border-l-rose-500 bg-rose-50/40 p-3">
            <div className="text-xs font-semibold text-muted-foreground">
              決算時 納付予想額（合計）
            </div>
            <div className="text-2xl font-bold tabular-nums text-rose-700">
              ¥{fmtComma(corpPeriodEnd * 10000 + vatPayable.periodEnd)}
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              法人税等 {formatYenFromManYen(corpPeriodEnd)} + 消費税 ¥{fmtComma(vatPayable.periodEnd)}
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        ※ 本シートは作成日現在の予測値であり、実際の数値を確約するものではございません。
        中小特例（軽減税率15%、軽減事業税）は資本金1億円以下で自動適用されます。
      </p>
    </div>
  );
}

function TaxRow({ label, annual }: { label: string; annual: number }) {
  return (
    <tr>
      <td className="px-3 py-1.5 text-muted-foreground">{label}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">{formatYenFromManYen(annual)}</td>
      <td className="px-3 py-1.5 text-right text-muted-foreground">—</td>
      <td className="px-3 py-1.5 text-right text-muted-foreground">—</td>
    </tr>
  );
}

function YenField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-0.5 block text-[11px] font-semibold text-muted-foreground">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        value={fmtComma(parseNum(value))}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        className="w-full rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      />
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="mb-0.5 block text-[11px] font-semibold text-muted-foreground">{label}</label>
      <input
        type="number"
        value={value}
        min={0}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        className="w-full rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      />
    </div>
  );
}
