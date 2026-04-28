"use client";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CashflowTable } from "@/components/cashflow/cashflow-table";
import { CashflowChart } from "@/components/cashflow/cashflow-chart";
import { Shield, Link2, RefreshCw } from "lucide-react";
import { PrintButton } from "@/components/ui/print-button";
import { cn } from "@/lib/utils";
import { formatYen } from "@/lib/format";
import { useMfCashflow, useMfOffice } from "@/hooks/use-mf-data";
import { AgentBanner } from "@/components/agent/agent-banner";
import { AGENTS } from "@/lib/agent-voice";
import { CopilotOpenButton } from "@/components/copilot/copilot-open-button";
import { ActionizeButton } from "@/components/ui/actionize-button";
import { Button } from "@/components/ui/button";
import { MfEmptyState } from "@/components/ui/mf-empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { SentinelCard } from "@/components/dashboard/sentinel-card";
import { api, isMfNotConnected } from "@/lib/api";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";
import {
  PeriodSegmentControl,
  usePeriodRange,
} from "@/components/ui/period-segment-control";
import { useScopedOrgId } from "@/hooks/use-scoped-org-id";
import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_CERTAINTY_RULES,
  type CertaintyLevel,
} from "@/lib/cashflow-certainty";
import {
  RunwayModeToggle,
  useRunwayMode,
  pickRunwayVariant,
} from "@/components/ui/runway-mode-toggle";

const alertLevelConfig = {
  SAFE: {
    card: "border-l-green-500",
    color: "bg-green-100 text-green-700 border-green-300",
    dot: "bg-green-500",
    label: "安全",
    description: "ランウェイ12か月以上。現時点で資金繰りに大きな懸念はありません。",
  },
  CAUTION: {
    card: "border-l-yellow-500",
    color: "bg-yellow-100 text-yellow-700 border-yellow-300",
    dot: "bg-yellow-500",
    label: "警戒",
    description: "ランウェイ6〜12か月。キャッシュイン施策と支出抑制の検討を推奨します。",
  },
  WARNING: {
    card: "border-l-orange-500",
    color: "bg-orange-100 text-orange-700 border-orange-300",
    dot: "bg-orange-500",
    label: "注意",
    description: "ランウェイ3〜6か月。早期の入金前倒し・支出繰延・融資検討が必要です。",
  },
  CRITICAL: {
    card: "border-l-red-500",
    color: "bg-red-100 text-red-700 border-red-300",
    dot: "bg-red-500",
    label: "危険",
    description: "ランウェイ3か月未満。緊急の資金調達策を直ちに実行してください。",
  },
} as const;

type AlertLevelKey = keyof typeof alertLevelConfig;

export default function CashflowPage() {
  const mfCashflow = useMfCashflow();
  const office = useMfOffice();
  const { fiscalYear, month, periods } = usePeriodStore();
  const periodLabel = getPeriodLabel(fiscalYear, month, periods);
  const { isMonthInRange } = usePeriodRange();
  const orgId = useScopedOrgId();

  const certaintyQuery = useQuery({
    queryKey: ["cashflow-certainty", orgId],
    queryFn: () => api.cashflowCertainty.get(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const runwayData = mfCashflow.data?.runway ?? null;
  const [runwayMode, setRunwayMode] = useRunwayMode();
  const variant = pickRunwayVariant(runwayData, runwayMode);
  const mfNotConnected = isMfNotConnected(mfCashflow.error);
  const isError = mfCashflow.isError && !mfNotConnected;
  const isLoading = mfCashflow.isLoading;

  const alertKey: AlertLevelKey =
    variant && variant.alertLevel in alertLevelConfig
      ? (variant.alertLevel as AlertLevelKey)
      : "SAFE";
  const config = alertLevelConfig[alertKey];

  const basisLabel: Record<typeof runwayMode, string> = {
    netBurn: "Net Burn（構造的損失）",
    worstCase: "Gross Burn（営業支出のみ）",
    actual: "Actual（BS純減＋財務ネット）",
  };

  const certaintyLevels: Record<string, CertaintyLevel> | undefined = mfCashflow.data
    ? {
        ...DEFAULT_CERTAINTY_RULES,
        ...(certaintyQuery.data?.rules ?? {}),
      }
    : undefined;

  const bannerStatus = mfNotConnected
    ? "idle"
    : isError
      ? "alert"
      : variant
        ? variant.alertLevel === "CRITICAL" || variant.alertLevel === "WARNING"
          ? "alert"
          : "ok"
        : "unknown";

  const lastFetchedAt = mfCashflow.dataUpdatedAt
    ? new Date(mfCashflow.dataUpdatedAt).toLocaleString("ja-JP")
    : null;

  return (
    <DashboardShell>
      <div className="space-y-4">
        {/* 印刷専用ヘッダー */}
        <div className="print-only" data-print-block>
          <h1 className="text-xl font-bold">資金繰り報告書</h1>
          <div className="mt-1 text-sm">
            {office.data?.name || "—"} — {periodLabel || "期間未指定"}
          </div>
          <div className="mt-0.5 text-xs text-gray-600">
            出力日: {new Date().toLocaleDateString("ja-JP")}
          </div>
          <hr className="mt-2" />
        </div>

        <div className="flex items-center justify-between screen-only">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
              資金繰り
            </h1>
            <p className="text-sm text-muted-foreground">
              {periodLabel ? `${periodLabel} ` : ""}月次推移と資金残高予測
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => mfCashflow.refetch()}
              disabled={mfCashflow.isFetching}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", mfCashflow.isFetching && "animate-spin")} />
              再取得
            </Button>
            <PrintButton />

          </div>
        </div>

        <PeriodSegmentControl />

        <div className="screen-only">
          <AgentBanner
            agent={AGENTS.sentinel}
            status={bannerStatus}
            detectionCount={
              variant && (variant.alertLevel === "CRITICAL" || variant.alertLevel === "WARNING")
                ? 1
                : 0
            }
            lastUpdatedAt={mfCashflow.dataUpdatedAt ? new Date(mfCashflow.dataUpdatedAt).toISOString() : new Date().toISOString()}
            actions={
              <CopilotOpenButton
                agentKey="sentinel"
                mode="dialog"
                seed="現在の資金リスクと、想定される枯渇予兆・推奨アクションをドラフトで整理してください。"
              />
            }
          />
        </div>

        <div className="screen-only">
          <SentinelCard />
        </div>

        {isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        ) : mfNotConnected ? (
          <MfEmptyState />
        ) : isError ? (
          <QueryErrorState onRetry={() => mfCashflow.refetch()} />
        ) : !runwayData || !variant ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              資金繰りデータが取得できませんでした。MF推移表の期間設定を確認してください。
            </CardContent>
          </Card>
        ) : (
          <Card className={cn("border-l-4", config.card)}>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium text-[var(--color-text-primary)]">
                  ランウェイ計算方式
                </div>
                <RunwayModeToggle mode={runwayMode} onChange={setRunwayMode} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Shield className="h-10 w-10 text-[var(--color-text-primary)]" />
                  <div>
                    <div className="text-sm text-muted-foreground">
                      ランウェイ（想定月数）
                    </div>
                    <div className="text-3xl font-bold text-[var(--color-text-primary)] font-[family-name:var(--font-inter)]">
                      {variant.months >= 999 ? (
                        <>∞</>
                      ) : (
                        <>
                          {variant.months.toFixed(1)}
                          <span className="ml-1 text-base font-normal text-muted-foreground">
                            か月
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge className={cn("border px-3 py-1 text-sm", config.color)}>
                    <span
                      className={cn("mr-2 inline-block h-2 w-2 rounded-full", config.dot)}
                    />
                    {config.label}
                  </Badge>
                  <div className="space-y-0.5 text-right text-xs text-muted-foreground">
                    <div>現預金残高: {formatYen(runwayData.cashBalance)}</div>
                    <div>{basisLabel[runwayMode]}: {formatYen(variant.basis)}</div>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {config.description}
              </p>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Link2 className="h-3 w-3" />
                  MFクラウド連携
                </span>
                {lastFetchedAt && <span>最終取得: {lastFetchedAt}</span>}
              </div>
              {(variant.alertLevel === "CRITICAL" ||
                variant.alertLevel === "WARNING" ||
                variant.alertLevel === "CAUTION") && (
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                  <ActionizeButton
                    sourceScreen="CASHFLOW"
                    sourceRef={{
                      alertLevel: variant.alertLevel,
                      runwayMonths: variant.months,
                      runwayMode,
                      kind: "runway",
                    }}
                    defaultTitle={`資金繰りリスク対応（ランウェイ${variant.months.toFixed(1)}か月・${basisLabel[runwayMode]}基準）`}
                    defaultDescription={`ランウェイ警戒レベル: ${config.label}（${basisLabel[runwayMode]}基準）。現預金${formatYen(runwayData.cashBalance)} / ${basisLabel[runwayMode]}${formatYen(variant.basis)}。対応策（入金前倒し・支出繰延・融資）を検討。`}
                    defaultSeverity={
                      variant.alertLevel === "CRITICAL"
                        ? "CRITICAL"
                        : variant.alertLevel === "WARNING"
                          ? "HIGH"
                          : "MEDIUM"
                    }
                    defaultOwnerRole="EXECUTIVE"
                    size="sm"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {runwayData?.composition && <BurnCompositionCard composition={runwayData.composition} />}

        {!mfNotConnected && !isError && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
                  月次資金繰り表
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="h-8 animate-pulse rounded bg-muted" />
                    ))}
                  </div>
                ) : (
                  <CashflowTable
                    months={mfCashflow.data?.months}
                    rows={mfCashflow.data?.rows}
                    certaintyLevels={certaintyLevels}
                    isMonthInRange={isMonthInRange}
                  />
                )}
              </CardContent>
            </Card>

            <CashflowChart
              months={mfCashflow.data?.months}
              cashBalances={mfCashflow.data?.cashBalances}
              burnRate={variant?.basis}
              burnLabel={basisLabel[runwayMode]}
              currentMonth={month}
            />
          </>
        )}
      </div>
    </DashboardShell>
  );
}

function BurnCompositionCard({ composition }: { composition: NonNullable<NonNullable<ReturnType<typeof useMfCashflow>['data']>['runway']['composition']> }) {
  const { netBurn, actualBurn, financingNet, realBalanceDrop, otherWorkingCapital } =
    composition;
  const lockedMonth = usePeriodStore((s) => s.month);

  const formatSigned = (n: number) => {
    if (n === 0) return "¥0";
    const sign = n > 0 ? "−" : "+"; // バーン視点で n>0 は現金流出
    return `${sign}${formatYen(Math.abs(n))}`;
  };

  return (
    <Card className="border-l-4 border-l-[var(--color-secondary)]">
      <CardContent className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">
            Net Burn と実 Cash Burn の乖離内訳（直近3ヶ月平均）
          </div>
          <div className="text-xs text-muted-foreground">
            対象月: {lockedMonth ? `${lockedMonth}月末時点` : "全期間"}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Net Burn → Actual Burn */}
          <div className="rounded-md border border-[var(--color-border)] bg-muted/20 p-3">
            <div className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">
              Net Burn → Actual Burn
            </div>
            <Row label="Net Burn（構造的損失）" value={formatSigned(netBurn)} bold />
            <Row
              label="± AR回収・前受金取崩し・税/CAPEX等"
              value={formatSigned(otherWorkingCapital)}
              muted={otherWorkingCapital === 0}
            />
            <div className="mt-1 border-t border-[var(--color-border)] pt-1">
              <Row label="＝ Actual Burn" value={formatSigned(actualBurn)} bold />
            </div>
          </div>

          {/* Actual Burn → 実残高変動 */}
          <div className="rounded-md border border-[var(--color-border)] bg-muted/20 p-3">
            <div className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">
              Actual Burn → BS実残高変動
            </div>
            <Row label="Actual Burn" value={formatSigned(actualBurn)} bold />
            <Row
              label="± 財務活動（借入・増資・返済）"
              value={formatSigned(-financingNet)}
              muted={financingNet === 0}
            />
            <div className="mt-1 border-t border-[var(--color-border)] pt-1">
              <Row label="＝ BS現預金純減" value={formatSigned(realBalanceDrop)} bold />
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Net Burn は経常損益に非資金費用を戻した構造的な事業消費。Actual
          Burn は BS 現預金の純減に財務ネット（流入プラス/流出マイナス）を加えた実消費です。過年度 AR
          回収や前受金取崩しで両者が乖離する場合は、差分に反映されます。
        </p>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-0.5 text-xs",
        bold && "font-semibold text-[var(--color-text-primary)]",
        !bold && "text-[var(--color-text-secondary)]",
        muted && "opacity-60",
      )}
    >
      <span>{label}</span>
      <span className="font-[family-name:var(--font-inter)] tabular-nums">{value}</span>
    </div>
  );
}
