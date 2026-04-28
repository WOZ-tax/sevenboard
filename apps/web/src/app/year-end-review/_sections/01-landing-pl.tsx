"use client";

import { useEffect, useMemo, useState } from "react";
import { useMfPL } from "@/hooks/use-mf-data";
import { useIndustryCode } from "@/hooks/use-industry-code";
import { getIndustryKnowledge } from "@/lib/industry-knowledge";
import { usePeriodStore } from "@/lib/period-store";
import { cn } from "@/lib/utils";

const fmtComma = (n: number): string =>
  Number.isFinite(n) ? Math.round(n).toLocaleString() : "0";

export function LandingPlSection() {
  const pl = useMfPL();
  const lockedMonth = usePeriodStore((s) => s.month);
  const elapsedMonths = lockedMonth ? Math.max(1, lockedMonth) : 12;

  // pl.data は FinancialStatementRow[] の平坦配列。category/current/prior を持つ
  const rows = useMemo(() => {
    if (!pl.data || !Array.isArray(pl.data)) return [];
    return pl.data.map((r) => ({
      name: r.category,
      current: r.current ?? 0,
      prior: r.prior ?? 0,
      indent: r.isHeader ? 0 : 1,
      isTotal: r.isTotal ?? false,
    }));
  }, [pl.data]);

  // 売上行を見つけて、デフォルトの着地売上（YTD × 12/N）を算出
  const defaultLandingRevenue = useMemo(() => {
    // 「売上高」または「売上高合計」を最優先で拾う（売上原価/売上総利益は除外）
    const salesRow = rows.find(
      (r) =>
        r.name.includes("売上高") &&
        !r.name.includes("原価") &&
        !r.name.includes("総利益"),
    );
    const ytdRevenue = salesRow?.current ?? 0;
    return Math.round((ytdRevenue / elapsedMonths) * 12);
  }, [rows, elapsedMonths]);

  // ユーザーが上書きした売上着地（円）。null = 自動。
  const [userLandingRevenue, setUserLandingRevenue] = useState<number | null>(null);
  // 直接入力 vs スライダーの表示切替（保存対象外）
  const [adjustPercent, setAdjustPercent] = useState(0);

  // 自動値が変わったら手動値もリセット（顧問先切り替え時など）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 自動着地値の変化に同期して手動値リセット
    setUserLandingRevenue(null);
     
    setAdjustPercent(0);
  }, [defaultLandingRevenue]);

  // 実際に使う着地売上 = 直接入力 ?? デフォルト × (1 + 調整%/100)
  const targetLandingRevenue =
    userLandingRevenue ?? Math.round(defaultLandingRevenue * (1 + adjustPercent / 100));

  // 全体スケール係数 = 着地売上 / (デフォルトの売上着地)
  // これを全行に掛けて、利益構造（粗利率・営業利益率）はYTDのまま維持
  const scaleFactor =
    defaultLandingRevenue > 0 ? targetLandingRevenue / defaultLandingRevenue : 1;

  const [industryCode] = useIndustryCode();
  const industry = useMemo(() => getIndustryKnowledge(industryCode), [industryCode]);

  // 着地売上を分母にした業界比較用の比率（売上総利益率・営業利益率）
  const landingRevenueAmount = targetLandingRevenue;

  const projected = useMemo(() => {
    return rows.map((r) => {
      const baseLanding = (r.current / elapsedMonths) * 12;
      const adjusted = baseLanding * scaleFactor;
      // 業界平均との比較対象になる行を判定
      const ratio =
        landingRevenueAmount > 0 ? (adjusted / landingRevenueAmount) * 100 : 0;
      let benchmark: { value: number; label: string } | null = null;
      if (r.name.includes("売上総利益") && industry.metrics.grossMarginPct !== undefined) {
        benchmark = { value: industry.metrics.grossMarginPct, label: "粗利率" };
      } else if (r.name === "売上原価" && industry.metrics.cogsRatioPct !== undefined) {
        benchmark = { value: industry.metrics.cogsRatioPct, label: "原価率" };
      } else if (
        r.name.includes("販売費及び一般管理費") &&
        industry.metrics.sgaRatioPct !== undefined
      ) {
        benchmark = { value: industry.metrics.sgaRatioPct, label: "販管費率" };
      } else if (
        r.name.includes("営業利益") &&
        industry.metrics.operatingMarginPct !== undefined
      ) {
        benchmark = { value: industry.metrics.operatingMarginPct, label: "営業利益率" };
      }
      return {
        ...r,
        landing: adjusted,
        delta: r.prior > 0 ? (adjusted - r.prior) / r.prior : 0,
        ratio,
        benchmark,
      };
    });
  }, [rows, elapsedMonths, scaleFactor, landingRevenueAmount, industry]);

  if (pl.isLoading) {
    return <div className="text-sm text-muted-foreground">読込中...</div>;
  }
  if (!pl.data) {
    return <div className="text-sm text-muted-foreground">MF会計データが取得できませんでした。</div>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-white p-3 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold text-muted-foreground">着地売上見込み</span>
          <span className="text-[11px] text-muted-foreground">
            自動値: ¥{fmtComma(defaultLandingRevenue)}（YTD × 12/{elapsedMonths}）
          </span>
          {userLandingRevenue === null && adjustPercent === 0 && (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              自動
            </span>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          {/* スライダー */}
          <div className="flex items-center gap-3">
            <span className="w-12 text-[11px] text-muted-foreground">調整 %</span>
            <input
              type="range"
              min={-30}
              max={30}
              step={1}
              value={adjustPercent}
              onChange={(e) => {
                setUserLandingRevenue(null);
                setAdjustPercent(parseInt(e.target.value, 10) || 0);
              }}
              className="flex-1"
            />
            <span
              className={cn(
                "w-14 text-right text-sm font-bold tabular-nums",
                adjustPercent > 0 && "text-emerald-700",
                adjustPercent < 0 && "text-rose-700",
              )}
            >
              {adjustPercent >= 0 ? "+" : ""}
              {adjustPercent}%
            </span>
          </div>

          {/* 直接入力 */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">直接入力</span>
            <input
              type="text"
              inputMode="numeric"
              value={fmtComma(targetLandingRevenue)}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d]/g, "");
                setUserLandingRevenue(parseInt(raw, 10) || 0);
                setAdjustPercent(0);
              }}
              className="w-36 rounded border px-2 py-1 text-right text-xs"
            />
            <button
              type="button"
              onClick={() => {
                setUserLandingRevenue(null);
                setAdjustPercent(0);
              }}
              className="text-[11px] text-[var(--color-primary)] hover:underline"
            >
              自動に戻す
            </button>
          </div>
        </div>

        <div className="mt-2 text-[11px] text-muted-foreground">
          着地売上を変更すると、全勘定科目が同じ倍率（{scaleFactor.toFixed(3)}）でスケールされます。
          → 粗利率・営業利益率は YTD と同じ構造を維持。
        </div>
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
              <th className="px-3 py-2 text-right" title={`業種: ${industry.label}`}>
                業界平均
              </th>
            </tr>
          </thead>
          <tbody>
            {projected.map((r, i) => {
              const diffFromBench =
                r.benchmark !== null
                  ? r.ratio - r.benchmark.value
                  : null;
              return (
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
                  <td className="px-3 py-1.5 text-right text-[10px]">
                    {r.benchmark !== null ? (
                      <span
                        className={cn(
                          "inline-flex flex-col items-end",
                          diffFromBench !== null && Math.abs(diffFromBench) <= 2 && "text-muted-foreground",
                          diffFromBench !== null && diffFromBench > 2 && "text-emerald-700",
                          diffFromBench !== null && diffFromBench < -2 && "text-rose-700",
                        )}
                      >
                        <span>業界 {r.benchmark.value}%</span>
                        <span className="text-[9px]">
                          自社 {r.ratio.toFixed(1)}%（{diffFromBench !== null && diffFromBench >= 0 ? "+" : ""}
                          {diffFromBench?.toFixed(1)}pt）
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        ※ 着地予測 = 各行の (当期YTD × 12 / 経過月数) × 売上スケール係数。
        厳密な按分（変動費/固定費の分離）は行わず、利益率を YTD で固定する単純化版です。
        業界平均は <strong>{industry.label}</strong> の指標目安（{industry.metrics.sourceNote ?? "—"}）。
      </p>
    </div>
  );
}
