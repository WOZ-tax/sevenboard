"use client";

import { useMemo, useState } from "react";
import { useMfPL } from "@/hooks/use-mf-data";
import { usePeriodStore } from "@/lib/period-store";
import { cn } from "@/lib/utils";

const fmtComma = (n: number): string =>
  Number.isFinite(n) ? Math.round(n).toLocaleString() : "0";

type Mode = "prev-month" | "recent-3" | "manual";

export function LandingPlSection() {
  const pl = useMfPL();
  const lockedMonth = usePeriodStore((s) => s.month);
  const [mode, setMode] = useState<Mode>("prev-month");
  const [sensitivity, setSensitivity] = useState<0 | 5 | 10 | -5 | -10>(0);

  const rows = useMemo(() => {
    if (!pl.data) return [];
    type PlRow = {
      name?: string;
      amount?: number;
      priorAmount?: number;
      indent?: number;
      isTotal?: boolean;
      rows?: PlRow[];
    };
    const data = pl.data as { rows?: PlRow[] };
    const flat: Array<{
      name: string;
      current: number;
      prior: number;
      indent: number;
      isTotal: boolean;
    }> = [];
    const walk = (list: PlRow[] | undefined, depth: number) => {
      if (!list) return;
      for (const r of list) {
        if (r.name) {
          flat.push({
            name: r.name,
            current: r.amount ?? 0,
            prior: r.priorAmount ?? 0,
            indent: r.indent ?? depth,
            isTotal: r.isTotal ?? false,
          });
        }
        if (r.rows) walk(r.rows, depth + 1);
      }
    };
    walk(data.rows, 0);
    return flat;
  }, [pl.data]);

  const elapsedMonths = lockedMonth ? Math.max(1, lockedMonth) : 12;

  const projected = useMemo(() => {
    return rows.map((r) => {
      let landingAmount: number;
      if (mode === "prev-month") {
        const remaining = 12 - elapsedMonths;
        const monthlyAvg = r.current / elapsedMonths;
        landingAmount = r.current + monthlyAvg * remaining;
      } else if (mode === "recent-3") {
        landingAmount = (r.current / elapsedMonths) * 12;
      } else {
        landingAmount = r.current;
      }
      const sensitivityFactor = 1 + sensitivity / 100;
      const adjusted = landingAmount * sensitivityFactor;
      return {
        ...r,
        landing: adjusted,
        delta: r.prior > 0 ? (adjusted - r.prior) / r.prior : 0,
      };
    });
  }, [rows, mode, elapsedMonths, sensitivity]);

  if (pl.isLoading) {
    return <div className="text-sm text-muted-foreground">読込中...</div>;
  }
  if (!pl.data) {
    return <div className="text-sm text-muted-foreground">MF会計データが取得できませんでした。</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">残月推計方式:</span>
        <ToggleGroup
          options={[
            { v: "prev-month", l: "前年同月比" },
            { v: "recent-3", l: "直近3ヶ月平均" },
            { v: "manual", l: "推計しない(YTD)" },
          ]}
          value={mode}
          onChange={(v) => setMode(v as Mode)}
        />
        <span className="ml-3 text-muted-foreground">感度:</span>
        <ToggleGroup
          options={[
            { v: "-10", l: "−10%" },
            { v: "-5", l: "−5%" },
            { v: "0", l: "±0%" },
            { v: "5", l: "+5%" },
            { v: "10", l: "+10%" },
          ]}
          value={String(sensitivity)}
          onChange={(v) => setSensitivity(parseInt(v, 10) as 0 | 5 | 10 | -5 | -10)}
        />
        <span className="ml-3 text-[11px] text-muted-foreground">
          経過 {elapsedMonths}ヶ月 / 残月 {12 - elapsedMonths}ヶ月
        </span>
      </div>

      <div className="overflow-hidden rounded-md border bg-white shadow-sm">
        <table className="w-full text-xs tabular-nums">
          <thead className="border-b bg-muted/40 text-[10px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">勘定科目</th>
              <th className="px-3 py-2 text-right">前期</th>
              <th className="px-3 py-2 text-right">当期(YTD)</th>
              <th className="px-3 py-2 text-right">着地予測</th>
              <th className="px-3 py-2 text-right">前期比</th>
            </tr>
          </thead>
          <tbody>
            {projected.map((r, i) => (
              <tr
                key={i}
                className={cn("border-b last:border-b-0", r.isTotal && "bg-muted/20 font-bold")}
              >
                <td className="px-3 py-1.5" style={{ paddingLeft: `${12 + r.indent * 12}px` }}>
                  {r.name}
                </td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">{fmtComma(r.prior)}</td>
                <td className="px-3 py-1.5 text-right">{fmtComma(r.current)}</td>
                <td className="px-3 py-1.5 text-right font-bold text-blue-700">{fmtComma(r.landing)}</td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right text-[10px]",
                    r.delta > 0 && "text-emerald-700",
                    r.delta < 0 && "text-rose-700",
                  )}
                >
                  {r.prior > 0 ? `${(r.delta * 100).toFixed(1)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        ※ 着地予測は MF会計の YTD 実績 × 残月推計式（選択方式）。
        感度トグルで売上 ±5/±10% の振れ幅を確認できます。
      </p>
    </div>
  );
}

function ToggleGroup({
  options,
  value,
  onChange,
}: {
  options: Array<{ v: string; l: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded border">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            "border-r px-2 py-1 text-[11px] last:border-r-0 transition-colors",
            value === o.v
              ? "bg-[var(--color-primary)] text-white"
              : "bg-white hover:bg-muted",
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
