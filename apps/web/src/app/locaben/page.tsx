"use client";

/**
 * ロカベン (経済産業省ローカルベンチマーク) ページ。
 *
 * 最小実装:
 *   - 財務6指標は手入力 (一部は既存 indicators から自動補完)
 *   - 業種別 median と比較するレーダーチャート
 *   - 非財務4枚 (経営者 / 関係者 / 事業 / 内部管理) を textarea で入力
 *   - LocalStorage に保存 (orgId 単位)
 *   - Excel ダウンロード
 */

import { useEffect, useMemo, useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Download, Building2, RotateCcw } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useCurrentOrg } from "@/contexts/current-org";
import { useMfFinancialIndicators } from "@/hooks/use-mf-data";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";
import { normalizeIndustry } from "@/lib/industries";
import {
  LOCABEN_METRICS,
  LOCABEN_METRIC_KEYS,
  NON_FINANCIAL_SECTIONS,
  getBenchmarkFor,
  type LocabenMetricKey,
} from "@/lib/locaben/constants";
import { downloadLocabenExcel } from "@/lib/locaben/excel";
import { cn } from "@/lib/utils";

type LocabenFormState = {
  values: Record<LocabenMetricKey, string>;
  nonFinancial: Record<string, Record<string, string>>;
};

const STORAGE_KEY_PREFIX = "sb_locaben_";

function emptyForm(): LocabenFormState {
  const values = Object.fromEntries(
    LOCABEN_METRIC_KEYS.map((k) => [k, ""]),
  ) as Record<LocabenMetricKey, string>;
  const nonFinancial = Object.fromEntries(
    NON_FINANCIAL_SECTIONS.map((s) => [
      s.key,
      Object.fromEntries(s.fields.map((f) => [f.key, ""])),
    ]),
  );
  return { values, nonFinancial };
}

function readStorage(orgId: string): LocabenFormState {
  if (typeof window === "undefined") return emptyForm();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + orgId);
    if (!raw) return emptyForm();
    const parsed = JSON.parse(raw) as Partial<LocabenFormState>;
    const base = emptyForm();
    return {
      values: { ...base.values, ...(parsed.values ?? {}) },
      nonFinancial: NON_FINANCIAL_SECTIONS.reduce(
        (acc, s) => {
          acc[s.key] = {
            ...base.nonFinancial[s.key],
            ...((parsed.nonFinancial?.[s.key] as Record<string, string>) ?? {}),
          };
          return acc;
        },
        {} as Record<string, Record<string, string>>,
      ),
    };
  } catch {
    return emptyForm();
  }
}

function writeStorage(orgId: string, state: LocabenFormState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY_PREFIX + orgId, JSON.stringify(state));
}

function parseNumber(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export default function LocabenPage() {
  const { currentOrg } = useCurrentOrg();
  const indicators = useMfFinancialIndicators();
  const { fiscalYear, month, periods } = usePeriodStore();
  const periodLabel = getPeriodLabel(fiscalYear, month, periods);
  const orgId = currentOrg?.orgId ?? "";
  const orgName = currentOrg?.orgName ?? "(顧問先未選択)";
  const industry = normalizeIndustry(currentOrg?.industry);
  const benchmarks = useMemo(() => getBenchmarkFor(industry), [industry]);

  const [state, setState] = useState<LocabenFormState>(() => emptyForm());
  const [hydrated, setHydrated] = useState(false);

  // orgId 切替時に LocalStorage から読み直す (外部システム=localStorage との同期なので
  // useEffect 内 setState は正当)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!orgId) return;
    setState(readStorage(orgId));
    setHydrated(true);
  }, [orgId]);

  // 既存 indicators からの自動補完 (空欄かつ取得済みのときだけ)
  useEffect(() => {
    if (!hydrated || !indicators.data) return;
    setState((prev) => {
      const next = { ...prev, values: { ...prev.values } };
      let changed = false;
      const op = indicators.data!.operatingProfitMargin;
      if (next.values.operatingProfitMargin === "" && Number.isFinite(op)) {
        next.values.operatingProfitMargin = op.toFixed(1);
        changed = true;
      }
      const eq = indicators.data!.equityRatio;
      if (next.values.equityRatio === "" && Number.isFinite(eq)) {
        next.values.equityRatio = eq.toFixed(1);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [hydrated, indicators.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 変更を LocalStorage に保存
  useEffect(() => {
    if (!hydrated || !orgId) return;
    writeStorage(orgId, state);
  }, [hydrated, orgId, state]);

  const setMetric = (key: LocabenMetricKey, raw: string) => {
    setState((prev) => ({ ...prev, values: { ...prev.values, [key]: raw } }));
  };
  const setNonFinancial = (sectionKey: string, fieldKey: string, value: string) => {
    setState((prev) => ({
      ...prev,
      nonFinancial: {
        ...prev.nonFinancial,
        [sectionKey]: { ...prev.nonFinancial[sectionKey], [fieldKey]: value },
      },
    }));
  };
  const reset = () => {
    if (!confirm("入力した内容をすべてリセットしますか？")) return;
    setState(emptyForm());
  };

  const numericValues = useMemo(
    () =>
      Object.fromEntries(
        LOCABEN_METRIC_KEYS.map((k) => [k, parseNumber(state.values[k])]),
      ) as Record<LocabenMetricKey, number | null>,
    [state.values],
  );

  const handleExport = () => {
    downloadLocabenExcel({
      organizationName: orgName,
      industry,
      periodLabel: periodLabel || "(期間未設定)",
      values: numericValues,
      benchmarks,
      nonFinancial: state.nonFinancial,
      exportedAt: new Date(),
    });
  };

  // レーダーチャート用に正規化 (業種平均=100 として実績値を換算、上限200%でクリップ)
  const radarData = useMemo(() => {
    return LOCABEN_METRIC_KEYS.map((key) => {
      const def = LOCABEN_METRICS[key];
      const v = numericValues[key];
      const b = benchmarks[key];
      let normalized = 0;
      if (v !== null && b !== 0) {
        const ratio = (v / b) * 100;
        // 「低いほど良い」指標は反転 (200 - ratio で、業種平均超過は減点)
        normalized = def.higherIsBetter ? ratio : 200 - ratio;
      }
      return {
        metric: def.label,
        実績: Math.max(0, Math.min(200, normalized)),
        業種平均: 100,
      };
    });
  }, [numericValues, benchmarks]);

  if (!currentOrg) {
    return (
      <DashboardShell>
        <div className="mx-auto max-w-[1200px] p-6">
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              顧問先を選択してください。
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="mx-auto max-w-[1200px] space-y-6 p-6">
        {/* ヘッダー */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--color-text-primary)]">
              <Building2 className="h-6 w-6 text-[var(--color-primary)]" />
              ロカベン (ローカルベンチマーク)
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              経済産業省ローカルベンチマークの財務6指標 + 非財務4シート。金融機関への提出・自己診断に。
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="border-[var(--color-border)]">
                {orgName}
              </Badge>
              <Badge variant="outline" className="border-[var(--color-border)]">
                業種: {industry ?? "未設定"}
              </Badge>
              {periodLabel && (
                <Badge variant="outline" className="border-[var(--color-border)]">
                  {periodLabel}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={reset}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" /> リセット
            </Button>
            <Button
              size="sm"
              onClick={handleExport}
              className="gap-1.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90"
            >
              <Download className="h-3.5 w-3.5" /> Excel出力
            </Button>
          </div>
        </div>

        {/* 財務分析 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">財務6指標</CardTitle>
            <p className="text-xs text-muted-foreground">
              実績値を入力すると業種平均との差分が表示されます。営業利益率・自己資本比率は既存指標から自動入力されます。
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
              {/* 指標テーブル */}
              <div className="space-y-2">
                <div className="grid grid-cols-[1.4fr_1fr_1fr_0.9fr] gap-2 border-b border-[var(--color-border)] pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <div>指標</div>
                  <div>実績値</div>
                  <div>業種平均</div>
                  <div>差分</div>
                </div>
                {LOCABEN_METRIC_KEYS.map((key) => {
                  const def = LOCABEN_METRICS[key];
                  const v = numericValues[key];
                  const b = benchmarks[key];
                  const diff = v !== null ? v - b : null;
                  const isGood =
                    diff === null
                      ? null
                      : def.higherIsBetter
                        ? diff >= 0
                        : diff <= 0;
                  return (
                    <div
                      key={key}
                      className="grid grid-cols-[1.4fr_1fr_1fr_0.9fr] items-center gap-2 border-b border-[var(--color-border)]/50 py-2 last:border-b-0"
                    >
                      <div>
                        <div className="text-sm font-medium text-[var(--color-text-primary)]">
                          {def.label}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {def.formula}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Input
                          inputMode="decimal"
                          value={state.values[key]}
                          onChange={(e) => setMetric(key, e.target.value)}
                          placeholder="--"
                          className="h-8 w-20 text-right tabular-nums"
                        />
                        <span className="text-[10px] text-muted-foreground">
                          {def.unit}
                        </span>
                      </div>
                      <div className="text-sm tabular-nums text-[var(--color-text-secondary)]">
                        {b.toFixed(1)} {def.unit}
                      </div>
                      <div
                        className={cn(
                          "text-sm font-medium tabular-nums",
                          isGood === null
                            ? "text-muted-foreground"
                            : isGood
                              ? "text-[var(--color-success)]"
                              : "text-[var(--color-error)]",
                        )}
                      >
                        {diff === null
                          ? "--"
                          : `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}`}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* レーダーチャート */}
              <div className="rounded-md border border-[var(--color-border)] p-3">
                <div className="mb-2 text-xs font-semibold text-[var(--color-text-primary)]">
                  業種平均との比較 (業種平均 = 100)
                </div>
                <div className="h-[340px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} outerRadius="70%">
                      <PolarGrid stroke="var(--color-border)" />
                      <PolarAngleAxis
                        dataKey="metric"
                        tick={{ fontSize: 10, fill: "var(--color-text-secondary)" }}
                      />
                      <PolarRadiusAxis
                        angle={90}
                        domain={[0, 200]}
                        tick={{ fontSize: 9, fill: "var(--color-text-secondary)" }}
                      />
                      <Radar
                        name="業種平均"
                        dataKey="業種平均"
                        stroke="var(--color-text-secondary)"
                        fill="var(--color-text-secondary)"
                        fillOpacity={0.1}
                      />
                      <Radar
                        name="実績"
                        dataKey="実績"
                        stroke="var(--color-primary)"
                        fill="var(--color-primary)"
                        fillOpacity={0.4}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  外側ほど良好。「低いほど良い」指標 (有利子負債倍率/運転資本期間) は内部で反転して表示。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 非財務4枚 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">非財務シート</CardTitle>
            <p className="text-xs text-muted-foreground">
              ロカベン公式4シート。金融機関対話や事業承継の自己診断に。
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {NON_FINANCIAL_SECTIONS.map((section) => (
                <div
                  key={section.key}
                  className="rounded-md border border-[var(--color-border)] p-4"
                >
                  <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
                    {section.label}
                  </h3>
                  <div className="space-y-3">
                    {section.fields.map((field) => (
                      <div key={field.key}>
                        <label className="mb-1 block text-[11px] font-medium text-[var(--color-text-secondary)]">
                          {field.label}
                        </label>
                        <textarea
                          rows={2}
                          value={state.nonFinancial[section.key]?.[field.key] ?? ""}
                          onChange={(e) =>
                            setNonFinancial(section.key, field.key, e.target.value)
                          }
                          className="w-full resize-y rounded-md border border-input bg-transparent px-2.5 py-1.5 text-xs leading-relaxed focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
                          placeholder="--"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <p className="text-[11px] text-muted-foreground">
          ※ 業種平均は中小企業実態基本調査・TKC経営指標を参考にした概算値です。入力データは
          ブラウザに保存されます (顧問先単位)。
        </p>
      </div>
    </DashboardShell>
  );
}
