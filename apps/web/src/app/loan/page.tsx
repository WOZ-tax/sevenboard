"use client";

import { useState, useCallback } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Landmark, Calculator, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from "recharts";

interface ScheduleEntry {
  month: number;
  principal: number;
  interest: number;
  payment: number;
  balance: number;
}

interface LoanResult {
  monthlyPayment: number;
  totalPayment: number;
  totalInterest: number;
  schedule: ScheduleEntry[];
  runwayImpact?: {
    currentCash: number;
    monthlyPaymentBurden: number;
    adjustedRunwayMonths: number;
  };
}

type RepaymentType = "EQUAL_INSTALLMENT" | "EQUAL_PRINCIPAL" | "BULLET";

interface LoanScenario {
  id: string;
  name: string;
  principal: string;
  interestRate: string;
  termMonths: string;
  graceMonths: string;
  repaymentType: RepaymentType;
  result: LoanResult | null;
  loading: boolean;
}

const SCENARIO_COLORS = [
  "var(--color-primary)",
  "var(--color-tertiary)",
  "#e67e22",
] as const;

const SCENARIO_NAMES = ["シナリオA", "シナリオB", "シナリオC"] as const;

function formatYen(value: number): string {
  return `${Math.round(value).toLocaleString()}`;
}

function createScenario(index: number): LoanScenario {
  return {
    id: typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}-${index}`,
    name: SCENARIO_NAMES[index] || `シナリオ${index + 1}`,
    principal: "10000000",
    interestRate: "2.0",
    termMonths: "60",
    graceMonths: "0",
    repaymentType: "EQUAL_INSTALLMENT",
    result: null,
    loading: false,
  };
}

export default function LoanPage() {
  const user = useAuthStore((s) => s.user);
  const orgId = user?.orgId || "";

  const [scenarios, setScenarios] = useState<LoanScenario[]>([
    createScenario(0),
  ]);

  const isSingle = scenarios.length === 1;

  const updateScenario = useCallback(
    (id: string, patch: Partial<LoanScenario>) => {
      setScenarios((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
      );
    },
    []
  );

  const addScenario = useCallback(() => {
    setScenarios((prev) => {
      if (prev.length >= 3) return prev;
      return [...prev, createScenario(prev.length)];
    });
  }, []);

  const removeScenario = useCallback((id: string) => {
    setScenarios((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  const handleSimulate = useCallback(
    async (scenario: LoanScenario) => {
      if (!orgId) return;
      updateScenario(scenario.id, { loading: true });
      try {
        const res = await api.simulation.loan(orgId, {
          principal: Number(scenario.principal),
          interestRate: Number(scenario.interestRate),
          termMonths: Number(scenario.termMonths),
          graceMonths: Number(scenario.graceMonths) || 0,
          repaymentType: scenario.repaymentType,
        });
        updateScenario(scenario.id, { result: res, loading: false });
      } catch {
        // API未接続時はローカルで計算
        const p = Number(scenario.principal);
        const r = Number(scenario.interestRate) / 100 / 12;
        const n = Number(scenario.termMonths);
        let monthlyPayment = 0;
        if (r > 0 && n > 0) {
          monthlyPayment = Math.round(p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
        } else if (n > 0) {
          monthlyPayment = Math.round(p / n);
        }
        const totalPayment = monthlyPayment * n;
        const totalInterest = totalPayment - p;
        const schedule = Array.from({ length: Math.min(n, 120) }, (_, i) => ({
          month: i + 1,
          payment: monthlyPayment,
          principal: Math.round(p / n),
          interest: monthlyPayment - Math.round(p / n),
          balance: Math.max(0, p - Math.round(p / n) * (i + 1)),
        }));
        updateScenario(scenario.id, {
          result: { monthlyPayment, totalPayment, totalInterest, schedule },
          loading: false,
        });
      }
    },
    [orgId, updateScenario]
  );

  const handleSimulateAll = useCallback(async () => {
    await Promise.all(scenarios.map((s) => handleSimulate(s)));
  }, [scenarios, handleSimulate]);

  const resultsExist = scenarios.some((s) => s.result !== null);
  const scenariosWithResults = scenarios.filter((s) => s.result !== null);

  // Build comparison chart data (Line chart for multi-scenario)
  const comparisonChartData = (() => {
    if (scenariosWithResults.length === 0) return [];
    const maxMonths = Math.max(
      ...scenariosWithResults.map((s) => s.result!.schedule.length)
    );
    const data: Record<string, string | number>[] = [];
    for (let i = 0; i < maxMonths; i++) {
      const entry: Record<string, string | number> = { month: `${i + 1}` };
      scenariosWithResults.forEach((s) => {
        const row = s.result!.schedule[i];
        entry[`${s.name}_返済額`] = row ? row.payment : 0;
      });
      data.push(entry);
    }
    return data;
  })();

  // Single-scenario stacked area chart data (original style)
  const singleChartData =
    isSingle && scenarios[0].result
      ? scenarios[0].result.schedule.map((s) => ({
          month: `${s.month}`,
          元金: s.principal,
          利息: s.interest,
        }))
      : [];

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Landmark className="h-6 w-6 text-[var(--color-tertiary)]" />
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
                融資シミュレーション
              </h1>
              <p className="text-sm text-muted-foreground">
                借入条件を入力して返済計画をシミュレート
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {scenarios.length < 3 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={addScenario}
              >
                <Plus className="h-4 w-4" />
                シナリオを追加
              </Button>
            )}
            {scenarios.length > 1 && (
              <Button
                size="sm"
                className="gap-2 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
                onClick={handleSimulateAll}
                disabled={scenarios.some((s) => s.loading)}
              >
                全シナリオ実行
              </Button>
            )}
          </div>
        </div>

        {/* Scenario input forms */}
        <div
          className={cn(
            "grid gap-4",
            scenarios.length === 1 && "grid-cols-1",
            scenarios.length === 2 && "grid-cols-1 lg:grid-cols-2",
            scenarios.length === 3 && "grid-cols-1 lg:grid-cols-3"
          )}
        >
          {scenarios.map((scenario, idx) => (
            <Card key={scenario.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle
                    className="flex items-center gap-2 text-base font-semibold"
                    style={{ color: SCENARIO_COLORS[idx] }}
                  >
                    <Calculator className="h-5 w-5" />
                    {scenario.name}
                  </CardTitle>
                  {scenarios.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeScenario(scenario.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div
                  className={cn(
                    "grid gap-3",
                    isSingle
                      ? "sm:grid-cols-2 lg:grid-cols-3"
                      : "grid-cols-1"
                  )}
                >
                  <div className="space-y-1.5">
                    <Label>借入額（円）</Label>
                    <Input
                      type="number"
                      value={scenario.principal}
                      onChange={(e) =>
                        updateScenario(scenario.id, {
                          principal: e.target.value,
                        })
                      }
                      placeholder="10000000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>年利（%）</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={scenario.interestRate}
                      onChange={(e) =>
                        updateScenario(scenario.id, {
                          interestRate: e.target.value,
                        })
                      }
                      placeholder="2.0"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>返済期間（月）</Label>
                    <Input
                      type="number"
                      value={scenario.termMonths}
                      onChange={(e) =>
                        updateScenario(scenario.id, {
                          termMonths: e.target.value,
                        })
                      }
                      placeholder="60"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>据置期間（月）</Label>
                    <Input
                      type="number"
                      value={scenario.graceMonths}
                      onChange={(e) =>
                        updateScenario(scenario.id, {
                          graceMonths: e.target.value,
                        })
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>返済方式</Label>
                    <Select
                      value={scenario.repaymentType}
                      onValueChange={(v) =>
                        v &&
                        updateScenario(scenario.id, {
                          repaymentType: v as RepaymentType,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EQUAL_INSTALLMENT">
                          元利均等
                        </SelectItem>
                        <SelectItem value="EQUAL_PRINCIPAL">
                          元金均等
                        </SelectItem>
                        <SelectItem value="BULLET">一括返済</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      className="w-full gap-2 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
                      onClick={() => handleSimulate(scenario)}
                      disabled={scenario.loading}
                    >
                      {scenario.loading ? "計算中..." : "実行"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Results */}
        {resultsExist && (
          <>
            {/* Summary cards - side by side comparison */}
            <div
              className={cn(
                "grid gap-4",
                scenariosWithResults.length === 1 && "grid-cols-1 sm:grid-cols-3",
                scenariosWithResults.length === 2 && "grid-cols-1 lg:grid-cols-2",
                scenariosWithResults.length === 3 && "grid-cols-1 lg:grid-cols-3"
              )}
            >
              {scenariosWithResults.map((scenario, idx) => (
                <Card key={scenario.id}>
                  <CardHeader className="pb-2">
                    <CardTitle
                      className="text-sm font-semibold"
                      style={{ color: SCENARIO_COLORS[idx] }}
                    >
                      {scenario.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        月額返済額
                      </p>
                      <p className="text-xl font-bold text-[var(--color-text-primary)]">
                        {formatYen(scenario.result!.monthlyPayment)}円
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">総返済額</p>
                      <p className="text-lg font-semibold text-[var(--color-text-primary)]">
                        {formatYen(scenario.result!.totalPayment)}円
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">総利息</p>
                      <p className="text-lg font-semibold text-[var(--color-negative)]">
                        {formatYen(scenario.result!.totalInterest)}円
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Runway impact (show for each scenario that has it) */}
            {scenariosWithResults.some((s) => s.result!.runwayImpact) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
                    ランウェイ影響
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className={cn(
                      "grid gap-4",
                      scenariosWithResults.length === 1 && "grid-cols-1 sm:grid-cols-3",
                      scenariosWithResults.length === 2 && "grid-cols-1 lg:grid-cols-2",
                      scenariosWithResults.length === 3 && "grid-cols-1 lg:grid-cols-3"
                    )}
                  >
                    {scenariosWithResults.map((scenario, idx) =>
                      scenario.result!.runwayImpact ? (
                        <div key={scenario.id} className="space-y-2">
                          <p
                            className="text-sm font-semibold"
                            style={{ color: SCENARIO_COLORS[idx] }}
                          >
                            {scenario.name}
                          </p>
                          <div className="grid gap-2 sm:grid-cols-3">
                            <div>
                              <p className="text-xs text-muted-foreground">
                                現預金残高
                              </p>
                              <p className="text-sm font-semibold">
                                {formatYen(
                                  scenario.result!.runwayImpact!.currentCash
                                )}
                                円
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">
                                月次返済負担
                              </p>
                              <p className="text-sm font-semibold">
                                {formatYen(
                                  scenario.result!.runwayImpact!
                                    .monthlyPaymentBurden
                                )}
                                円
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">
                                調整後ランウェイ
                              </p>
                              <p className="text-sm font-semibold">
                                {
                                  scenario.result!.runwayImpact!
                                    .adjustedRunwayMonths
                                }
                                ヶ月
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : null
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
                  返済額推移
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    {isSingle && scenarios[0].result ? (
                      <AreaChart data={singleChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 11 }}
                          label={{
                            value: "月",
                            position: "insideBottomRight",
                            offset: -5,
                          }}
                        />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v: number) =>
                            `${Math.round(v / 10000)}万`
                          }
                        />
                        <Tooltip
                          formatter={(value) =>
                            `${formatYen(Number(value))}円`
                          }
                        />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="元金"
                          stackId="1"
                          stroke="var(--color-primary)"
                          fill="var(--color-primary)"
                          fillOpacity={0.6}
                        />
                        <Area
                          type="monotone"
                          dataKey="利息"
                          stackId="1"
                          stroke="var(--color-tertiary)"
                          fill="var(--color-tertiary)"
                          fillOpacity={0.6}
                        />
                      </AreaChart>
                    ) : (
                      <LineChart data={comparisonChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 11 }}
                          label={{
                            value: "月",
                            position: "insideBottomRight",
                            offset: -5,
                          }}
                        />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v: number) =>
                            `${Math.round(v / 10000)}万`
                          }
                        />
                        <Tooltip
                          formatter={(value) =>
                            `${formatYen(Number(value))}円`
                          }
                        />
                        <Legend />
                        {scenariosWithResults.map((s, idx) => (
                          <Line
                            key={s.id}
                            type="monotone"
                            dataKey={`${s.name}_返済額`}
                            name={s.name}
                            stroke={SCENARIO_COLORS[idx]}
                            strokeWidth={2}
                            dot={false}
                          />
                        ))}
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Schedule tables */}
            {scenariosWithResults.map((scenario, idx) => (
              <Card key={scenario.id}>
                <CardHeader className="pb-2">
                  <CardTitle
                    className="text-base font-semibold"
                    style={{ color: SCENARIO_COLORS[idx] }}
                  >
                    {scenario.name} - 返済スケジュール
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-[var(--color-background)] border-b-2 border-[var(--color-border)]">
                          <TableHead className="text-right font-semibold text-[var(--color-text-primary)]">
                            月
                          </TableHead>
                          <TableHead className="text-right font-semibold text-[var(--color-text-primary)]">
                            元金
                          </TableHead>
                          <TableHead className="text-right font-semibold text-[var(--color-text-primary)]">
                            利息
                          </TableHead>
                          <TableHead className="text-right font-semibold text-[var(--color-text-primary)]">
                            返済額
                          </TableHead>
                          <TableHead className="text-right font-semibold text-[var(--color-text-primary)]">
                            残高
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scenario.result!.schedule.map((row) => (
                          <TableRow key={row.month}>
                            <TableCell className="text-right text-sm">
                              {row.month}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {formatYen(row.principal)}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {formatYen(row.interest)}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              {formatYen(row.payment)}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {formatYen(row.balance)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
