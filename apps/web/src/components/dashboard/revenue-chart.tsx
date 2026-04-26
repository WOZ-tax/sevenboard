"use client";

import { useIsClient } from "@/hooks/use-is-client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { formatYen } from "@/lib/format";
import { usePeriodStore } from "@/lib/period-store";
import { usePeriodRange } from "@/components/ui/period-segment-control";

interface PlTransitionPoint {
  month: string;
  revenue: number;
  operatingProfit: number;
}

interface RevenueChartProps {
  mfData?: PlTransitionPoint[];
}

function parseMonthNum(label: string): number {
  const m = label.match(/(\d{1,2})月/);
  return m ? Number(m[1]) : 0;
}

export function RevenueChart({ mfData }: RevenueChartProps = {}) {
  const mounted = useIsClient();
  const selectedMonth = usePeriodStore((s) => s.month);
  const { isMonthInRange } = usePeriodRange();

  const monthMarker = selectedMonth ? `${selectedMonth}月` : null;

  // 選択期間外（未来月）は グレーアウト用の別系列に振り分け。
  // 境界月は両系列に入れて折れ線を連結させる。
  const points = mfData ?? [];
  let lastInRangeIdx = -1;
  points.forEach((p, i) => {
    if (isMonthInRange(parseMonthNum(p.month))) lastInRangeIdx = i;
  });

  const chartData = points.map((p, i) => {
    const inRange = isMonthInRange(parseMonthNum(p.month));
    return {
      month: p.month,
      revenueActual: inRange ? p.revenue : null,
      operatingActual: inRange ? p.operatingProfit : null,
      revenueFuture: !inRange ? p.revenue : i === lastInRangeIdx ? p.revenue : null,
      operatingFuture: !inRange
        ? p.operatingProfit
        : i === lastInRangeIdx
          ? p.operatingProfit
          : null,
    };
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-base font-semibold text-[var(--color-text-primary)]">
          売上高 月次推移
          <UiTooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="月次推移の説明"
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
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-background/60">
                    意味
                  </div>
                  <div>
                    当期 12 ヶ月の売上高と営業利益の単月推移。実績期間と未到来月を線種で分けて描画。
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-background/60">
                    線の凡例
                  </div>
                  <ul className="space-y-0.5">
                    <li>
                      <span className="inline-block h-[2px] w-3 align-middle" style={{ backgroundColor: "var(--color-primary)" }} />{" "}
                      売上高（実績、実線）
                    </li>
                    <li>
                      <span className="inline-block h-[2px] w-3 align-middle border-t border-dashed" style={{ borderColor: "#f56121" }} />{" "}
                      営業利益（実績、破線）
                    </li>
                    <li>
                      <span className="inline-block h-[2px] w-3 align-middle border-t border-dashed border-[#cbd5e1]" />{" "}
                      未到来月（グレー破線。予算ではなく単月実績の延長線）
                    </li>
                    <li>
                      <span className="inline-block h-3 w-[2px] align-middle border-l border-dashed" style={{ borderColor: "var(--color-primary)" }} />{" "}
                      選択中の月（縦のリファレンスライン）
                    </li>
                  </ul>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-background/60">
                    読み方
                  </div>
                  <div>
                    売上の波と営業利益の波が連動しているか、どちらかだけ崩れていないかを確認。営業利益が売上ほど伸びていない月は固定費 / 仕入価格の重さの兆候。
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-background/60">
                    注意
                  </div>
                  <div>
                    グレー領域は予算/予測ではなく単に未到来月のため、断定材料にはしない。
                  </div>
                </div>
              </div>
            </TooltipContent>
          </UiTooltip>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          {!mounted ? null : !chartData || chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              MFクラウド会計を接続すると月次推移が表示されます
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d6d3d0" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: "#706d65" }}
                  axisLine={{ stroke: "#d6d3d0" }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#706d65" }}
                  axisLine={{ stroke: "#d6d3d0" }}
                  tickFormatter={(v) => `${v.toLocaleString()}`}
                />
                <Tooltip
                  formatter={(value) =>
                    value === null || value === undefined
                      ? ["—", undefined]
                      : [formatYen(Number(value)), undefined]
                  }
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #d6d3d0",
                    fontSize: "13px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "13px" }} />
                {monthMarker && (
                  <ReferenceLine
                    x={monthMarker}
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    label={{
                      value: monthMarker,
                      position: "insideTopLeft",
                      fontSize: 11,
                      fill: "var(--color-primary)",
                    }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="revenueActual"
                  name="売上高"
                  stroke="var(--color-primary)"
                  strokeWidth={2.5}
                  dot={{ fill: "var(--color-primary)", r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="operatingActual"
                  name="営業利益"
                  stroke="#f56121"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={{ fill: "#f56121", r: 3 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="revenueFuture"
                  stroke="#cbd5e1"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                  legendType="none"
                />
                <Line
                  type="monotone"
                  dataKey="operatingFuture"
                  stroke="#cbd5e1"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                  legendType="none"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
