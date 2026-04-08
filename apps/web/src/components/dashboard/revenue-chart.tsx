"use client";

import { useEffect, useState } from "react";
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
import { formatManYen } from "@/lib/format";
import { usePeriodStore } from "@/lib/period-store";

interface PlTransitionPoint {
  month: string;
  revenue: number;
  operatingProfit: number;
}

interface RevenueChartProps {
  mfData?: PlTransitionPoint[];
}

export function RevenueChart({ mfData }: RevenueChartProps = {}) {
  const [mounted, setMounted] = useState(false);
  const selectedMonth = usePeriodStore((s) => s.month);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 選択月がある場合のみマーカー表示
  const monthMarker = selectedMonth ? `${selectedMonth}月` : null;

  const chartData = mfData?.map((p) => ({
    month: p.month,
    revenue: p.revenue,
    operatingProfit: p.operatingProfit,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
          売上高 月次推移
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
                  formatter={(value) => [formatManYen(Number(value)), undefined]}
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
                  dataKey="revenue"
                  name="売上高"
                  stroke="#0077c7"
                  strokeWidth={2.5}
                  dot={{ fill: "#0077c7", r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="operatingProfit"
                  name="営業利益"
                  stroke="#f56121"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={{ fill: "#f56121", r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
