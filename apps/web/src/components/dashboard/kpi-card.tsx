"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatManYen, formatPercent, getValueColor } from "@/lib/format";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 48, h = 20;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return <svg width={w} height={h} className="inline-block ml-2"><polyline points={points} fill="none" stroke={color} strokeWidth="1.5" /></svg>;
}

interface KpiCardProps {
  title: string;
  value: number;
  unit: string;
  monthOverMonth: number;
  budgetRatio: number;
  trend?: number[];
  comparisonLabel?: string;
  comparisonValue?: number;
}

export function KpiCard({
  title,
  value,
  unit,
  monthOverMonth,
  budgetRatio,
  trend,
  comparisonLabel = "前月比",
  comparisonValue,
}: KpiCardProps) {
  const displayValue = comparisonValue ?? monthOverMonth;

  const TrendIcon =
    displayValue > 0
      ? TrendingUp
      : displayValue < 0
        ? TrendingDown
        : Minus;

  const budgetPercent = Math.min(budgetRatio, 150);
  const barColor =
    budgetRatio >= 100
      ? "var(--color-success)"
      : budgetRatio >= 80
        ? "var(--color-warning)"
        : "var(--color-error)";

  const sparkColor = displayValue >= 0 ? "var(--color-success)" : "var(--color-error)";

  const statusBadge = budgetRatio >= 100
    ? { label: "順調", className: "bg-[#e8f5e9] text-[var(--color-success)]" }
    : budgetRatio >= 80
      ? { label: "注意", className: "bg-[#fff8e1] text-[#8d6e00]" }
      : { label: "要改善", className: "bg-[#fce4ec] text-[var(--color-error)]" };

  return (
    <Card className="border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-1)] transition-shadow hover:shadow-[var(--shadow-2)]" style={{ borderRadius: 'var(--radius-lg)' }}>
      <CardContent className="p-5">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm text-[var(--color-text-secondary)]">{title}</span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none ${statusBadge.className}`}>
            {statusBadge.label}
          </span>
        </div>
        <div className="mb-3 flex items-baseline gap-1">
          <span className="text-2xl font-bold text-[var(--color-text-primary)]">
            {unit === "万円" ? formatManYen(value) : value.toLocaleString()}
          </span>
          <span className="text-sm text-[var(--color-text-secondary)]">
            {unit === "万円" ? "" : unit}
          </span>
          {trend && <Sparkline data={trend} color={sparkColor} />}
        </div>
        <div className="flex items-center justify-between text-xs">
          <div className={`flex items-center gap-1 ${getValueColor(displayValue)}`}>
            <TrendIcon className="h-3.5 w-3.5" />
            <span>{comparisonLabel} {formatPercent(displayValue)}</span>
          </div>
          <div className="text-[var(--color-text-secondary)]">
            予算達成{" "}
            <span className={getValueColor(budgetRatio - 100)}>
              {budgetRatio.toFixed(1)}%
            </span>
          </div>
        </div>
        {/* 予算達成バー */}
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(budgetPercent / 150) * 100}%`,
                backgroundColor: barColor,
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
