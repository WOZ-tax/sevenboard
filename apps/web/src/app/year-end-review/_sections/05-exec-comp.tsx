"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { useScopedOrgId } from "@/hooks/use-scoped-org-id";
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
  const orgId = useScopedOrgId();
  const lockedMonth = usePeriodStore((s) => s.month);
  const fiscalYear = usePeriodStore((s) => s.fiscalYear);
  const storageKey = storageKeyFor(orgId, fiscalYear);

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [hydrated, setHydrated] = useState(false);
  // 「ユーザーが実際に編集したか」を追跡。MFプリセットでは true にしない
  const userEditedRef = useRef(false);

  // orgId/fiscalYear が変わったら hydrate やり直し
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!orgId) return;
    userEditedRef.current = false;
    /* eslint-disable react-hooks/set-state-in-effect -- orgId/fy 切替時の状態リセット + localStorage 復元 */
    setHydrated(false);
    setForm(DEFAULT_FORM);
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setForm((prev) => ({ ...prev, ...parsed }));
        userEditedRef.current = true;
      }
    } catch {
      // ignore
    }
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [storageKey, orgId]);

  // MF実績からプリセット（ユーザーが編集していない場合のみ）
  useEffect(() => {
    if (!hydrated) return;
    if (userEditedRef.current) return;
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
    const execComp = findPl("役員報酬");
    const depreciation = findPl("減価償却費");

    if (revenue > 0) {
      const elapsed = lockedMonth ? Math.max(1, lockedMonth) : 12;
      const annualize = (v: number) => Math.round((v / elapsed) * 12);
      const annualRevenue = annualize(revenue);
      const annualOp = annualize(operatingProfit);
      const annualExecComp = annualize(execComp);
      // 経費(役員報酬除く) = 売上 − 営業利益 − 役員報酬
      const annualExpenses = Math.max(0, annualRevenue - annualOp - annualExecComp);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- MF実績からの初回プリセット
      setForm((prev) => ({
        ...prev,
        revenue: String(annualRevenue),
        expenses: String(annualExpenses),
        monthlyComp:
          execComp > 0 ? Math.round(annualExecComp / 12) : prev.monthlyComp,
        depreciation: String(annualize(depreciation)),
      }));
    }
  }, [hydrated, pl.data, lockedMonth]);

  // ユーザーが編集した時だけ localStorage 保存
  useEffect(() => {
    if (!hydrated) return;
    if (!userEditedRef.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(form));
    } catch {
      // ignore
    }
  }, [form, hydrated, storageKey]);

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

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    userEditedRef.current = true;
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  return (
    <div className="space-y-3">
      <RecommendedRangeCard
        revenueManYen={simInput.revenueManYen}
        expensesManYen={simInput.expensesManYen}
        currentMonthly={form.monthlyComp}
        onApply={(monthlyYen) => setField("monthlyComp", monthlyYen)}
        optimalReferenceManYen={optimal.monthlyComp}
      />

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
function RecommendedRangeCard({
  revenueManYen,
  expensesManYen,
  currentMonthly,
  onApply,
  optimalReferenceManYen,
}: {
  revenueManYen: number;
  expensesManYen: number;
  currentMonthly: number;
  onApply: (monthlyYen: number) => void;
  optimalReferenceManYen: number;
}) {
  // 利益(役員報酬付加前・万円)
  const profitBeforeComp = Math.max(0, revenueManYen - expensesManYen);
  const currentManYen = currentMonthly / 10000;
  // 現在の比率(年額/利益)
  const currentRatio = profitBeforeComp > 0 ? (currentManYen * 12) / profitBeforeComp : 0;

  const [ratio, setRatio] = useState(45);

  // ratio が外部入力で動いたら同期したいが、シンプルにユーザー操作のみで動かす
  // 3プリセット
  const conservative = Math.round((profitBeforeComp * 0.3) / 12);
  const balanced = Math.round((profitBeforeComp * 0.45) / 12);
  const aggressive = Math.round((profitBeforeComp * 0.6) / 12);
  const customMonthly = Math.round((profitBeforeComp * (ratio / 100)) / 12);

  return (
    <div className="rounded-md border bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">
          役員報酬の適正額（営業利益の何%を取るか）
        </span>
        <span className="text-[11px] text-muted-foreground">
          利益(役員報酬付加前): <span className="font-bold text-foreground">{formatYenFromManYen(profitBeforeComp)}</span>
          {" "}（年額）
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <RangeButton
          label="法人優先"
          ratioLabel="30%"
          sub="内部留保厚め / 再投資・運転資金確保"
          manYen={conservative}
          isCurrent={Math.abs(currentRatio - 0.3) < 0.02}
          onClick={() => {
            setRatio(30);
            onApply(conservative * 10000);
          }}
        />
        <RangeButton
          label="バランス"
          ratioLabel="45%"
          sub="標準的な配分"
          manYen={balanced}
          emphasis
          isCurrent={Math.abs(currentRatio - 0.45) < 0.02}
          onClick={() => {
            setRatio(45);
            onApply(balanced * 10000);
          }}
        />
        <RangeButton
          label="個人優先"
          ratioLabel="60%"
          sub="稼いだ実感 / 生活水準UP"
          manYen={aggressive}
          isCurrent={Math.abs(currentRatio - 0.6) < 0.02}
          onClick={() => {
            setRatio(60);
            onApply(aggressive * 10000);
          }}
        />
      </div>

      {/* 比率カスタムスライダー */}
      <div className="mt-3 rounded bg-muted/30 p-2">
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">比率を調整</span>
          <span className="font-bold text-[var(--color-primary)]">
            {ratio}% → 月額 {formatYenFromManYen(customMonthly)}（年額 {formatYenFromManYen(customMonthly * 12)}）
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={20}
            max={70}
            step={1}
            value={ratio}
            onChange={(e) => setRatio(parseInt(e.target.value, 10) || 0)}
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => onApply(customMonthly * 10000)}
            className="rounded bg-[var(--color-primary)] px-2 py-1 text-[11px] font-semibold text-white hover:opacity-90"
          >
            この比率で反映
          </button>
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        比率 = 役員報酬年額 ÷ 利益(役員報酬付加前 = 売上 − 経費)。
        個人側の上乗せレバーは <strong>小規模企業共済</strong>（年84万まで全額所得控除）と{" "}
        <strong>iDeCo</strong>（企業年金なしの場合 年27.6万まで）。詳細設定の
        「小規模企業共済掛金」欄に入れると当シミュに反映されます。
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground/80">
        参考: 税負担最小化のみで計算した最適点 = 月額 {formatYenFromManYen(optimalReferenceManYen)}
        {" "}（社保等級の境目で決まる構造的な値。実務では生活水準・CF・退職金との合算で判断）
      </p>
    </div>
  );
}

function RangeButton({
  label,
  ratioLabel,
  sub,
  manYen,
  emphasis,
  isCurrent,
  onClick,
}: {
  label: string;
  ratioLabel: string;
  sub: string;
  manYen: number;
  emphasis?: boolean;
  isCurrent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border p-2.5 text-left transition-colors hover:bg-muted/40",
        emphasis && "border-emerald-500/50 bg-emerald-50/40 hover:bg-emerald-50",
        isCurrent && "ring-2 ring-[var(--color-primary)]",
      )}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
        <span className="text-[11px] font-bold text-muted-foreground">{ratioLabel}</span>
      </div>
      <div
        className={cn(
          "mt-0.5 text-base font-bold tabular-nums",
          emphasis ? "text-emerald-700" : "text-[var(--color-text-primary)]",
        )}
      >
        月額 {formatYenFromManYen(manYen)}
      </div>
      <div className="text-[10px] leading-tight text-muted-foreground">{sub}</div>
    </button>
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
