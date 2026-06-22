"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useMfAccountTransition,
  useMfOffice,
  useMfPL,
} from "@/hooks/use-mf-data";
import { useFyElapsed } from "@/hooks/use-fy-elapsed";
import { getFyElapsedFromMonth, usePeriodStore } from "@/lib/period-store";
import { useFeatureStateLocal } from "@/hooks/use-year-end-state";
import {
  findOptimalMonthlyComp,
  formatYenFromManYen,
  simulate,
  type SimulationInput,
  type SimulationResult,
} from "@/lib/payroll-tax-calc";
import type { ExecAgeBracket } from "@/lib/tax-rates-2026";
import { cn } from "@/lib/utils";

// :v2 = 旧バージョンの空フォーム自動保存バグの localStorage を無効化
// orgId をキーに含めて顧問先ごとにスコープする（マルチテナント漏洩防止）
const STORAGE_BASE = "sevenboard:exec-comp-input:v2";
const storageKeyFor = (orgId: string, fy: number | undefined) =>
  `${STORAGE_BASE}:${orgId || "_"}:${fy ?? "_"}`;

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
  depreciation: "0",
  loanRepayment: "0",
  smallBizKyosai: "0",
};

const parseYen = (s: string | undefined | null): number =>
  parseFloat((s ?? "0").replace(/,/g, "")) || 0;
const fmtComma = (n: number): string =>
  Number.isFinite(n) ? Math.round(n).toLocaleString() : "0";

export function ExecCompSimulatorSection() {
  const office = useMfOffice();
  const pl = useMfPL();
  const lockedMonth = usePeriodStore((s) => s.month);
  const fiscalYear = usePeriodStore((s) => s.fiscalYear);
  const { fyStartMonth } = useFyElapsed();
  // PL Statement では役員報酬・減価償却費は販管費に集約されているため、
  // それぞれ個別に transition PL から再帰検索する。
  const execCompTransition = useMfAccountTransition("役員報酬", fiscalYear);
  const depreciationTransition = useMfAccountTransition("減価償却費", fiscalYear);

  const { value: form, setValue: setForm } = useFeatureStateLocal<FormState>(
    "year-end-review.exec-comp",
    String(fiscalYear ?? ""),
    DEFAULT_FORM,
  );

  // 旧 LocalStorage クリーンアップ (DB 化後不要)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("sevenboard:exec-comp-input:")) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignore
    }
  }, []);

  // MF実績からプリセット (空欄項目だけ補完)
  /* eslint-disable react-hooks/set-state-in-effect -- MFデータからのプリセット */
  useEffect(() => {
    if (!Array.isArray(pl.data)) return;

    const findPl = (key: string, exclude?: string[]): number => {
      const row = pl.data!.find(
        (r) =>
          r.category.includes(key) &&
          (!exclude || !exclude.some((e) => r.category.includes(e))),
      );
      return row?.current ?? 0;
    };
    const revenue = findPl("売上高", ["原価", "総利益"]);
    const operatingProfit = findPl("営業利益");
    // 役員報酬・減価償却費は PL Statement の集約レベルには無いので transition から累計
    const sumTransition = (
      data: { month: string; amount: number }[] | undefined,
    ): number =>
      (data ?? []).reduce(
        (acc, r) => acc + (Number.isFinite(r.amount) ? r.amount : 0),
        0,
      );
    const execComp = sumTransition(execCompTransition.data);
    const depreciation = sumTransition(depreciationTransition.data);

    if (revenue > 0) {
      const elapsed = getFyElapsedFromMonth(lockedMonth, fyStartMonth);
      const annualize = (v: number) => Math.round((v / elapsed) * 12);
      const annualRevenue = annualize(revenue);
      const annualOp = annualize(operatingProfit);
      const annualExecComp = annualize(execComp);
      const annualExpenses = Math.max(0, annualRevenue - annualOp - annualExecComp);
      // 既に入力済 (デフォルト値と異なる) なら上書きしない
      setForm((prev) => ({
        ...prev,
        revenue: prev.revenue === DEFAULT_FORM.revenue ? String(annualRevenue) : prev.revenue,
        expenses: prev.expenses === DEFAULT_FORM.expenses ? String(annualExpenses) : prev.expenses,
        monthlyComp:
          execComp > 0 && prev.monthlyComp === DEFAULT_FORM.monthlyComp
            ? Math.round(annualExecComp / 12)
            : prev.monthlyComp,
        depreciation:
          prev.depreciation === DEFAULT_FORM.depreciation
            ? String(annualize(depreciation))
            : prev.depreciation,
      }));
    }
  }, [
    pl.data,
    execCompTransition.data,
    depreciationTransition.data,
    lockedMonth,
    fyStartMonth,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 旧 localStorage 保存は useFeatureStateLocal が代替

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
      depreciationManYen: parseYen(form.depreciation) / 10000,
      loanRepaymentManYen: parseYen(form.loanRepayment) / 10000,
      smallBizKyosaiManYen: parseYen(form.smallBizKyosai) / 10000,
    }),
    [form],
  );

  const result = useMemo(() => simulate(simInput), [simInput]);
  const optimal = useMemo(() => findOptimalMonthlyComp(simInput), [simInput]);

  // 増減シナリオの幅 (%)。10 / 20 / 30 から選択可。デフォルト 20。
  const [scenarioPct, setScenarioPct] = useState<10 | 20 | 30>(20);

  const scenarios = useMemo(() => {
    const current = simInput.monthlyCompManYen;
    const decrease = Math.max(0, Math.round(current * (1 - scenarioPct / 100)));
    const increase = Math.round(current * (1 + scenarioPct / 100));
    return {
      decrease: {
        label: `−${scenarioPct}%`,
        monthlyComp: decrease,
        result: simulate({ ...simInput, monthlyCompManYen: decrease }),
      },
      current: {
        label: "現状維持",
        monthlyComp: current,
        result,
      },
      increase: {
        label: `+${scenarioPct}%`,
        monthlyComp: increase,
        result: simulate({ ...simInput, monthlyCompManYen: increase }),
      },
    };
  }, [simInput, scenarioPct, result]);

  void office;

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
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
              <YenField label="減価償却/年" value={form.depreciation} onChange={(v) => setField("depreciation", v)} />
              <YenField label="借入返済/年" value={form.loanRepayment} onChange={(v) => setField("loanRepayment", v)} />
            </div>
          </SimCard>
        </div>

        <div className="space-y-3">
          <ResultCards r={result} />

          <SimCard title="増減シナリオ比較" pad>
            <div className="space-y-3">
              {/* 増減幅の選択 */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">増減幅:</span>
                {([10, 20, 30] as const).map((pct) => {
                  const selected = scenarioPct === pct;
                  return (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setScenarioPct(pct)}
                      className={cn(
                        "rounded-full border px-3 py-1 font-medium transition-colors",
                        selected
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                          : "border-input text-muted-foreground hover:bg-muted/50",
                      )}
                    >
                      ±{pct}%
                    </button>
                  );
                })}
                <span className="ml-auto text-muted-foreground">
                  最適水準: 月 {optimal.monthlyComp} 万 (参考)
                </span>
              </div>

              {/* 3 シナリオカード横並び */}
              <div className="grid gap-3 md:grid-cols-3">
                <ScenarioCard scenario={scenarios.decrease} tone="decrease" />
                <ScenarioCard scenario={scenarios.current} tone="current" />
                <ScenarioCard scenario={scenarios.increase} tone="increase" />
              </div>
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

/**
 * 役員報酬の増減シナリオを 1 カードで表示。
 * 月額・年額 / 合計手残り (大) / 法人手取り + 個人手取り の構成。
 * tone="current" は現状維持カードで、青枠でハイライト。
 */
function ScenarioCard({
  scenario,
  tone,
}: {
  scenario: {
    label: string;
    monthlyComp: number;
    result: SimulationResult;
  };
  tone: "decrease" | "current" | "increase";
}) {
  const { label, monthlyComp, result: r } = scenario;
  const annualComp = monthlyComp * 12;

  const toneClass =
    tone === "current"
      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5 ring-1 ring-[var(--color-primary)]/30"
      : "border-input bg-muted/10";
  const labelClass =
    tone === "current"
      ? "text-[var(--color-primary)]"
      : tone === "decrease"
        ? "text-amber-600"
        : "text-emerald-600";

  return (
    <div className={cn("rounded-md border p-3", toneClass)}>
      <div className="flex items-baseline justify-between">
        <span className={cn("text-xs font-bold", labelClass)}>{label}</span>
        <span className="text-[10px] text-muted-foreground">
          月額 {monthlyComp} 万 / 年 {annualComp} 万
        </span>
      </div>

      <div className="mt-3 border-t pt-2">
        <div className="text-[10px] text-muted-foreground">合計手残り</div>
        <div className="mt-0.5 text-2xl font-bold tabular-nums text-[var(--color-text-primary)]">
          {formatYenFromManYen(r.totalNet)}
        </div>
      </div>

      <div className="mt-2 space-y-1 text-[11px]">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">法人手取り</span>
          <span className="font-medium tabular-nums">
            {formatYenFromManYen(r.corpNetProfit)}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">個人手取り</span>
          <span className="font-medium tabular-nums">
            {formatYenFromManYen(r.personalNet)}
          </span>
        </div>
      </div>
    </div>
  );
}

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

/**
 * 適正な役員報酬は「税最小化」では決まらない。
 * 「利益(役員報酬付加前) の何% を取るか」という比率思考で提示する。
 *
 * - 法人優先 (30%): 内部留保厚め / 再投資・運転資金確保
 * - バランス (45%): 標準的な配分
 * - 個人優先 (60%): 稼いだ実感を取りに行く / 生活水準UP
 *
 * 個人側の上乗せレバーは 小規模企業共済 + iDeCo のみ推奨（脱税スレスレ系は載せない）。
 * 税最小化の参考値は小さく併記するに留める。
 */
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
          { label: "法人税 (軽減15%)", value: formatYenFromManYen(r.corpTax.corporateTaxLow.tax) },
          { label: "法人税 (本則23.2%)", value: formatYenFromManYen(r.corpTax.corporateTaxHigh.tax) },
          { label: "地方法人税", value: formatYenFromManYen(r.corpTax.localCorporateTax.tax) },
          { label: "防衛特別法人税", value: formatYenFromManYen(r.corpTax.defenseTax.tax) },
          { label: "法人住民税 法人税割", value: formatYenFromManYen(r.corpTax.residentTaxOnIncome.tax) },
          { label: "法人住民税 均等割", value: formatYenFromManYen(r.corpTax.kintowariManYen) },
          { label: "法人事業税", value: formatYenFromManYen(r.corpTax.bizTaxTotal) },
          { label: "特別法人事業税", value: formatYenFromManYen(r.corpTax.specialBizTax.tax) },
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
