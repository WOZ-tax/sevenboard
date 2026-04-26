"use client";

import { useIsClient } from "@/hooks/use-is-client";
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
import { formatYen } from "@/lib/format";

interface CashflowChartProps {
  months?: string[];
  cashBalances?: number[];
  /** 月次バーン額。これを使って予測値を直線外挿する。0なら予測非表示 */
  burnRate?: number;
  /** バーン基準のラベル（凡例補足用） */
  burnLabel?: string;
  /** 何ヶ月先まで予測を出すか（既定6） */
  forecastMonths?: number;
  /** 予測の起点となる当月（カレンダー月 1-12）。期間セレクタの選択月。 */
  currentMonth?: number;
}

type ChartPoint = { month: string; actual: number | null; forecast: number | null };

export function CashflowChart({
  months: propMonths,
  cashBalances,
  burnRate = 0,
  burnLabel,
  forecastMonths = 6,
  currentMonth,
}: CashflowChartProps = {}) {
  const mounted = useIsClient();

  // 直近の実残高インデックス（ゼロ・null・未取得月を除外）
  const lastActualIdx = (() => {
    if (!propMonths || !cashBalances) return -1;
    for (let i = cashBalances.length - 1; i >= 0; i--) {
      const v = cashBalances[i];
      if (v && v !== 0) return i;
    }
    return -1;
  })();

  // 当月（期間セレクタで選んだ月）の propMonths 上のインデックス
  const currentMonthIdx = (() => {
    if (!propMonths || currentMonth == null) return -1;
    for (let i = 0; i < propMonths.length; i++) {
      const m = parseInt((propMonths[i] ?? '').replace('月', ''), 10);
      if (m === currentMonth) return i;
    }
    return -1;
  })();

  // 予測の起点（pivot）: 当月優先、無ければ直近実績月にフォールバック
  const pivotIdx = currentMonthIdx >= 0 ? currentMonthIdx : lastActualIdx;
  const pivotBalance = (() => {
    if (!cashBalances || pivotIdx < 0) return 0;
    const v = cashBalances[pivotIdx];
    if (v && v !== 0) return v;
    // 当月にデータが無ければ直近実績の値を起点として使う（実績線は当月まで延長表示）
    return lastActualIdx >= 0 ? cashBalances[lastActualIdx] : 0;
  })();
  const referenceMonth =
    pivotIdx >= 0 && propMonths ? propMonths[pivotIdx] : null;

  // 枯渇月数（参考表示用）
  const exhaustMonths =
    burnRate > 0 && pivotBalance > 0
      ? Math.round((pivotBalance / burnRate) * 10) / 10
      : null;

  const chartData: ChartPoint[] | null = (() => {
    if (!propMonths || !cashBalances) return null;
    // 実績は「pivot（当月）まで」のみ描画
    const renderEnd = pivotIdx >= 0 ? pivotIdx : propMonths.length - 1;
    const data: ChartPoint[] = [];
    for (let i = 0; i <= renderEnd; i++) {
      const v = cashBalances[i];
      const isActual = i <= lastActualIdx && v != null && v !== 0;
      // pivot（当月）に値が無い場合は、起点として pivotBalance を使って実績線を当月まで延長
      const actualValue =
        i === pivotIdx && !isActual ? pivotBalance : isActual ? v : null;
      data.push({
        month: propMonths[i],
        actual: actualValue,
        // pivot 月で実績線と予測線を連結
        forecast: i === pivotIdx ? pivotBalance : null,
      });
    }

    // 予測区間: バーンが正なら減少、負なら増加。0 のときだけスキップ
    if (pivotIdx >= 0 && burnRate !== 0 && forecastMonths > 0) {
      const pivotLabel = propMonths[pivotIdx] ?? '';
      const pivotNum = parseInt(pivotLabel.replace('月', ''), 10);
      if (Number.isFinite(pivotNum)) {
        for (let k = 1; k <= forecastMonths; k++) {
          const nextNum = ((pivotNum + k - 1) % 12) + 1;
          const projected = pivotBalance - burnRate * k;
          data.push({
            month: `${nextNum}月`,
            actual: null,
            forecast: Math.max(0, projected),
          });
        }
      }
    }
    return data;
  })();

  const forecastLabel = burnLabel ? `予測（${burnLabel}基準）` : '予測';
  const captionParts: string[] = [];
  if (burnRate !== 0 && burnLabel) {
    const sign = burnRate > 0 ? '−' : '+';
    captionParts.push(`${burnLabel}: ${sign}${formatYen(Math.abs(burnRate))}/月`);
  }
  if (exhaustMonths !== null) {
    captionParts.push(`残高ゼロまで約${exhaustMonths}か月`);
  }
  if (burnRate < 0) {
    captionParts.push('営業黒字（残高増加トレンド）');
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base font-semibold text-[var(--color-text-primary)]">
          <span>資金残高推移（実績 + 予測）</span>
          {captionParts.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {captionParts.join(' / ')}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          {!mounted ? null : !chartData ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              MFクラウド会計を接続すると資金残高推移が表示されます
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
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
                  formatter={(value) => [formatYen(Number(value)), undefined]}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid var(--color-border)",
                    fontSize: "13px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "13px" }} />
                {referenceMonth && (
                  <ReferenceLine
                    x={referenceMonth}
                    stroke="var(--color-tertiary)"
                    strokeDasharray="4 4"
                    label={{
                      value: "現在",
                      position: "top",
                      fontSize: 11,
                      fill: "var(--color-tertiary)",
                    }}
                  />
                )}
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
                  name={forecastLabel}
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
          )}
        </div>
      </CardContent>
    </Card>
  );
}
