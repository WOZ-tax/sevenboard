"use client";

import { useEffect, useMemo } from "react";
import { RotateCcw } from "lucide-react";
import { useMfPL, useMfBS } from "@/hooks/use-mf-data";
import { useFyElapsed } from "@/hooks/use-fy-elapsed";
import { getFyElapsedFromMonth, usePeriodStore } from "@/lib/period-store";
import { calcCorpTax, formatYenFromManYen } from "@/lib/payroll-tax-calc";
import {
  DEFAULT_LOCAL_TAX_RATES,
  type LocalTaxRates,
} from "@/lib/tax-rates-2026";
import type { TaxLineRow } from "@/lib/payroll-tax-calc";
import { cn } from "@/lib/utils";
import { useFeatureStateLocal } from "@/hooks/use-year-end-state";

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

type MidKey =
  | "corpLow"
  | "corpHigh"
  | "localCorp"
  | "defense"
  | "resident"
  | "kintowari"
  | "bizLv1"
  | "bizLv2"
  | "bizLv3"
  | "specialBiz";

interface FormState {
  pretaxProfit: string;
  capital: string;
  items: AddSubItem[];
  /** 地方税率 (%) — 空文字なら東京都標準を使う。小数第2位までで保持 */
  residentTaxRatePct: string;
  bizTaxLv1RatePct: string;
  bizTaxLv2RatePct: string;
  bizTaxLv3RatePct: string;
  specialBizTaxRatePct: string;
  /** 均等割 年税額 (円、手入力) */
  kintowariYen: string;
  /** 税目別 中間納付額 (円) */
  midPaymentsYen: Record<MidKey, string>;
  /** 消費税 */
  vatReceived: string;
  vatPaid: string;
  vatMid: string;
}

const defaultMidPaymentsYen = (): Record<MidKey, string> => ({
  corpLow: "0",
  corpHigh: "0",
  localCorp: "0",
  defense: "0",
  resident: "0",
  kintowari: "0",
  bizLv1: "0",
  bizLv2: "0",
  bizLv3: "0",
  specialBiz: "0",
});

const fmtPct = (rate: number): string => (rate * 100).toFixed(2);

const DEFAULT_FORM: FormState = {
  pretaxProfit: "0",
  capital: "1000000",
  items: DEFAULT_ITEMS,
  residentTaxRatePct: fmtPct(DEFAULT_LOCAL_TAX_RATES.residentTaxRate),
  bizTaxLv1RatePct: fmtPct(DEFAULT_LOCAL_TAX_RATES.bizTaxLv1Rate),
  bizTaxLv2RatePct: fmtPct(DEFAULT_LOCAL_TAX_RATES.bizTaxLv2Rate),
  bizTaxLv3RatePct: fmtPct(DEFAULT_LOCAL_TAX_RATES.bizTaxLv3Rate),
  specialBizTaxRatePct: fmtPct(DEFAULT_LOCAL_TAX_RATES.specialBizTaxRate),
  kintowariYen: String(DEFAULT_LOCAL_TAX_RATES.kintowariManYen * 10000),
  midPaymentsYen: defaultMidPaymentsYen(),
  vatReceived: "0",
  vatPaid: "0",
  vatMid: "0",
};

const parseNum = (s: string | undefined | null): number =>
  parseFloat((s ?? "0").replace(/,/g, "")) || 0;
const fmtComma = (n: number): string =>
  Number.isFinite(n) ? Math.round(n).toLocaleString() : "0";

export function TaxForecastSection() {
  const pl = useMfPL();
  const bs = useMfBS();
  const lockedMonth = usePeriodStore((s) => s.month);
  const fiscalYear = usePeriodStore((s) => s.fiscalYear);
  const { fyStartMonth } = useFyElapsed();
  const { value: rawForm, setValue: setForm, isHydrated } = useFeatureStateLocal<FormState>(
    "year-end-review.tax-forecast",
    String(fiscalYear ?? ""),
    DEFAULT_FORM,
  );
  // DB復元データにフィールドが欠けている場合にデフォルト値で補完
  const form: FormState = useMemo(() => ({
    ...DEFAULT_FORM,
    ...rawForm,
    items: Array.isArray(rawForm?.items) ? rawForm.items : DEFAULT_ITEMS,
    midPaymentsYen: { ...defaultMidPaymentsYen(), ...rawForm?.midPaymentsYen },
  }), [rawForm]);

  // 旧 LocalStorage クリーンアップ (DB 化後不要)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("sevenboard:tax-forecast-input:")) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignore
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- MF実績からのプリセット */
  useEffect(() => {
    if (!isHydrated) return;
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

    const elapsed = getFyElapsedFromMonth(lockedMonth, fyStartMonth);
    const annualize = (v: number) => Math.round((v / elapsed) * 12);
    const annualizeManYen = (v: number) => Math.round(((v / elapsed) * 12) / 10000);

    const ord = findPl("経常利益") ?? 0;
    const cap = findBs("資本金") ?? 0;
    const vatRecv = findBs("仮受消費税") ?? 0;
    const vatPaid = findBs("仮払消費税") ?? 0;

    // 既に値が入っている (ユーザー編集 or プリセット済) 項目は上書きしない
    setForm((prev) => ({
      ...prev,
      pretaxProfit: ord ? String(annualizeManYen(ord)) : prev.pretaxProfit,
      capital: cap ? String(cap) : prev.capital,
      vatReceived:
        vatRecv && (prev.vatReceived === "" || prev.vatReceived === "0")
          ? String(annualize(vatRecv))
          : prev.vatReceived,
      vatPaid:
        vatPaid && (prev.vatPaid === "" || prev.vatPaid === "0")
          ? String(annualize(vatPaid))
          : prev.vatPaid,
    }));
  }, [isHydrated, pl.data, bs.data, lockedMonth, fyStartMonth]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const updateForm = (updater: (prev: FormState) => FormState) => {
    setForm((prev) => updater(prev));
  };

  const taxableIncome = useMemo(() => {
    const base = parseNum(form.pretaxProfit);
    const adj = form.items.reduce(
      (acc, it) => (it.kind === "add" ? acc + parseNum(it.amount) : acc - parseNum(it.amount)),
      0,
    );
    return base + adj;
  }, [form.pretaxProfit, form.items]);

  // 地方税率を form から組み立て (空欄や不正値は標準値にフォールバック)
  // 入力は「円」単位なので /10000 で内部の万円単位に揃える。
  const localRates: LocalTaxRates = useMemo(() => {
    const pct = (s: string, def: number) => {
      const n = parseFloat(s);
      return Number.isFinite(n) ? n / 100 : def;
    };
    return {
      residentTaxRate: pct(form.residentTaxRatePct, DEFAULT_LOCAL_TAX_RATES.residentTaxRate),
      bizTaxLv1Rate: pct(form.bizTaxLv1RatePct, DEFAULT_LOCAL_TAX_RATES.bizTaxLv1Rate),
      bizTaxLv2Rate: pct(form.bizTaxLv2RatePct, DEFAULT_LOCAL_TAX_RATES.bizTaxLv2Rate),
      bizTaxLv3Rate: pct(form.bizTaxLv3RatePct, DEFAULT_LOCAL_TAX_RATES.bizTaxLv3Rate),
      specialBizTaxRate: pct(form.specialBizTaxRatePct, DEFAULT_LOCAL_TAX_RATES.specialBizTaxRate),
      kintowariManYen: parseNum(form.kintowariYen) / 10000,
    };
  }, [form]);

  const capitalManYen = Math.max(100, parseNum(form.capital) / 10000);
  const isSmb = capitalManYen <= 10000;

  const corpTax = useMemo(
    () => calcCorpTax(taxableIncome, capitalManYen, localRates),
    [taxableIncome, capitalManYen, localRates],
  );

  const vatPayable = useMemo(() => {
    const recv = parseNum(form.vatReceived);
    const paid = parseNum(form.vatPaid);
    const mid = parseNum(form.vatMid);
    const annual = Math.max(0, recv - paid);
    return { annual, periodEnd: Math.max(0, annual - mid) };
  }, [form.vatReceived, form.vatPaid, form.vatMid]);

  // テーブル行データ組み立て (annual/mid/periodEnd は内部は万円、UI で formatYenFromManYen で「円」表示)
  const rows = useMemo(() => {
    const mk = (
      key: MidKey,
      label: string,
      baseLabel: string,
      line: TaxLineRow,
      opts?: { rateEditable?: boolean },
    ) => {
      const annual = line.tax;
      // ユーザー入力 (円) → 万円換算
      const midManYen = parseNum(form.midPaymentsYen[key]) / 10000;
      return {
        key,
        label,
        baseLabel,
        base: line.base,
        ratePct: line.rate * 100,
        annual,
        mid: midManYen,
        periodEnd: annual - midManYen,
        rateEditable: !!opts?.rateEditable,
      };
    };
    const kintowariMidManYen = parseNum(form.midPaymentsYen.kintowari) / 10000;
    const kintowariAnnualManYen = parseNum(form.kintowariYen) / 10000;
    const all = [
      // 国税 — 税率固定
      mk("corpLow", "法人税 (軽減)", "課税所得 800万円以下部分", corpTax.corporateTaxLow),
      mk(
        "corpHigh",
        isSmb ? "法人税 (本則)" : "法人税",
        isSmb ? "課税所得 800万円超部分" : "課税所得",
        corpTax.corporateTaxHigh,
      ),
      mk("localCorp", "地方法人税", "法人税合計", corpTax.localCorporateTax),
      mk("defense", "防衛特別法人税", "法人税合計 − 500万円", corpTax.defenseTax),
      // 地方税 — 税率編集可
      mk("resident", "法人住民税 法人税割", "法人税合計", corpTax.residentTaxOnIncome, {
        rateEditable: true,
      }),
      {
        key: "kintowari" as MidKey,
        label: "法人住民税 均等割",
        baseLabel: "—",
        base: null,
        ratePct: null,
        annual: kintowariAnnualManYen,
        mid: kintowariMidManYen,
        periodEnd: kintowariAnnualManYen - kintowariMidManYen,
        rateEditable: false,
        isKintowari: true,
      },
      mk("bizLv1", "法人事業税 (400万円以下)", "課税所得 400万円以下部分", corpTax.bizTaxLv1, {
        rateEditable: true,
      }),
      mk("bizLv2", "法人事業税 (400-800万円)", "課税所得 400-800万円部分", corpTax.bizTaxLv2, {
        rateEditable: true,
      }),
      mk(
        "bizLv3",
        isSmb ? "法人事業税 (800万円超)" : "法人事業税",
        isSmb ? "課税所得 800万円超部分" : "課税所得",
        corpTax.bizTaxLv3,
        { rateEditable: true },
      ),
      mk("specialBiz", "特別法人事業税", "法人事業税合計", corpTax.specialBizTax, {
        rateEditable: true,
      }),
    ];
    // 大法人 (中小特例非適用) では軽減段階を非表示にする
    if (!isSmb) {
      return all.filter((r) => !["corpLow", "bizLv1", "bizLv2"].includes(r.key));
    }
    return all;
  }, [corpTax, form.kintowariYen, form.midPaymentsYen, isSmb]);

  const totalAnnual = rows.reduce((acc, r) => acc + r.annual, 0);
  const totalMid = rows.reduce((acc, r) => acc + r.mid, 0);
  const totalPeriodEnd = totalAnnual - totalMid;

  const setMidYen = (key: MidKey, v: string) =>
    updateForm((p) => ({
      ...p,
      midPaymentsYen: { ...p.midPaymentsYen, [key]: v },
    }));

  const setRate = (rateKey: keyof FormState, v: string) =>
    updateForm((p) => ({ ...p, [rateKey]: v }));

  const resetRatesToStandard = () => {
    if (!confirm("地方税率と均等割をすべて東京都標準値に戻しますか？")) return;
    updateForm((p) => ({
      ...p,
      residentTaxRatePct: fmtPct(DEFAULT_LOCAL_TAX_RATES.residentTaxRate),
      bizTaxLv1RatePct: fmtPct(DEFAULT_LOCAL_TAX_RATES.bizTaxLv1Rate),
      bizTaxLv2RatePct: fmtPct(DEFAULT_LOCAL_TAX_RATES.bizTaxLv2Rate),
      bizTaxLv3RatePct: fmtPct(DEFAULT_LOCAL_TAX_RATES.bizTaxLv3Rate),
      specialBizTaxRatePct: fmtPct(DEFAULT_LOCAL_TAX_RATES.specialBizTaxRate),
      kintowariYen: String(DEFAULT_LOCAL_TAX_RATES.kintowariManYen * 10000),
    }));
  };

  const setItem = (id: string, amount: string) =>
    updateForm((p) => ({
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
                onChange={(v) => updateForm((p) => ({ ...p, pretaxProfit: v }))}
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
                onChange={(v) => updateForm((p) => ({ ...p, capital: v }))}
              />
              <p className="text-[10px] text-muted-foreground">
                ※ 資本金 1億円以下の場合に中小法人特例 (軽減税率 15% / 事業税3段階) を自動適用。
              </p>
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
                onChange={(v) => updateForm((p) => ({ ...p, vatReceived: v }))}
              />
              <YenField
                label="仮払消費税（年換算・円）"
                value={form.vatPaid}
                onChange={(v) => updateForm((p) => ({ ...p, vatPaid: v }))}
              />
              <YenField
                label="中間納付額（円）"
                value={form.vatMid}
                onChange={(v) => updateForm((p) => ({ ...p, vatMid: v }))}
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
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-xs font-bold text-[var(--color-primary)]">法人税等</span>
              <button
                type="button"
                onClick={resetRatesToStandard}
                className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-gray-50"
                title="地方税率と均等割を東京都標準値に戻す"
              >
                <RotateCcw className="h-3 w-3" /> 税率リセット
              </button>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-[10px] text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left">税目</th>
                  <th className="px-2 py-1.5 text-right">課税標準</th>
                  <th className="px-2 py-1.5 text-right">税率</th>
                  <th className="px-2 py-1.5 text-right">年税額</th>
                  <th className="px-2 py-1.5 text-right">中間納付</th>
                  <th className="px-2 py-1.5 text-right">期末納付</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const rateKey: keyof FormState | null = (() => {
                    switch (r.key) {
                      case "resident":
                        return "residentTaxRatePct";
                      case "bizLv1":
                        return "bizTaxLv1RatePct";
                      case "bizLv2":
                        return "bizTaxLv2RatePct";
                      case "bizLv3":
                        return "bizTaxLv3RatePct";
                      case "specialBiz":
                        return "specialBizTaxRatePct";
                      default:
                        return null;
                    }
                  })();
                  const isKintowari = "isKintowari" in r && r.isKintowari;
                  return (
                    <tr key={r.key} className={cn(i % 2 === 1 && "bg-gray-50/30")}>
                      <td className="px-2 py-1.5 text-[11px]">{r.label}</td>
                      <td className="px-2 py-1.5 text-right text-[11px] tabular-nums text-muted-foreground">
                        {r.base === null ? "—" : formatYenFromManYen(r.base)}
                        {r.baseLabel !== "—" && r.baseLabel && (
                          <div className="text-[9px] text-muted-foreground/70">
                            {r.baseLabel}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {r.ratePct === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : r.rateEditable && rateKey ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            value={form[rateKey] as string}
                            onChange={(e) => setRate(rateKey, e.target.value)}
                            className="w-14 rounded border px-1 py-0.5 text-right text-[11px] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                          />
                        ) : (
                          <span className="text-[11px]">{r.ratePct.toFixed(2)}</span>
                        )}
                        {r.ratePct !== null && (
                          <span className="ml-0.5 text-[10px] text-muted-foreground">%</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {isKintowari ? (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={fmtComma(parseNum(form.kintowariYen))}
                            onChange={(e) =>
                              updateForm((p) => ({
                                ...p,
                                kintowariYen: e.target.value.replace(/[^\d]/g, ""),
                              }))
                            }
                            className="w-24 rounded border px-1 py-0.5 text-right text-[11px] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                          />
                        ) : (
                          <span className="text-[11px]">{formatYenFromManYen(r.annual)}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={fmtComma(parseNum(form.midPaymentsYen[r.key]))}
                          onChange={(e) =>
                            setMidYen(r.key, e.target.value.replace(/[^\d]/g, ""))
                          }
                          className="w-24 rounded border px-1 py-0.5 text-right text-[11px] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                        />
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1.5 text-right text-[11px] tabular-nums",
                          r.periodEnd < 0 ? "text-emerald-700" : "text-rose-700",
                        )}
                      >
                        {formatYenFromManYen(r.periodEnd)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 bg-gray-100 font-bold">
                  <td className="px-2 py-2">合計</td>
                  <td className="px-2 py-2" />
                  <td className="px-2 py-2" />
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatYenFromManYen(totalAnnual)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatYenFromManYen(totalMid)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-rose-700">
                    {formatYenFromManYen(totalPeriodEnd)}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground">
              地方税率セル (法人税割 / 事業税3段 / 特別法人事業税) と均等割年税額・中間納付は編集できます。デフォルトは東京都標準 (中小法人)。
            </div>
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
              ¥{fmtComma(totalPeriodEnd * 10000 + vatPayable.periodEnd)}
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              法人税等 {formatYenFromManYen(totalPeriodEnd)} + 消費税 ¥{fmtComma(vatPayable.periodEnd)}
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
