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

import { useEffect, useMemo, useRef, useState } from "react";
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
import { useLocabenComparison } from "@/hooks/use-locaben-comparison";
import {
  useLocabenState,
  useLocabenStateMutation,
} from "@/hooks/use-year-end-state";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";
import {
  normalizeIndustry,
  INDUSTRIES,
  type IndustryCode,
} from "@/lib/industries";
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
import {
  computeLocabenMetrics,
  emptySourceData,
  type SourceData,
} from "@/lib/locaben/metrics";
import {
  COMPARISON_STYLES,
  legacyManualOverrides,
} from "@/lib/locaben/comparison";
import { ComparisonRadar } from "./_components/comparison-radar";
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

function mergeServerState(
  server: {
    industryOverride?: string | null;
    values?: Record<string, number | null>;
    nonFinancial?: Record<string, Record<string, string>>;
    manualKeys?: Record<string, true>;
  } | null,
): LocabenFormState {
  const base = emptyForm();
  if (!server) return base;
  return {
    industryOverride:
      (server.industryOverride as IndustryCode | null | undefined) ?? null,
    values: {
      ...base.values,
      ...(server.values ?? {}),
    } as LocabenFormState["values"],
    manualKeys: {
      ...(server.manualKeys ?? {}),
    } as LocabenFormState["manualKeys"],
    nonFinancial: NON_FINANCIAL_SECTIONS.reduce(
      (acc, s) => {
        acc[s.key] = {
          ...base.nonFinancial[s.key],
          ...((server.nonFinancial?.[s.key] as Record<string, string>) ?? {}),
        };
        return acc;
      },
      {} as Record<string, Record<string, string>>,
    ),
  };
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
  return (
    <DashboardShell>
      {currentOrg ? (
        <LocabenContent key={currentOrg.orgId} />
      ) : (
        <div className="mx-auto max-w-[1200px] p-6">
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              顧問先を選択してください。
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardShell>
  );
}

function LocabenContent() {
  const { currentOrg } = useCurrentOrg();
  const { fiscalYear, month, periods } = usePeriodStore();
  const periodLabel = getPeriodLabel(fiscalYear, month, periods);
  const orgId = currentOrg?.orgId ?? "";
  const orgName = currentOrg?.orgName ?? "(顧問先未選択)";
  const orgIndustry = normalizeIndustry(currentOrg?.industry);

  const comparison = useLocabenComparison(
    orgId,
    fiscalYear,
    month,
    periods.map((period) => period.fiscal_year),
  );
  const [editingIndex, setEditingIndex] = useState(0);
  const editingPeriod = comparison.periods[editingIndex];
  const mfFetchableKeys = new Set(
    SOURCE_DATA_KEYS.filter((key) => editingPeriod.mfData?.[key] != null),
  );

  const locabenQuery = useLocabenState();
  const locabenMutation = useLocabenStateMutation();
  const [state, setState] = useState<LocabenFormState>(() => emptyForm());
  const [hydrated, setHydrated] = useState(false);
  const [sharedDirty, setSharedDirty] = useState(false);
  const [sourceExpanded, setSourceExpanded] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 旧 LocalStorage クリーンアップ (DB 化後不要)
  useEffect(() => {
    if (typeof window === "undefined" || !orgId) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY_PREFIX + orgId);
    } catch {
      // ignore
    }
  }, [orgId]);

  // orgId 切替時に再 hydrate するためのリセット
  const lastHydratedOrgRef = useRef<string>("");
  useEffect(() => {
    if (lastHydratedOrgRef.current !== orgId) {
      lastHydratedOrgRef.current = orgId;
      setHydrated(false);
    }
  }, [orgId]);

  // サーバーから読み込み完了時に state へ反映 (orgId 毎に 1 回のみ)
  // 重要: hydrated gate がないと mutation→invalidate→refetch でループしてユーザー入力が消える
  useEffect(() => {
    if (hydrated) return;
    if (!locabenQuery.isSuccess) return;
    setState(mergeServerState(locabenQuery.data ?? null));
    setHydrated(true);
  }, [hydrated, locabenQuery.isSuccess, locabenQuery.data]);

  // 変更を debounce して DB に保存 (600ms)
  useEffect(() => {
    if (!hydrated || !orgId || !sharedDirty) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      locabenMutation.mutate({
        industryOverride: state.industryOverride,
        nonFinancial: state.nonFinancial,
      });
    }, 600);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- locabenMutation 安定参照
  }, [hydrated, orgId, state, sharedDirty]);

  const setSourceValue = (key: SourceDataKey, raw: string) => {
    const trimmed = raw.trim();
    const num =
      trimmed === ""
        ? null
        : Number.isFinite(Number(trimmed))
          ? Number(trimmed)
          : null;
    comparison.update(editingIndex, { ...editingPeriod.overrides, [key]: num });
  };

  const clearSourceValue = (key: SourceDataKey) => {
    const next = { ...editingPeriod.overrides };
    delete next[key];
    comparison.update(editingIndex, next);
  };

  const setIndustryOverride = (industry: IndustryCode | "auto") => {
    setSharedDirty(true);
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
    setSharedDirty(true);
    setState((prev) => ({
      ...prev,
      nonFinancial: {
        ...prev.nonFinancial,
        [sectionKey]: { ...prev.nonFinancial[sectionKey], [fieldKey]: value },
      },
    }));
  };

  const reset = () => {
    if (
      !confirm(
        `${editingPeriod.label}（${month ? `${month}月まで` : "通期"}）の手入力をクリアし、MF取得値に戻しますか？`,
      )
    )
      return;
    comparison.update(editingIndex, {});
  };

  const refetchMf = () => {
    void comparison.refetch();
  };

  const effectiveIndustry = state.industryOverride ?? orgIndustry;
  const benchmarks = useMemo(
    () => getBenchmarkFor(effectiveIndustry),
    [effectiveIndustry],
  );
  const periodMetrics = comparison.periods.map((period) =>
    computeLocabenMetrics(
      period.canCompare ? period.values : emptySourceData(),
    ),
  );
  const metrics = periodMetrics[editingIndex];
  const legacyInputs = legacyManualOverrides(locabenQuery.data);

  const handleExport = () => {
    downloadLocabenExcel({
      organizationName: orgName,
      industry: effectiveIndustry,
      periodLabel: `${editingPeriod.label}（${month ? `${month}月まで` : "通期"}）`,
      sourceData: editingPeriod.values,
      metrics,
      benchmarks,
      nonFinancial: state.nonFinancial,
      exportedAt: new Date(),
    });
  };

  const mfLoading = editingPeriod.isLoading;
  const mfFetching = comparison.periods.some((period) => period.isFetching);

  return (
    <div className="mx-auto max-w-[1200px] space-y-3 p-1 sm:p-6">
      {/* ヘッダー */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--color-text-primary)]">
            <Building2 className="h-6 w-6 text-[var(--color-primary)]" />
            ロカベン (ローカルベンチマーク)
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            経産省ロカベン。MF
            から元データを自動取得し、足りない項目だけ手入力。
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
            disabled={!editingPeriod.canEdit}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" /> この期の入力をリセット
          </Button>
          <Button
            size="sm"
            onClick={handleExport}
            disabled={!editingPeriod.canCompare}
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
            {
              Object.values(editingPeriod.values).filter((v) => v !== null)
                .length
            }
            /{SOURCE_DATA_KEYS.length} 入力済
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">業種:</span>
            <Select
              disabled={!hydrated}
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
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="元データを編集する期"
            >
              {comparison.periods.map((period, index) => (
                <button
                  key={index}
                  type="button"
                  disabled={!period.available}
                  aria-pressed={editingIndex === index}
                  onClick={() => setEditingIndex(index)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs disabled:opacity-40",
                    editingIndex === index
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5 font-semibold"
                      : "border-[var(--color-border)]",
                  )}
                >
                  <span style={{ color: COMPARISON_STYLES[index].color }}>
                    ●
                  </span>{" "}
                  {period.label}の元データ
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {editingPeriod.label}／{month ? `${month}月までの累計` : "通期"}
              を編集中。手入力は顧問先・年度・対象月ごとに保存されます。従業員数は各期の値を入力してください。
            </p>
            {editingPeriod.saveStatus === "pending" && (
              <p className="text-xs text-muted-foreground" role="status">
                保存中…
              </p>
            )}
            {editingPeriod.saveStatus === "saved" && (
              <p className="text-xs text-muted-foreground" role="status">
                保存済み
              </p>
            )}
            {editingPeriod.saveStatus === "error" && (
              <p className="text-xs text-red-600" role="alert">
                入力を保存できませんでした。
                <button
                  type="button"
                  className="ml-2 underline"
                  onClick={() =>
                    comparison.update(editingIndex, editingPeriod.overrides)
                  }
                >
                  保存を再試行
                </button>
              </p>
            )}
            {editingPeriod.isMfError && (
              <p role="alert" className="text-xs text-amber-700">
                この期のMFデータを取得できませんでした。「MF再取得」で再試行してください。
              </p>
            )}
            {editingPeriod.isSavedInputsError && (
              <p role="alert" className="text-xs text-amber-700">
                この期の保存済み入力を読み込めませんでした。入力内容の保護のため、読み込みが完了するまで編集を停止しています。
                <button
                  type="button"
                  className="ml-2 underline disabled:opacity-50"
                  disabled={editingPeriod.isFetching}
                  onClick={() => comparison.refetchSaved(editingIndex)}
                >
                  保存済み入力を再読込
                </button>
              </p>
            )}
            {!editingPeriod.hasSavedInputs &&
              editingPeriod.canEdit &&
              Object.keys(legacyInputs).length > 0 && (
                <details className="rounded-md border border-[var(--color-border)] p-3 text-xs">
                  <summary className="cursor-pointer font-medium">
                    以前の手入力を確認して、この期に引き継ぐ
                  </summary>
                  <p className="mt-2 text-muted-foreground">
                    以前の入力には対象期の記録がないため、内容と年度を確認して反映してください。
                  </p>
                  <ul className="my-2 space-y-1">
                    {SOURCE_DATA_FIELDS.filter((field) =>
                      Object.hasOwn(legacyInputs, field.key),
                    ).map((field) => (
                      <li key={field.key}>
                        {field.label}:{" "}
                        {formatNumber(legacyInputs[field.key] ?? null)}{" "}
                        {field.unit}
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      comparison.update(editingIndex, {
                        ...legacyInputs,
                        ...editingPeriod.overrides,
                      })
                    }
                  >
                    {editingPeriod.label}の入力に反映
                  </Button>
                </details>
              )}
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
                      const v = editingPeriod.values[field.key];
                      const isManual = !!editingPeriod.manualKeys[field.key];
                      const hasMf = mfFetchableKeys.has(field.key);
                      const mfVal = editingPeriod.mfData?.[field.key];
                      // MF 値とユーザー値が「実際に異なる」 ときだけ「MF値に戻す」を出す
                      const differsFromMf = isManual && hasMf && mfVal !== v;
                      return (
                        <div
                          key={field.key}
                          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <label className="text-xs font-medium text-[var(--color-text-primary)]">
                              {field.label}
                            </label>
                            {differsFromMf ? (
                              <button
                                type="button"
                                onClick={() => clearSourceValue(field.key)}
                                className="text-[10px] text-[var(--color-primary)] hover:underline"
                                title="MFから取得した値に戻す"
                              >
                                MF値に戻す
                              </button>
                            ) : isManual && !hasMf ? (
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
                              aria-label={`${editingPeriod.label} ${field.label}`}
                              disabled={!editingPeriod.canEdit}
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
          <CardTitle className="text-base">
            財務6指標 ({editingPeriod.label}・自動計算)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            元データから自動算出。業種平均との差分が緑/赤で表示されます。
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="min-w-0 space-y-2 overflow-x-auto">
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
                  (k) => editingPeriod.values[k] === null,
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

            <ComparisonRadar
              periods={comparison.periods.map((period, index) => ({
                ...period,
                metrics: periodMetrics[index],
              }))}
              benchmarks={benchmarks}
              month={month}
            />
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
                        disabled={!hydrated}
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
        ※
        業種平均は中小企業実態基本調査・TKC経営指標を参考にした概算値です。入力データは
        顧問先ごとに共有保存されます。元データの手入力は年度・対象月別です。
      </p>
    </div>
  );
}
