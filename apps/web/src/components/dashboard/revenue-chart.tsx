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
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { revenueChartData } from "@/lib/mock-data";
import { formatManYen } from "@/lib/format";

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

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
          売上高 月次推移
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={
                mfData
                  ? mfData.map((p) => ({ month: p.month, actual: p.revenue, budget: 0 }))
                  : revenueChartData
              }>
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
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="実績"
                  stroke="#0077c7"
                  strokeWidth={2.5}
                  dot={{ fill: "#0077c7", r: 4 }}
                  activeDot={{ r: 6 }}
                />
                {!mfData && (
                  <Line
                    type="monotone"
                    dataKey="budget"
                    name="予算"
                    stroke="#0f7f85"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={{ fill: "#0f7f85", r: 3 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
