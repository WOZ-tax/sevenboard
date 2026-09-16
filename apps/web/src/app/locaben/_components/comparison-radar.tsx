"use client";

import { useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  LOCABEN_METRICS,
  LOCABEN_METRIC_KEYS,
  type LocabenMetricKey,
} from "@/lib/locaben/constants";
import { buildRadarData, COMPARISON_STYLES } from "@/lib/locaben/comparison";
import { cn } from "@/lib/utils";

type Metrics = Record<LocabenMetricKey, number | null>;
export type ComparisonPeriod = {
  label: string;
  metrics: Metrics;
  available: boolean;
  isLoading: boolean;
  isError: boolean;
};
type Point = { x: number; y: number; value?: number | null };

/** Recharts maps null to the centre, so draw only genuinely available points/edges. */
function PeriodShape({
  points = [],
  index,
}: {
  points?: Point[];
  index: number;
}) {
  const style = COMPARISON_STYLES[index];
  const valid = (point: Point) =>
    point.value != null && Number.isFinite(point.value);
  const complete = points.length === 6 && points.every(valid);
  return (
    <g data-testid={`radar-period-${index}`}>
      {complete ? (
        <polygon
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
          stroke={style.color}
          strokeWidth={2}
          strokeDasharray={style.dash}
          fill={style.color}
          fillOpacity={index === 0 ? 0.12 : 0.04}
        />
      ) : (
        points.map((point, i) => {
          const next = points[(i + 1) % points.length];
          return valid(point) && valid(next) ? (
            <line
              key={i}
              x1={point.x}
              y1={point.y}
              x2={next.x}
              y2={next.y}
              stroke={style.color}
              strokeWidth={2}
              strokeDasharray={style.dash}
            />
          ) : null;
        })
      )}
      {points.map((point, i) =>
        valid(point) ? (
          <circle
            key={i}
            cx={point.x}
            cy={point.y}
            r={3}
            fill={style.color}
            stroke="var(--color-surface)"
            strokeWidth={1}
          />
        ) : null,
      )}
    </g>
  );
}

function AxisLabel({
  x = 0,
  y = 0,
  textAnchor,
  payload,
}: {
  x?: number;
  y?: number;
  textAnchor?: "start" | "middle" | "end";
  payload?: { value?: string };
}) {
  const label = payload?.value ?? "";
  const lines =
    label === "EBITDA有利子負債倍率"
      ? ["EBITDA有利子", "負債倍率"]
      : label === "営業運転資本回転期間"
        ? ["営業運転資本", "回転期間"]
        : [label];
  return (
    <text
      x={x}
      y={y}
      textAnchor={textAnchor}
      fill="var(--color-text-secondary)"
      fontSize={10}
    >
      {lines.map((line, i) => (
        <tspan key={line} x={x} dy={i === 0 ? (lines.length > 1 ? -3 : 3) : 13}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

const formatMetric = (value: number | null, unit: string) =>
  value === null
    ? "未入力・算出不可"
    : `${value.toLocaleString("ja-JP", { maximumFractionDigits: 1 })} ${unit}`;

export function ComparisonRadar({
  periods,
  benchmarks,
  month,
}: {
  periods: ComparisonPeriod[];
  benchmarks: Metrics & Record<LocabenMetricKey, number>;
  month?: number;
}) {
  const [hidden, setHidden] = useState<Record<number, boolean>>({});
  const [chartWidth, setChartWidth] = useState(0);
  const data = buildRadarData(
    periods.map((period) => period.metrics),
    benchmarks,
  );
  const status = (period: ComparisonPeriod) =>
    !period.available
      ? "会計期間なし"
      : period.isLoading
        ? "取得中…"
        : period.isError
          ? "取得できませんでした"
          : `${Object.values(period.metrics).filter((value) => value !== null).length}/6 指標`;
  return (
    <div
      className="min-w-0 rounded-md border border-[var(--color-border)] p-3"
      data-testid="locaben-comparison"
    >
      <h3 className="text-xs font-semibold text-[var(--color-text-primary)]">
        過去3期の比較（業種平均=100）
      </h3>
      <p className="mt-1 text-[11px] text-muted-foreground">
        選択期・前期・前々期／
        {month ? `各期の${month}月までの累計` : "各期の通期"}
      </p>
      <div
        className="mt-3 flex flex-wrap gap-2"
        aria-label="比較する期の表示切替"
      >
        {periods.map((period, index) => {
          const style = COMPARISON_STYLES[index];
          return (
            <button
              key={index}
              type="button"
              aria-label={`${period.label}の表示`}
              aria-pressed={!hidden[index]}
              disabled={!period.available}
              onClick={() =>
                setHidden((previous) => ({
                  ...previous,
                  [index]: !previous[index],
                }))
              }
              className={cn(
                "rounded-md border px-2 py-1.5 text-left text-[11px] transition-opacity disabled:cursor-default disabled:opacity-50",
                hidden[index]
                  ? "border-dashed opacity-50"
                  : "border-[var(--color-border)] bg-[var(--color-surface)]",
              )}
            >
              <span className="flex items-center gap-1.5">
                <svg width="22" height="8" aria-hidden="true">
                  <line
                    x1="0"
                    y1="4"
                    x2="22"
                    y2="4"
                    stroke={style.color}
                    strokeWidth="2"
                    strokeDasharray={style.dash}
                  />
                </svg>
                <span className="font-medium">{period.label}</span>
              </span>
              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                {status(period)}
              </span>
            </button>
          );
        })}
      </div>
      <div
        className="h-[260px] sm:h-[330px]"
        aria-label="ロカベン財務6指標の3期比較レーダーチャート"
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 300, height: 260 }}
          onResize={setChartWidth}
        >
          <RadarChart
            data={data}
            outerRadius={
              chartWidth >= 340 ? "68%" : chartWidth >= 280 ? "58%" : "45%"
            }
          >
            <PolarGrid stroke="var(--color-border)" />
            <PolarAngleAxis dataKey="metric" tick={<AxisLabel />} />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 200]}
              ticks={[50, 100, 150, 200]}
              tickFormatter={(value) => (value === 200 ? "" : String(value))}
              tick={{ fontSize: 9, fill: "var(--color-text-secondary)" }}
              axisLine={false}
            />
            <Radar
              name="業種平均"
              dataKey="benchmark"
              stroke="var(--color-text-secondary)"
              strokeDasharray="4 4"
              fill="none"
              isAnimationActive={false}
              activeDot={false}
            />
            {[2, 1, 0].map(
              (index) =>
                !hidden[index] &&
                periods[index].available &&
                !periods[index].isLoading &&
                !periods[index].isError && (
                  <Radar
                    key={index}
                    name={periods[index].label}
                    dataKey={`period${index}`}
                    stroke={COMPARISON_STYLES[index].color}
                    fill="none"
                    isAnimationActive={false}
                    activeDot={false}
                    shape={(props: { points?: Point[] }) => (
                      <PeriodShape points={props.points} index={index} />
                    )}
                  />
                ),
            )}
            <Tooltip
              content={({ active, label }) => {
                const metricKey = LOCABEN_METRIC_KEYS.find(
                  (key) => LOCABEN_METRICS[key].label === label,
                );
                if (!active || !metricKey) return null;
                const metric = LOCABEN_METRICS[metricKey];
                return (
                  <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs shadow-md">
                    <div className="mb-2 font-semibold">{metric.label}</div>
                    {periods.map(
                      (period, index) =>
                        !hidden[index] && (
                          <div
                            key={index}
                            className="mt-1 flex justify-between gap-4"
                          >
                            <span
                              style={{ color: COMPARISON_STYLES[index].color }}
                            >
                              {period.label}
                            </span>
                            <span>
                              {formatMetric(
                                period.metrics[metricKey],
                                metric.unit,
                              )}
                            </span>
                          </div>
                        ),
                    )}
                    <div className="mt-2 border-t pt-1 text-muted-foreground">
                      業種平均{" "}
                      {formatMetric(benchmarks[metricKey], metric.unit)}
                    </div>
                  </div>
                );
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        灰色の破線は業種平均。外側ほど良好（上限200）。未入力・算出不可の指標には点や面を描きません。進行中の期は入力済みの実績です。
      </p>
      <details className="mt-3 border-t border-[var(--color-border)] pt-2">
        <summary className="cursor-pointer text-xs font-medium">
          3期の実績値を見る
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[360px] text-[11px]">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-left font-medium">指標</th>
                {periods.map((period, index) => (
                  <th
                    key={index}
                    className="px-2 text-right font-medium"
                    style={{ color: COMPARISON_STYLES[index].color }}
                  >
                    {period.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LOCABEN_METRIC_KEYS.map((key) => (
                <tr key={key} className="border-b last:border-0">
                  <th className="py-2 text-left font-normal">
                    {LOCABEN_METRICS[key].label}
                    <span className="block text-[10px] text-muted-foreground">
                      {LOCABEN_METRICS[key].unit}
                    </span>
                  </th>
                  {periods.map((period, index) => (
                    <td key={index} className="px-2 text-right tabular-nums">
                      {period.metrics[key] === null
                        ? "—"
                        : period.metrics[key].toLocaleString("ja-JP", {
                            maximumFractionDigits: 1,
                          })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
