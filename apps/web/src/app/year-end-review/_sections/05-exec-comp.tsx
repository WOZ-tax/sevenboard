"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useIsClient } from "@/hooks/use-is-client";
import { useMfPL, useMfOffice } from "@/hooks/use-mf-data";
import { usePeriodStore } from "@/lib/period-store";
import {
  findOptimalMonthlyComp,
  formatYenFromManYen,
  simulate,
  type SimulationInput,
  type SimulationResult,
} from "@/lib/payroll-tax-calc";
import type { ExecAgeBracket } from "@/lib/tax-rates-2026";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "sevenboard:exec-comp-input";

interface FormState {
  revenue: string;
  expenses: string;
  monthlyComp: number;
  age: ExecAgeBracket;
  dependents: number;
  spouseAnnual: string;
  spouseAge: "general" | "elderly";
  otherDeduction: string;
  capital: string;
  employees: string;
  depreciation: string;
  loanRepayment: string;
  smallBizKyosai: string;
}

const DEFAULT_FORM: FormState = {
  revenue: "50000000",
  expenses: "20000000",
  monthlyComp: 1_000_000,
  age: "40to64",
  dependents: 0,
  spouseAnnual: "0",
  spouseAge: "general",
  otherDeduction: "0",
  capital: "1000000",
  employees: "5",
  depreciation: "0",
  loanRepayment: "0",
  smallBizKyosai: "0",
};

const parseYen = (s: string): number => parseFloat(s.replace(/,/g, "")) || 0;
const fmtComma = (n: number): string =>
  Number.isFinite(n) ? Math.round(n).toLocaleString() : "0";

export function ExecCompSimulatorSection() {
  const isClient = useIsClient();
  const office = useMfOffice();
  const pl = useMfPL();
  const lockedMonth = usePeriodStore((s) => s.month);

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 復元（client only）
        setForm((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore
    }
     
    setHydrated(true);
  }, []);

  // MF実績からプリセット（hydratedしてユーザー入力が無い場合のみ）
  useEffect(() => {
    if (!hydrated) return;
    if (!pl.data) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY)) return;

    type PlRow = { name?: string; amount?: number; rows?: PlRow[] };
    const findRow = (rows: PlRow[] | undefined, key: string): PlRow | undefined => {
      if (!rows) return undefined;
      for (const r of rows) {
        if (r.name?.includes(key)) return r;
        const child = findRow(r.rows, key);
        if (child) return child;
      }
      return undefined;
    };
    const data = pl.data as { rows?: PlRow[] };
    const rows = data.rows;
    const revenue = findRow(rows, "売上高")?.amount ?? 0;
    const sga = findRow(rows, "販売費及び一般管理費")?.amount ?? 0;
    const execComp = findRow(rows, "役員報酬")?.amount ?? 0;
    const depreciation = findRow(rows, "減価償却費")?.amount ?? 0;
    if (revenue > 0) {
      const elapsed = lockedMonth ? Math.max(1, lockedMonth) : 12;
      const annualize = (v: number) => Math.round((v / elapsed) * 12);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- MF実績からの初回プリセット
      setForm((prev) => ({
        ...prev,
        revenue: String(annualize(revenue)),
        expenses: String(Math.max(0, annualize(sga) - annualize(execComp))),
        monthlyComp:
          execComp > 0 ? Math.round(annualize(execComp) / 12) : prev.monthlyComp,
        depreciation: String(annualize(depreciation)),
      }));
    }
  }, [hydrated, pl.data, lockedMonth]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    } catch {
      // ignore
    }
  }, [form, hydrated]);

  const simInput: SimulationInput = useMemo(
    () => ({
      revenueManYen: parseYen(form.revenue) / 10000,
      expensesManYen: parseYen(form.expenses) / 10000,
      monthlyCompManYen: form.monthlyComp / 10000,
      age: form.age,
      dependents: form.dependents,
      spouseAnnualManYen: parseYen(form.spouseAnnual) / 10000,
      spouseAge: form.spouseAge,
      otherDeductionManYen: parseYen(form.otherDeduction) / 10000,
      capitalManYen: Math.max(100, parseYen(form.capital) / 10000),
      employees: parseInt(form.employees, 10) || 0,
      depreciationManYen: parseYen(form.depreciation) / 10000,
      loanRepaymentManYen: parseYen(form.loanRepayment) / 10000,
      smallBizKyosaiManYen: parseYen(form.smallBizKyosai) / 10000,
    }),
    [form],
  );

  const result = useMemo(() => simulate(simInput), [simInput]);
  const optimal = useMemo(() => findOptimalMonthlyComp(simInput), [simInput]);

  const chartData = useMemo(() => {
    const data: Array<{ comp: number; total: number; corp: number; personal: number }> = [];
    const max = Math.min(
      500,
      Math.max(0, Math.ceil((simInput.revenueManYen - simInput.expensesManYen) / 12)),
    );
    const step = Math.max(5, Math.ceil(max / 30));
    for (let m = 0; m <= max; m += step) {
      const r = simulate({ ...simInput, monthlyCompManYen: m });
      data.push({ comp: m, total: r.totalNet, corp: r.corpNetProfit, personal: r.personalNet });
    }
    return data;
  }, [simInput]);

  void office;

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="space-y-4">
      <OptimalBanner
        currentMonthly={form.monthlyComp}
        optimalManYen={optimal.monthlyComp}
        optimalTotalNet={optimal.totalNet}
        currentTotalNet={result.totalNet}
        corpDeficit={result.corpTaxableIncome < 0 ? result.corpTaxableIncome : null}
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          <SimCard title="基本情報">
            <YenField label="年間売上（円）" value={form.revenue} onChange={(v) => setField("revenue", v)} />
            <YenField label="年間経費（役員報酬除く・円）" value={form.expenses} onChange={(v) => setField("expenses", v)} />
            <SliderField
              label="役員報酬（月額）"
              value={form.monthlyComp}
              onChange={(v) => setField("monthlyComp", v)}
              max={3_000_000}
              step={10_000}
            />
          </SimCard>

          <SimCard title="詳細">
            <div className="grid grid-cols-2 gap-x-2">
              <SelectField
                label="役員年齢"
                value={form.age}
                onChange={(v) => setField("age", v as ExecAgeBracket)}
                options={[
                  { v: "under40", l: "40歳未満" },
                  { v: "40to64", l: "40〜64歳" },
                  { v: "65to69", l: "65〜69歳" },
                  { v: "over70", l: "70歳以上" },
                ]}
              />
              <NumField label="扶養人数" value={form.dependents} onChange={(v) => setField("dependents", v)} max={10} />
              <YenField label="配偶者年収" value={form.spouseAnnual} onChange={(v) => setField("spouseAnnual", v)} />
              <SelectField
                label="配偶者年齢"
                value={form.spouseAge}
                onChange={(v) => setField("spouseAge", v as "general" | "elderly")}
                options={[
                  { v: "general", l: "70歳未満" },
                  { v: "elderly", l: "70歳以上" },
                ]}
              />
              <YenField label="他の所得控除" value={form.otherDeduction} onChange={(v) => setField("otherDeduction", v)} />
              <YenField label="小規模企業共済掛金" value={form.smallBizKyosai} onChange={(v) => setField("smallBizKyosai", v)} />
              <YenField label="資本金" value={form.capital} onChange={(v) => setField("capital", v)} />
              <NumField label="従業員数" value={parseInt(form.employees, 10) || 0} onChange={(v) => setField("employees", String(v))} max={9999} />
              <YenField label="減価償却/年" value={form.depreciation} onChange={(v) => setField("depreciation", v)} />
              <YenField label="借入返済/年" value={form.loanRepayment} onChange={(v) => setField("loanRepayment", v)} />
            </div>
          </SimCard>
        </div>

        <div className="space-y-3">
          <ResultCards r={result} />

          <SimCard title="報酬月額別シミュレーション" pad={false}>
            <div className="h-72 w-full p-3">
              {isClient && (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="comp"
                      tickFormatter={(v) => (v >= 100 ? `${Math.round(v / 100) / 10}百万` : `${v}万`)}
                      stroke="#64748b"
                      fontSize={11}
                    />
                    <YAxis
                      tickFormatter={(v) =>
                        v >= 1000 ? `${Math.round(v / 1000) / 10}千万` : `${v}万`
                      }
                      stroke="#64748b"
                      fontSize={11}
                    />
                    <Tooltip
                      formatter={(v) => formatYenFromManYen(typeof v === "number" ? v : 0)}
                      labelFormatter={(v) => `月額${v}万円`}
                      contentStyle={{ fontSize: "12px" }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <ReferenceLine
                      x={optimal.monthlyComp}
                      stroke="#059669"
                      strokeDasharray="3 3"
                      label={{ value: "最適", fontSize: 10, fill: "#059669" }}
                    />
                    <Line dataKey="total" name="トータル手残り" stroke="#059669" strokeWidth={2} dot={false} />
                    <Line dataKey="corp" name="法人税引後" stroke="#2563eb" strokeWidth={1.5} dot={false} />
                    <Line dataKey="personal" name="個人手取り" stroke="#7c3aed" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </SimCard>

          <DetailTables r={result} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        ※ 令和8年度（2026年度）税制改正大綱・協会けんぽ東京都料率に基づく概算。
        実際の税額は個別の状況により異なります。MF実績からのプリセットは初回のみ反映されます。
      </p>
    </div>
  );
}

// ---------- Sub Components ----------

function SimCard({ title, children, pad = true }: { title: string; children: React.ReactNode; pad?: boolean }) {
  return (
    <div className="rounded-md border bg-white shadow-sm">
      <div className="border-b px-3 py-2 text-xs font-bold text-[var(--color-primary)]">{title}</div>
      <div className={pad ? "p-3" : ""}>{children}</div>
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
    <div className="mb-2">
      <label className="mb-0.5 block text-[11px] font-semibold text-muted-foreground">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        value={fmtComma(parseYen(value))}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        className="w-full rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      />
    </div>
  );
}

function NumField({ label, value, onChange, max = 999 }: { label: string; value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <div className="mb-2">
      <label className="mb-0.5 block text-[11px] font-semibold text-muted-foreground">{label}</label>
      <input
        type="number"
        value={value}
        min={0}
        max={max}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        className="w-full rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ v: string; l: string }>;
}) {
  return (
    <div className="mb-2">
      <label className="mb-0.5 block text-[11px] font-semibold text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </div>
  );
}

function SliderField({
  label,
  value,
  onChange,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max: number;
  step: number;
}) {
  return (
    <div className="rounded bg-muted/50 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
        <span className="text-sm font-bold text-[var(--color-primary)]">
          {fmtComma(value)}
          <span className="ml-0.5 text-[10px] font-normal">円/月</span>
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        className="w-full"
      />
      <input
        type="text"
        inputMode="numeric"
        value={fmtComma(value)}
        onChange={(e) => onChange(parseInt(e.target.value.replace(/[^\d]/g, ""), 10) || 0)}
        className="mt-1.5 w-full rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      />
    </div>
  );
}

function OptimalBanner({
  currentMonthly,
  optimalManYen,
  optimalTotalNet,
  currentTotalNet,
  corpDeficit,
}: {
  currentMonthly: number;
  optimalManYen: number;
  optimalTotalNet: number;
  currentTotalNet: number;
  corpDeficit: number | null;
}) {
  const diff = currentTotalNet - optimalTotalNet;
  const isOptimal = Math.abs(diff) < 1;
  return (
    <div className="rounded-md border-l-4 border-l-emerald-500 bg-white p-3 shadow-sm">
      <div className="text-sm">
        <span className="font-medium">最適報酬: </span>
        <span className="font-bold text-emerald-700">月額 {formatYenFromManYen(optimalManYen)}</span>
        <span className="ml-2 text-xs text-muted-foreground">（年額 {formatYenFromManYen(optimalManYen * 12)}）</span>
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        最適時の手残り: <span className="font-bold text-emerald-700">{formatYenFromManYen(optimalTotalNet)}</span>
        {isOptimal ? (
          <span className="ml-2 text-emerald-700">✓ 現在最適</span>
        ) : (
          <span className="ml-2">
            現在(月{fmtComma(currentMonthly)}円)との差{" "}
            <span className="font-bold text-emerald-700">+{formatYenFromManYen(Math.abs(diff))}</span>
          </span>
        )}
        {corpDeficit !== null && (
          <span className="ml-2 text-rose-600">※法人赤字 {formatYenFromManYen(corpDeficit)}</span>
        )}
      </div>
    </div>
  );
}

function ResultCards({ r }: { r: SimulationResult }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <ResultCard
        label="法人 税引後利益"
        value={formatYenFromManYen(r.corpNetProfit)}
        sub={`実効税率 ${r.corpTaxableIncome > 0 ? ((r.corpTax.total / r.corpTaxableIncome) * 100).toFixed(1) : "0"}%`}
        accent="border-l-blue-500"
      />
      <ResultCard
        label="個人 手取り"
        value={formatYenFromManYen(r.personalNet)}
        sub={`報酬${formatYenFromManYen(r.annualComp)} − 税社保${formatYenFromManYen(r.personalTotalTax)}`}
        accent="border-l-violet-500"
      />
      <ResultCard
        label="トータル手残り"
        value={formatYenFromManYen(r.totalNet)}
        sub={`税負担率 ${r.taxRate.toFixed(1)}%`}
        accent="border-l-emerald-500"
        emphasis
      />
      <ResultCard
        label="法人キャッシュフロー"
        value={formatYenFromManYen(r.corpCashflow)}
        sub="税引後利益 + 減価償却 - 借入返済"
        accent="border-l-emerald-700"
      />
    </div>
  );
}

function ResultCard({
  label,
  value,
  sub,
  accent,
  emphasis,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border-l-4 bg-white p-3 shadow-sm",
        accent,
        emphasis && "bg-emerald-50",
      )}
    >
      <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-bold text-[var(--color-text-primary)]">{value}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function DetailTables({ r }: { r: SimulationResult }) {
  return (
    <div className="grid gap-2 lg:grid-cols-3">
      <DetailTable
        title="法人側"
        rows={[
          { label: "課税所得", value: formatYenFromManYen(r.corpTaxableIncome), bold: true },
          { label: "法人税", value: formatYenFromManYen(r.corpTax.corporateTax) },
          { label: "防衛特別法人税", value: formatYenFromManYen(r.corpTax.defenseTax) },
          { label: "法人住民税", value: formatYenFromManYen(r.corpTax.residentTax) },
          { label: "法人事業税", value: formatYenFromManYen(r.corpTax.bizTax) },
          { label: "特別法人事業税", value: formatYenFromManYen(r.corpTax.specialBizTax) },
          { label: "法人税等 合計", value: formatYenFromManYen(r.corpTax.total), bold: true, sep: true },
          { label: "税引後利益", value: formatYenFromManYen(r.corpNetProfit), bold: true },
        ]}
      />
      <DetailTable
        title="個人側"
        rows={[
          { label: "役員報酬(年)", value: formatYenFromManYen(r.annualComp) },
          { label: "給与所得控除", value: `−${formatYenFromManYen(r.salaryDed)}` },
          { label: "給与所得", value: formatYenFromManYen(r.salaryIncome) },
          { label: "基礎控除", value: `−${formatYenFromManYen(r.basicDed)}` },
          { label: "配偶者控除", value: `−${formatYenFromManYen(r.spouseDed)}` },
          { label: "扶養控除", value: `−${formatYenFromManYen(r.dependentDed)}` },
          { label: "社保控除", value: `−${formatYenFromManYen(r.si.totalPersonal)}` },
          { label: "課税所得", value: formatYenFromManYen(r.personalTaxableIncome), bold: true, sep: true },
          { label: "所得税", value: formatYenFromManYen(r.it) },
          { label: "復興特別所得税", value: formatYenFromManYen(r.rt) },
          { label: "住民税", value: formatYenFromManYen(r.re) },
          { label: "税・社保合計", value: formatYenFromManYen(r.personalTotalTax), bold: true, sep: true },
          { label: "手取り", value: formatYenFromManYen(r.personalNet), bold: true },
        ]}
      />
      <DetailTable
        title="社会保険料"
        rows={[
          { label: "標準報酬月額", value: `${r.si.standardComp.toFixed(0)}万円` },
          { label: "会社負担 健康", value: formatYenFromManYen(r.si.healthCorp) },
          { label: "会社負担 介護", value: formatYenFromManYen(r.si.careCorp) },
          { label: "会社負担 厚生年金", value: formatYenFromManYen(r.si.pensionCorp) },
          { label: "会社負担 子拠出", value: formatYenFromManYen(r.si.childCorp) },
          { label: "会社負担 子支援", value: formatYenFromManYen(r.si.childcareCorp) },
          { label: "会社負担 小計", value: formatYenFromManYen(r.si.totalCorp), bold: true, sep: true },
          { label: "個人負担 合計", value: formatYenFromManYen(r.si.totalPersonal), bold: true },
          { label: "労使合計", value: formatYenFromManYen(r.si.totalAll), bold: true, sep: true },
        ]}
      />
    </div>
  );
}

function DetailTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string; bold?: boolean; sep?: boolean }>;
}) {
  return (
    <div className="rounded-md border bg-white shadow-sm">
      <div className="border-b px-3 py-2 text-xs font-bold text-[var(--color-primary)]">{title}</div>
      <table className="w-full text-xs">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={cn(r.sep && "border-t", r.bold && "font-semibold")}>
              <td className="px-3 py-1 text-muted-foreground">{r.label}</td>
              <td className="px-3 py-1 text-right tabular-nums">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
