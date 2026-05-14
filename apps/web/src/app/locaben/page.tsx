"use client";

/**
 * ロカベン (経済産業省ローカルベンチマーク) ページ。
 *
 * 構造:
 *   1. 業種選択 (currentOrg.industry をデフォルト、ローカル上書き可)
 *   2. 元データ入力 (PL/BS/HR) — MF から自動取得、足りないものだけ手入力
 *   3. 6指標自動計算 + 業種平均比較レーダー
 *   4. 非財務4シート (経営者/関係者/事業/内部管理) を textarea で入力
 *   5. Excel ダウンロード
 *
 * 単位: 金額はすべて千円、人員は人。MF (円単位) は自動で千円に変換。
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
import {
  Download,
  Building2,
  RotateCcw,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentOrg } from "@/contexts/current-org";
import { useLocabenSourceData } from "@/hooks/use-mf-data";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";
import { normalizeIndustry, INDUSTRIES, type IndustryCode } from "@/lib/industries";
import {
  LOCABEN_METRICS,
  LOCABEN_METRIC_KEYS,
  METRIC_DEPENDENCIES,
  NON_FINANCIAL_SECTIONS,
  SOURCE_DATA_FIELDS,
  SOURCE_DATA_KEYS,
  SOURCE_GROUP_LABELS,
  getBenchmarkFor,
  type SourceDataGroup,
  type SourceDataKey,
} from "@/lib/locaben/constants";
import { computeLocabenMetrics, type SourceData } from "@/lib/locaben/metrics";
import { downloadLocabenExcel } from "@/lib/locaben/excel";
import { cn } from "@/lib/utils";

type LocabenFormState = {
  industryOverride: IndustryCode | null;
  values: SourceData;
  /** 各値が MF 自動取得か手入力かを区別。MF 値は上書きされうる */
  manualKeys: Partial<Record<SourceDataKey, true>>;
  nonFinancial: Record<string, Record<string, string>>;
};

const STORAGE_KEY_PREFIX = "sb_locaben_v2_";

function emptyForm(): LocabenFormState {
  const values = Object.fromEntries(
    SOURCE_DATA_KEYS.map((k) => [k, null]),
  ) as SourceData;
  const nonFinancial = Object.fromEntries(
    NON_FINANCIAL_SECTIONS.map((s) => [
      s.key,
      Object.fromEntries(s.fields.map((f) => [f.key, ""])),
    ]),
  );
  return {
    industryOverride: null,
    values,
    manualKeys: {},
    nonFinancial,
  };
}

function readStorage(orgId: string): LocabenFormState {
  if (typeof window === "undefined") return emptyForm();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + orgId);
    if (!raw) return emptyForm();
    const parsed = JSON.parse(raw) as Partial<LocabenFormState>;
    const base = emptyForm();
    return {
      industryOverride: parsed.industryOverride ?? null,
      values: { ...base.values, ...(parsed.values ?? {}) },
      manualKeys: { ...(parsed.manualKeys ?? {}) },
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

function formatNumber(v: number | null, digits = 1): string {
  if (v === null || !Number.isFinite(v)) return "--";
  return v.toLocaleString("ja-JP", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export default function LocabenPage() {
  const { currentOrg } = useCurrentOrg();
  const { fiscalYear, month, periods } = usePeriodStore();
  const periodLabel = getPeriodLabel(fiscalYear, month, periods);
  const orgId = currentOrg?.orgId ?? "";
  const orgName = currentOrg?.orgName ?? "(顧問先未選択)";
  const orgIndustry = normalizeIndustry(currentOrg?.industry);

  const sourceQuery = useLocabenSourceData();

  const mfExtracted = useMemo<Partial<SourceData>>(() => {
    const d = sourceQuery.data;
    if (!d) return {};
    const out: Partial<SourceData> = {};
    for (const k of SOURCE_DATA_KEYS) {
      const v = d[k];
      // 0 は「データなし」と区別がつかないので未取得扱い (要入力)
      if (v !== null && v !== undefined && Number.isFinite(v) && v !== 0) {
        out[k] = v;
      }
    }
    return out;
  }, [sourceQuery.data]);

  /** MF から取得可能な項目 (UI で「MF値に戻す」を表示する対象) */
  const mfFetchableKeys = useMemo(() => {
    const set = new Set<SourceDataKey>();
    for (const k of SOURCE_DATA_KEYS) {
      if (mfExtracted[k] !== undefined) set.add(k);
    }
    return set;
  }, [mfExtracted]);

  const [state, setState] = useState<LocabenFormState>(() => emptyForm());
  const [hydrated, setHydrated] = useState(false);
  const [sourceExpanded, setSourceExpanded] = useState(true);

  /* eslint-disable react-hooks/set-state-in-effect */

  // orgId 切替時に LocalStorage から読み直す
  useEffect(() => {
    if (!orgId) return;
    setState(readStorage(orgId));
    setHydrated(true);
  }, [orgId]);

  // MF から取った原データを「手入力されていない項目」だけ自動補完
  useEffect(() => {
    if (!hydrated) return;
    setState((prev) => {
      const next = { ...prev, values: { ...prev.values } };
      let changed = false;
      for (const key of SOURCE_DATA_KEYS) {
        if (prev.manualKeys[key]) continue;
        const mfVal = mfExtracted[key];
        if (mfVal !== undefined && mfVal !== null && mfVal !== prev.values[key]) {
          next.values[key] = mfVal;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [hydrated, mfExtracted]);

  /* eslint-enable react-hooks/set-state-in-effect */

  // 変更を LocalStorage に保存
  useEffect(() => {
    if (!hydrated || !orgId) return;
    writeStorage(orgId, state);
  }, [hydrated, orgId, state]);

  const setSourceValue = (key: SourceDataKey, raw: string) => {
    const trimmed = raw.trim();
    const num =
      trimmed === ""
        ? null
        : Number.isFinite(Number(trimmed))
          ? Number(trimmed)
          : null;
    setState((prev) => ({
      ...prev,
      values: { ...prev.values, [key]: num },
      manualKeys: { ...prev.manualKeys, [key]: true },
    }));
  };

  const clearSourceValue = (key: SourceDataKey) => {
    setState((prev) => {
      const nextManual = { ...prev.manualKeys };
      delete nextManual[key];
      const mfVal = mfExtracted[key];
      return {
        ...prev,
        // MF から取れる項目は MF 値に、取れない項目は null (空) に戻す
        values: { ...prev.values, [key]: mfVal ?? null },
        manualKeys: nextManual,
      };
    });
  };

  const setIndustryOverride = (industry: IndustryCode | "auto") => {
    setState((prev) => ({
      ...prev,
      industryOverride: industry === "auto" ? null : industry,
    }));
  };

  const setNonFinancial = (
    sectionKey: string,
    fieldKey: string,
    value: string,
  ) => {
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

  const refetchMf = () => {
    sourceQuery.refetch();
  };

  const effectiveIndustry = state.industryOverride ?? orgIndustry;
  const benchmarks = useMemo(
    () => getBenchmarkFor(effectiveIndustry),
    [effectiveIndustry],
  );
  const metrics = useMemo(
    () => computeLocabenMetrics(state.values),
    [state.values],
  );

  const handleExport = () => {
    downloadLocabenExcel({
      organizationName: orgName,
      industry: effectiveIndustry,
      periodLabel: periodLabel || "(期間未設定)",
      sourceData: state.values,
      metrics,
      benchmarks,
      nonFinancial: state.nonFinancial,
      exportedAt: new Date(),
    });
  };

  // レーダー (業種平均=100 として実績値を換算、0-200 でクリップ)
  const radarData = useMemo(() => {
    return LOCABEN_METRIC_KEYS.map((key) => {
      const def = LOCABEN_METRICS[key];
      const v = metrics[key];
      const b = benchmarks[key];
      let normalized = 0;
      if (v !== null && b !== 0) {
        const ratio = (v / b) * 100;
        normalized = def.higherIsBetter ? ratio : 200 - ratio;
      }
      return {
        metric: def.label,
        実績: Math.max(0, Math.min(200, normalized)),
        業種平均: 100,
      };
    });
  }, [metrics, benchmarks]);

  const mfLoading = sourceQuery.isLoading;
  const mfFetching = sourceQuery.isFetching;

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
      <div className="mx-auto max-w-[1200px] space-y-3 p-6">
        {/* ヘッダー */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--color-text-primary)]">
              <Building2 className="h-6 w-6 text-[var(--color-primary)]" />
              ロカベン (ローカルベンチマーク)
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              経産省ロカベン。MF から元データを自動取得し、足りない項目だけ手入力。
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="border-[var(--color-border)]">
                {orgName}
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
              onClick={refetchMf}
              disabled={mfFetching}
              className="gap-1.5"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", mfFetching && "animate-spin")}
              />
              MF再取得
            </Button>
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

        {/* 元データ入力 (業種選択もここに統合) */}
        <Card>
          <div className="flex flex-wrap items-center gap-3 px-6 py-3">
            <span className="text-base font-semibold text-[var(--color-text-primary)]">
              元データ
            </span>
            {mfLoading ? (
              <Badge variant="outline" className="text-[10px]">
                MFデータ取得中...
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                MF自動取得 (金額は千円)
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {Object.values(state.values).filter((v) => v !== null).length}/
              {SOURCE_DATA_KEYS.length} 入力済
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">業種:</span>
              <Select
                value={state.industryOverride ?? "auto"}
                onValueChange={(v) =>
                  v && setIndustryOverride(v as IndustryCode | "auto")
                }
              >
                <SelectTrigger className="h-8 w-60">
                  <SelectValue>
                    {(v) => {
                      if (v === "auto" || !v) {
                        return orgIndustry
                          ? `${orgIndustry} (顧問先設定)`
                          : "業種未設定";
                      }
                      return v as string;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    顧問先設定から: {orgIndustry ?? "未設定"}
                  </SelectItem>
                  {INDUSTRIES.map((ind) => (
                    <SelectItem key={ind} value={ind}>
                      {ind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button
              type="button"
              onClick={() => setSourceExpanded((s) => !s)}
              className="ml-auto rounded p-1 hover:bg-[var(--color-surface)]"
              aria-label={sourceExpanded ? "折りたたむ" : "展開する"}
            >
              {sourceExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </div>
          {sourceExpanded && (
            <CardContent className="space-y-3 pt-0">
              {(["pl", "bs", "hr"] as SourceDataGroup[]).map((group) => {
                const fields = SOURCE_DATA_FIELDS.filter(
                  (f) => f.group === group,
                );
                return (
                  <div key={group}>
                    <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {SOURCE_GROUP_LABELS[group]}
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {fields.map((field) => {
                        const v = state.values[field.key];
                        const isManual = !!state.manualKeys[field.key];
                        const hasMf = mfFetchableKeys.has(field.key);
                        return (
                          <div
                            key={field.key}
                            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
                          >
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <label className="text-xs font-medium text-[var(--color-text-primary)]">
                                {field.label}
                              </label>
                              {isManual && hasMf ? (
                                <button
                                  type="button"
                                  onClick={() => clearSourceValue(field.key)}
                                  className="text-[10px] text-[var(--color-primary)] hover:underline"
                                  title="MFから取得した値に戻す"
                                >
                                  MF値に戻す
                                </button>
                              ) : isManual ? (
                                <button
                                  type="button"
                                  onClick={() => clearSourceValue(field.key)}
                                  className="text-[10px] text-muted-foreground hover:underline"
                                  title="入力をクリア"
                                >
                                  クリア
                                </button>
                              ) : hasMf ? (
                                <span className="text-[10px] text-[var(--color-success)]">
                                  MF自動
                                </span>
                              ) : (
                                <span className="text-[10px] text-amber-600">
                                  要入力
                                </span>
                              )}
                            </div>
                            <div className="flex items-baseline gap-1.5">
                              <Input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                value={v ?? ""}
                                onChange={(e) =>
                                  setSourceValue(field.key, e.target.value)
                                }
                                placeholder="--"
                                className="h-8 flex-1 text-right tabular-nums"
                              />
                              <span className="text-[10px] text-muted-foreground">
                                {field.unit}
                              </span>
                            </div>
                            {field.hint && (
                              <div className="mt-0.5 text-[10px] text-muted-foreground">
                                {field.hint}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          )}
        </Card>

        {/* 6指標 + レーダー */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">財務6指標 (自動計算)</CardTitle>
            <p className="text-xs text-muted-foreground">
              元データから自動算出。業種平均との差分が緑/赤で表示されます。
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
              <div className="space-y-2">
                <div className="grid grid-cols-[1.4fr_1fr_1fr_0.9fr] gap-2 border-b border-[var(--color-border)] pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <div>指標</div>
                  <div>実績値</div>
                  <div>業種平均</div>
                  <div>差分</div>
                </div>
                {LOCABEN_METRIC_KEYS.map((key) => {
                  const def = LOCABEN_METRICS[key];
                  const v = metrics[key];
                  const b = benchmarks[key];
                  const diff = v !== null ? v - b : null;
                  const isGood =
                    diff === null
                      ? null
                      : def.higherIsBetter
                        ? diff >= 0
                        : diff <= 0;
                  const missing = METRIC_DEPENDENCIES[key].filter(
                    (k) => state.values[k] === null,
                  );
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
                        {v === null && missing.length > 0 && (
                          <div className="mt-0.5 text-[10px] text-amber-600">
                            要入力:{" "}
                            {missing
                              .map(
                                (k) =>
                                  SOURCE_DATA_FIELDS.find((f) => f.key === k)
                                    ?.label ?? k,
                              )
                              .join(" / ")}
                          </div>
                        )}
                      </div>
                      <div className="text-sm tabular-nums text-[var(--color-text-primary)]">
                        {formatNumber(v)}{" "}
                        <span className="text-[10px] text-muted-foreground">
                          {def.unit}
                        </span>
                      </div>
                      <div className="text-sm tabular-nums text-[var(--color-text-secondary)]">
                        {formatNumber(b)}{" "}
                        <span className="text-[10px] text-muted-foreground">
                          {def.unit}
                        </span>
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

              <div className="rounded-md border border-[var(--color-border)] p-3">
                <div className="mb-2 text-xs font-semibold text-[var(--color-text-primary)]">
                  業種平均との比較 (業種平均=100)
                </div>
                <div className="h-[340px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} outerRadius="70%">
                      <PolarGrid stroke="var(--color-border)" />
                      <PolarAngleAxis
                        dataKey="metric"
                        tick={{
                          fontSize: 10,
                          fill: "var(--color-text-secondary)",
                        }}
                      />
                      <PolarRadiusAxis
                        angle={90}
                        domain={[0, 200]}
                        tick={{
                          fontSize: 9,
                          fill: "var(--color-text-secondary)",
                        }}
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
                  外側ほど良好。「低いほど良い」指標は内部で反転表示。
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
                          value={
                            state.nonFinancial[section.key]?.[field.key] ?? ""
                          }
                          onChange={(e) =>
                            setNonFinancial(
                              section.key,
                              field.key,
                              e.target.value,
                            )
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
