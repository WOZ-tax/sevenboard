"use client";

import { useEffect, useMemo, useState } from "react";
import { useMfPL, useMfPLTransition } from "@/hooks/use-mf-data";
import { useFyElapsed } from "@/hooks/use-fy-elapsed";
import { getFyElapsedFromMonth, usePeriodStore } from "@/lib/period-store";
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
  const plTransition = useMfPLTransition();
  const lockedMonth = usePeriodStore((s) => s.month);
  const { fyStartMonth } = useFyElapsed();
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
    if (!Array.isArray(pl.data)) return 0;
    const row = pl.data.find(
      (r) =>
        r.category.includes("売上高") &&
        !r.category.includes("原価") &&
        !r.category.includes("総利益"),
    );
    const rev = row?.current ?? 0;
    const elapsed = getFyElapsedFromMonth(lockedMonth, fyStartMonth);
    return Math.round((rev / elapsed) * 12);
  }, [pl.data, lockedMonth, fyStartMonth]);

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

  /**
   * 当期の月次PL推移から「実績ある月の売上比率」を抽出し、来期目標を同じ季節パターンで配分。
   * 実績が無い月は実績月の平均値で補完して 12 ヶ月構成にする。
   * 当期データが全く無い場合は均等配分にフォールバック。
   */
  const monthlyDistribution = useMemo(() => {
    if (form.distributionMode === "even" || !plTransition.data) {
      return Array.from({ length: 12 }, () => target / 12);
    }
    const monthlyRevenue: number[] = Array(12).fill(0);
    let monthsWithData = 0;
    let totalActualRev = 0;
    for (const p of plTransition.data) {
      // 実績判定: revenue が 0 でない月を実績月とみなす
      if (!p.revenue || p.revenue === 0) continue;
      // p.month は "2025-04" 形式を想定 (PlTransitionPoint)。
      const parts = p.month.split("-");
      const mNum =
        parts.length >= 2
          ? parseInt(parts[1], 10)
          : parseInt(p.month.replace(/\D/g, ""), 10);
      if (!Number.isFinite(mNum) || mNum < 1 || mNum > 12) continue;
      monthlyRevenue[mNum - 1] = p.revenue;
      if (p.revenue !== 0) {
        totalActualRev += p.revenue;
        monthsWithData++;
      }
    }
    if (monthsWithData === 0 || totalActualRev <= 0) {
      return Array.from({ length: 12 }, () => target / 12);
    }
    // 実績ある月は実額、実績ない月は平均で補完
    const avgKnown = totalActualRev / monthsWithData;
    const filled = monthlyRevenue.map((v, i) =>
      monthlyRevenue[i] === 0 ? avgKnown : v,
    );
    const totalFilled = filled.reduce((a, b) => a + b, 0);
    if (totalFilled <= 0) {
      return Array.from({ length: 12 }, () => target / 12);
    }
    return filled.map((v) => (v / totalFilled) * target);
  }, [form.distributionMode, target, plTransition.data]);

  const hasTransitionData = useMemo(() => {
    return plTransition.data && plTransition.data.some((p) => p.revenue > 0);
  }, [plTransition.data]);

  /** 会計年度開始月から始まる 12 ヶ月表示 (5月決算なら 6月→翌5月の順) */
  const fyOrderedMonths = useMemo(() => {
    const start = fyStartMonth ?? 1;
    return Array.from({ length: 12 }, (_, i) => {
      const monthNumber = ((start - 1 + i) % 12) + 1;
      return {
        monthNumber,
        label: `${monthNumber}月`,
        value: monthlyDistribution[monthNumber - 1] ?? 0,
      };
    });
  }, [monthlyDistribution, fyStartMonth]);

  return (
    <div className="space-y-3">
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

      <div className="grid gap-3 md:grid-cols-[300px_1fr]">
        <div className="space-y-3">
          <div className="rounded-md border bg-white shadow-sm">
            <div className="border-b px-3 py-2 text-xs font-bold text-[var(--color-primary)]">
              目標入力
            </div>
            <div className="space-y-1.5 p-2.5">
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
                  <option value="previousYear">
                    当期月次パターン配分{!hasTransitionData ? " (推移データなし → 均等)" : ""}
                  </option>
                  <option value="even">均等配分（1/12）</option>
                </select>
                {form.distributionMode === "previousYear" && hasTransitionData && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    当期の月次売上実績パターンを来期に投影。実績がない月は実績月の平均で補完。
                  </p>
                )}
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
              月次配分（円） — 会計年度開始月から
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead className="border-b text-[10px] text-muted-foreground">
                  <tr>
                    {fyOrderedMonths.map((m) => (
                      <th key={m.monthNumber} className="px-2 py-1.5 text-right">
                        {m.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {fyOrderedMonths.map((m) => (
                      <td key={m.monthNumber} className="px-2 py-1.5 text-right">
                        {fmtComma(m.value)}
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
        ※ 月次配分は当期の月次売上推移からの季節パターン投影。前期実績ベースの配分や
        正式な予算 DB への保存（budget table 連携）は次期実装予定。
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
