"use client";

import { useEffect, useMemo, useState } from "react";
import { useMfPL } from "@/hooks/use-mf-data";
import { usePeriodStore } from "@/lib/period-store";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "sevenboard:next-fy-kpi-input";

const parseNum = (s: string): number => parseFloat(s.replace(/,/g, "")) || 0;
const fmtComma = (n: number): string =>
  Number.isFinite(n) ? Math.round(n).toLocaleString() : "0";

interface FormState {
  /** 来期目標売上(円) */
  targetRevenue: string;
  /** 目標粗利率 (% 例: 35.0) */
  targetGrossMargin: string;
  /** 目標販管費率 (%) */
  targetSgaRatio: string;
  /** 月次配分方式 */
  distributionMode: "previousYear" | "even";
}

const DEFAULT_FORM: FormState = {
  targetRevenue: "0",
  targetGrossMargin: "30",
  targetSgaRatio: "20",
  distributionMode: "previousYear",
};

export function NextFyKpiSection() {
  const pl = useMfPL();
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

  // 当期実績から来期目標のレンジ提示
  const currentRevenue = useMemo(() => {
    if (!pl.data) return 0;
    type Row = { name?: string; amount?: number; rows?: Row[] };
    const find = (rows: Row[] | undefined, key: string): Row | undefined => {
      if (!rows) return undefined;
      for (const r of rows) {
        if (r.name?.includes(key)) return r;
        const c = find(r.rows, key);
        if (c) return c;
      }
      return undefined;
    };
    const data = pl.data as { rows?: Row[] };
    const rev = find(data.rows, "売上高")?.amount ?? 0;
    const elapsed = lockedMonth ? Math.max(1, lockedMonth) : 12;
    return Math.round((rev / elapsed) * 12);
  }, [pl.data, lockedMonth]);

  const ranges = useMemo(() => {
    const r = currentRevenue;
    return {
      conservative: Math.round(r * 1.0),
      mid: Math.round(r * 1.1),
      aggressive: Math.round(r * 1.25),
    };
  }, [currentRevenue]);

  // hydrate target revenue from current actual once (only if unset)
  useEffect(() => {
    if (!hydrated) return;
    if (parseNum(form.targetRevenue) > 0) return;
    if (currentRevenue > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- MF実績からの初期プリセット
      setForm((p) => ({ ...p, targetRevenue: String(ranges.mid) }));
    }
  }, [hydrated, currentRevenue, ranges.mid, form.targetRevenue]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    } catch {
      // ignore
    }
  }, [form, hydrated]);

  const target = parseNum(form.targetRevenue);
  const gm = parseFloat(form.targetGrossMargin) / 100;
  const sga = parseFloat(form.targetSgaRatio) / 100;
  const grossProfit = target * gm;
  const sgaTotal = target * sga;
  const operatingProfit = grossProfit - sgaTotal;

  const monthlyDistribution = useMemo(() => {
    if (form.distributionMode === "even") {
      return Array.from({ length: 12 }, () => target / 12);
    }
    // previous year — 単純化のため均等配分（前期月次PLが取れたら本実装）
    return Array.from({ length: 12 }, () => target / 12);
  }, [form.distributionMode, target]);

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-white shadow-sm">
        <div className="border-b px-3 py-2 text-xs font-bold text-[var(--color-primary)]">
          来期売上レンジ（当期実績 {fmtComma(currentRevenue)}円ベース）
        </div>
        <div className="grid grid-cols-3 divide-x text-center">
          <RangeCard label="保守" amount={ranges.conservative} factor="±0%" onClick={() => setForm((p) => ({ ...p, targetRevenue: String(ranges.conservative) }))} />
          <RangeCard label="中位" amount={ranges.mid} factor="+10%" onClick={() => setForm((p) => ({ ...p, targetRevenue: String(ranges.mid) }))} active />
          <RangeCard label="挑戦" amount={ranges.aggressive} factor="+25%" onClick={() => setForm((p) => ({ ...p, targetRevenue: String(ranges.aggressive) }))} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[300px_1fr]">
        <div className="space-y-3">
          <div className="rounded-md border bg-white shadow-sm">
            <div className="border-b px-3 py-2 text-xs font-bold text-[var(--color-primary)]">
              目標入力
            </div>
            <div className="space-y-2 p-3">
              <YenField
                label="来期目標売上（円）"
                value={form.targetRevenue}
                onChange={(v) => setForm((p) => ({ ...p, targetRevenue: v }))}
              />
              <PercentField
                label="目標粗利率（%）"
                value={form.targetGrossMargin}
                onChange={(v) => setForm((p) => ({ ...p, targetGrossMargin: v }))}
              />
              <PercentField
                label="目標販管費率（%）"
                value={form.targetSgaRatio}
                onChange={(v) => setForm((p) => ({ ...p, targetSgaRatio: v }))}
              />
              <div>
                <label className="mb-0.5 block text-[11px] font-semibold text-muted-foreground">
                  月次配分方式
                </label>
                <select
                  value={form.distributionMode}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, distributionMode: e.target.value as FormState["distributionMode"] }))
                  }
                  className="w-full rounded border bg-white px-2 py-1.5 text-xs"
                >
                  <option value="previousYear">前年同月比配分（要前期月次データ）</option>
                  <option value="even">均等配分（1/12）</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <KpiCard label="来期売上" amount={target} />
            <KpiCard label="粗利" amount={grossProfit} sub={`${form.targetGrossMargin}%`} />
            <KpiCard label="営業利益" amount={operatingProfit} sub={`${(((operatingProfit / target) || 0) * 100).toFixed(1)}%`} accent />
          </div>

          <div className="rounded-md border bg-white shadow-sm">
            <div className="border-b px-3 py-2 text-xs font-bold text-[var(--color-primary)]">
              月次配分（円）
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead className="border-b text-[10px] text-muted-foreground">
                  <tr>
                    {Array.from({ length: 12 }, (_, i) => (
                      <th key={i} className="px-2 py-1.5 text-right">
                        {i + 1}月
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {monthlyDistribution.map((v, i) => (
                      <td key={i} className="px-2 py-1.5 text-right">
                        {fmtComma(v)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        ※ 月次配分の「前年同月比配分」は前期月次PLとの連携が必要なため次期実装予定。
        現状は均等配分のみ。保存先（budget table 連携）も次期実装。
      </p>
    </div>
  );
}

function RangeCard({
  label,
  amount,
  factor,
  active,
  onClick,
}: {
  label: string;
  amount: number;
  factor: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "p-3 text-center transition-colors hover:bg-muted/30",
        active && "bg-emerald-50/50",
      )}
    >
      <div className="text-[10px] font-semibold text-muted-foreground">{label}</div>
      <div className="text-base font-bold">¥{fmtComma(amount)}</div>
      <div className="text-[10px] text-muted-foreground">{factor}</div>
    </button>
  );
}

function KpiCard({
  label,
  amount,
  sub,
  accent,
}: {
  label: string;
  amount: number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={cn("rounded-md border-l-4 bg-white p-3 shadow-sm", accent ? "border-l-emerald-500" : "border-l-blue-500")}>
      <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
      <div className="text-base font-bold tabular-nums">¥{fmtComma(amount)}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
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

function PercentField({
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
        type="number"
        step={0.1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      />
    </div>
  );
}
