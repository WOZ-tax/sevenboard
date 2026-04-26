"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatManYen, formatPercent, getValueColor } from "@/lib/format";
import { TrendingUp, TrendingDown, Minus, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 48, h = 20;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return <svg width={w} height={h} className="inline-block ml-2"><polyline points={points} fill="none" stroke={color} strokeWidth="1.5" /></svg>;
}

export interface KpiCardHelp {
  /** 計算式（例: 営業利益 ÷ 売上高 × 100） */
  formula?: string;
  /** 指標の意味（経営者目線で 1〜2 文） */
  meaning: string;
  /** 目安・ベンチマーク */
  benchmark?: string;
  /** 注意点 */
  caveat?: string;
}

export interface KpiCardProps {
  title: string;
  value: number | string;
  unit: string;
  monthOverMonth?: number;
  budgetRatio?: number;
  trend?: number[];
  comparisonLabel?: string;
  comparisonValue?: number;
  tag?: { label: string; className: string };
  /** ホバー時にカード見出しの隣に出すヘルプ（HelpCircle アイコン）。指定が無いと表示なし */
  help?: KpiCardHelp;
  /** 値の下に挿入する補助テキスト or JSX（例: ランウェイの全 variants 表示） */
  subContent?: React.ReactNode;
}

export function KpiCard({
  title,
  value,
  unit,
  monthOverMonth = 0,
  budgetRatio,
  trend,
  comparisonLabel = "前月比",
  comparisonValue,
  tag,
  help,
  subContent,
}: KpiCardProps) {
  const displayValue = comparisonValue ?? monthOverMonth;
  const hasBudget = budgetRatio != null;

  const TrendIcon =
    displayValue > 0
      ? TrendingUp
      : displayValue < 0
        ? TrendingDown
        : Minus;

  const budgetPercent = hasBudget ? Math.min(budgetRatio, 150) : 0;
  const barColor = !hasBudget
    ? "var(--color-border)"
    : budgetRatio >= 100
      ? "var(--color-success)"
      : budgetRatio >= 80
        ? "var(--color-warning)"
        : "var(--color-error)";

  const sparkColor = displayValue >= 0 ? "var(--color-success)" : "var(--color-error)";

  const statusBadge = !hasBudget
    ? null
    : budgetRatio >= 100
      ? { label: "順調", className: "bg-[#e8f5e9] text-[var(--color-success)]" }
      : budgetRatio >= 80
        ? { label: "注意", className: "bg-[#fff8e1] text-[#8d6e00]" }
        : { label: "要改善", className: "bg-[#fce4ec] text-[var(--color-error)]" };

  return (
    <Card className="border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-1)] transition-shadow hover:shadow-[var(--shadow-2)]" style={{ borderRadius: 'var(--radius-lg)' }}>
      <CardContent className="p-4">
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-[var(--color-text-secondary)]">{title}</span>
            {help && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`${title}の説明`}
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/70 hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                    </button>
                  }
                />
                <TooltipContent
                  side="top"
                  className="max-w-sm whitespace-normal bg-[var(--color-text-primary)] p-3 text-left text-[11px] leading-relaxed"
                >
                  <div className="space-y-2">
                    {help.formula && (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-background/60">計算式</div>
                        <div className="font-[family-name:var(--font-inter)]">{help.formula}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-background/60">意味</div>
                      <div>{help.meaning}</div>
                    </div>
                    {help.benchmark && (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-background/60">目安</div>
                        <div>{help.benchmark}</div>
                      </div>
                    )}
                    {help.caveat && (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-background/60">注意点</div>
                        <div>{help.caveat}</div>
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {(tag || statusBadge) && (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none ${(tag || statusBadge)!.className}`}>
              {(tag || statusBadge)!.label}
            </span>
          )}
        </div>
        <div className="mb-3 flex items-baseline gap-1">
          <span className="text-2xl font-bold text-[var(--color-text-primary)]">
            {typeof value === "string"
              ? value
              : unit === "万円"
                ? formatManYen(value)
                : value.toLocaleString()}
          </span>
          <span className="text-sm text-[var(--color-text-secondary)]">
            {unit === "万円" ? "" : unit}
          </span>
          {trend && <Sparkline data={trend} color={sparkColor} />}
        </div>
        {(displayValue !== 0 || hasBudget) && (
          <div className="flex items-center justify-between text-xs">
            {displayValue !== 0 ? (
              <div className={`flex items-center gap-1 ${getValueColor(displayValue)}`}>
                <TrendIcon className="h-3.5 w-3.5" />
                <span>{comparisonLabel} {formatPercent(displayValue)}</span>
              </div>
            ) : <div />}
            {hasBudget && (
              <div className="text-[var(--color-text-secondary)]">
                予算達成{" "}
                <span className={getValueColor(budgetRatio - 100)}>
                  {budgetRatio.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        )}
        {hasBudget && (
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
        )}
        {subContent && <div className="mt-3">{subContent}</div>}
      </CardContent>
    </Card>
  );
}
