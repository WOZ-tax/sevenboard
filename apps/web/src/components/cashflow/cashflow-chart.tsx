"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatManYen } from "@/lib/format";

const mockBalanceChartData = [
  { month: "4月", actual: 15000, forecast: null },
  { month: "5月", actual: 15500, forecast: null },
  { month: "6月", actual: 16200, forecast: null },
  { month: "7月", actual: 16800, forecast: null },
  { month: "8月", actual: 17300, forecast: null },
  { month: "9月", actual: 17800, forecast: null },
  { month: "10月", actual: null, forecast: 18330 },
  { month: "11月", actual: null, forecast: 18800 },
  { month: "12月", actual: null, forecast: 19100 },
  { month: "1月", actual: null, forecast: 18500 },
  { month: "2月", actual: null, forecast: 18900 },
  { month: "3月", actual: null, forecast: 19300 },
];

interface CashflowChartProps {
  months?: string[];
  cashBalances?: number[];
}

export function CashflowChart({ months: propMonths, cashBalances }: CashflowChartProps = {}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
          資金残高推移（実績 + 予測）
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={
                propMonths && cashBalances
                  ? propMonths.map((m, i) => ({ month: m, actual: cashBalances[i] ?? null, forecast: null }))
                  : mockBalanceChartData
              }>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: "var(--color-text-secondary)" }}
                  axisLine={{ stroke: "var(--color-border)" }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "var(--color-text-secondary)" }}
                  axisLine={{ stroke: "var(--color-border)" }}
                  tickFormatter={(v) => `${v.toLocaleString()}`}
                />
                <Tooltip
                  formatter={(value) => [formatManYen(Number(value)), undefined]}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid var(--color-border)",
                    fontSize: "13px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "13px" }} />
                <ReferenceLine
                  x="9月"
                  stroke="var(--color-tertiary)"
                  strokeDasharray="4 4"
                  label={{
                    value: "現在",
                    position: "top",
                    fontSize: 11,
                    fill: "var(--color-tertiary)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="actual"
                  name="実績"
                  stroke="var(--color-primary)"
                  fill="var(--color-primary)"
                  fillOpacity={0.15}
                  strokeWidth={2.5}
                  dot={{ fill: "var(--color-primary)", r: 4 }}
                  connectNulls={false}
                />
                <Area
                  type="monotone"
                  dataKey="forecast"
                  name="予測"
                  stroke="var(--color-tertiary)"
                  fill="var(--color-tertiary)"
                  fillOpacity={0.1}
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={{ fill: "var(--color-tertiary)", r: 3 }}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
