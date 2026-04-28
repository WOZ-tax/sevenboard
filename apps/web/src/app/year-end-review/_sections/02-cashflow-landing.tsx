"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useMfCashflow } from "@/hooks/use-mf-data";
import { formatYen } from "@/lib/format";
import { cn } from "@/lib/utils";

export function CashflowLandingSection() {
  const cf = useMfCashflow();

  const summary = useMemo(() => {
    if (!cf.data) return null;
    type CfData = {
      runway?: {
        cashBalance?: number;
        variants?: { netBurn?: { months?: number; basis?: number } };
      };
    };
    const data = cf.data as CfData;
    const cashBalance = data.runway?.cashBalance ?? 0;
    const monthlyBurn = data.runway?.variants?.netBurn?.basis ?? 0;
    const runwayMonths = data.runway?.variants?.netBurn?.months ?? 0;

    const forecast: Array<{ month: string; balance: number }> = [];
    const now = new Date();
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const m = String(d.getMonth() + 1).padStart(2, "0");
      forecast.push({
        month: `${d.getFullYear()}-${m}`,
        balance: cashBalance - monthlyBurn * i,
      });
    }
    return { cashBalance, monthlyBurn, runwayMonths, forecast };
  }, [cf.data]);

  if (cf.isLoading) {
    return <div className="text-sm text-muted-foreground">読込中...</div>;
  }
  if (!summary) {
    return (
      <div className="text-sm text-muted-foreground">
        資金繰りデータが取得できませんでした。
        <Link href="/cashflow" className="ml-2 text-[var(--color-primary)] hover:underline">
          資金繰りページ <ExternalLink className="inline h-3 w-3" />
        </Link>{" "}
        で詳細を確認してください。
      </div>
    );
  }

  const lowestBalance = Math.min(...summary.forecast.map((f) => f.balance));
  const lowestThreshold = summary.cashBalance * 0.3;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="現預金残高" value={formatYen(summary.cashBalance)} />
        <Stat label="月次Net Burn" value={formatYen(summary.monthlyBurn)} accent="rose" />
        <Stat
          label="ランウェイ"
          value={`${summary.runwayMonths.toFixed(1)}ヶ月`}
          accent={
            summary.runwayMonths >= 12
              ? "emerald"
              : summary.runwayMonths >= 6
                ? "amber"
                : "rose"
          }
        />
      </div>

      <div className="overflow-hidden rounded-md border bg-white shadow-sm">
        <div className="border-b px-3 py-2 text-xs font-bold text-[var(--color-primary)]">
          向こう6ヶ月の予測残高（Net Burn 平均で按分）
        </div>
        <table className="w-full text-xs tabular-nums">
          <thead className="border-b bg-muted/40 text-[10px] text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 text-left">月</th>
              <th className="px-3 py-1.5 text-right">予測残高</th>
              <th className="px-3 py-1.5 text-right">対前月差</th>
            </tr>
          </thead>
          <tbody>
            {summary.forecast.map((f, i) => {
              const prev = i === 0 ? summary.cashBalance : summary.forecast[i - 1].balance;
              const delta = f.balance - prev;
              const isLow = f.balance < lowestThreshold;
              return (
                <tr key={i} className={cn("border-b last:border-b-0", isLow && "bg-rose-50/50")}>
                  <td className="px-3 py-1.5">{f.month}</td>
                  <td
                    className={cn("px-3 py-1.5 text-right font-bold", f.balance < 0 && "text-rose-700")}
                  >
                    {formatYen(f.balance)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-1.5 text-right text-[10px]",
                      delta < 0 && "text-rose-700",
                      delta > 0 && "text-emerald-700",
                    )}
                  >
                    {delta >= 0 ? "+" : ""}
                    {formatYen(delta)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {lowestBalance < 0 && (
        <div className="rounded-md border-l-4 border-l-rose-500 bg-rose-50/60 p-3 text-xs">
          <strong className="text-rose-700">警告:</strong> 6ヶ月以内に現預金が枯渇します。
          納税月のキャッシュアウトを織り込むとさらに早まる可能性があるため、早急に
          <Link href="/funding-report" className="ml-1 text-[var(--color-primary)] hover:underline">
            資金調達レポート <ExternalLink className="inline h-3 w-3" />
          </Link>
          で対策を検討してください。
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        ※ 当セクションは Net Burn ベースの単純按分。
        ③納税予想の納付額・賞与・大型設備投資を織り込んだ精緻版は次期実装予定。
        現状の詳細は{" "}
        <Link href="/cashflow" className="text-[var(--color-primary)] hover:underline">
          資金繰りページ <ExternalLink className="inline h-3 w-3" />
        </Link>{" "}
        を参照。
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "rose" | "emerald" | "amber";
}) {
  return (
    <div
      className={cn(
        "rounded-md border-l-4 bg-white p-3 shadow-sm",
        accent === "rose" && "border-l-rose-500",
        accent === "emerald" && "border-l-emerald-500",
        accent === "amber" && "border-l-amber-500",
        !accent && "border-l-blue-500",
      )}
    >
      <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
      <div className="text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}
