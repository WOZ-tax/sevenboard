"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Flame,
  Calendar,
  ClipboardList,
  Archive,
  ArrowRight,
  RefreshCcw,
  Users,
} from "lucide-react";
import { useAuthStore } from "@/lib/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { LucideIcon } from "lucide-react";
import { EvidenceChips, AgentLabel } from "@/components/agent/evidence-chips";
import { AGENTS, type AgentKey } from "@/lib/agent-voice";
import { CopilotOpenButton } from "@/components/copilot/copilot-open-button";
import { ActionizeButton } from "@/components/ui/actionize-button";

/* ---------- types ---------- */

type Bucket = "URGENT" | "THIS_WEEK" | "MONTHLY" | "NOISE";
type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
type Source = "ACTION" | "ALERT" | "DATA_SYNC" | "BUSINESS_EVENT";

interface Signal {
  id: string;
  source: Source;
  bucket: Bucket;
  title: string;
  description: string;
  severity: Severity;
  agentOwner: AgentKey;
  reason: string;
  evidenceSource: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  linkHref?: string;
  detectedAt: string;
  refId?: string;
}

/* ---------- bucket config ---------- */

const bucketConfig: Record<
  Bucket,
  {
    label: string;
    sub: string;
    icon: LucideIcon;
    bg: string;
    border: string;
    text: string;
    accent: string;
  }
> = {
  URGENT: {
    label: "今すぐ対応",
    sub: "CRITICAL / 期限超過 / 同期失敗",
    icon: Flame,
    bg: "bg-[#fce4ec]",
    border: "border-[var(--color-error)]/40",
    text: "text-[var(--color-error)]",
    accent: "bg-[var(--color-error)]",
  },
  THIS_WEEK: {
    label: "今週確認",
    sub: "HIGH / 期限1週間以内",
    icon: Calendar,
    bg: "bg-[#fff4e5]",
    border: "border-[var(--color-warning)]/40",
    text: "text-[var(--color-warning)]",
    accent: "bg-[var(--color-warning)]",
  },
  MONTHLY: {
    label: "月次で議論",
    sub: "MEDIUM / 構造的論点",
    icon: ClipboardList,
    bg: "bg-[#e1f5fe]",
    border: "border-[var(--color-info)]/40",
    text: "text-[var(--color-info)]",
    accent: "bg-[var(--color-info)]",
  },
  NOISE: {
    label: "ノイズ候補",
    sub: "LOW / 定常業務",
    icon: Archive,
    bg: "bg-gray-50",
    border: "border-gray-300",
    text: "text-gray-500",
    accent: "bg-gray-400",
  },
};

const severityConfig: Record<Severity, { label: string; cls: string }> = {
  CRITICAL: {
    label: "緊急",
    cls: "border-[var(--color-error)]/40 bg-[#fce4ec] text-[var(--color-error)]",
  },
  HIGH: {
    label: "高",
    cls: "border-[var(--color-warning)]/40 bg-[#fff4e5] text-[var(--color-warning)]",
  },
  MEDIUM: {
    label: "中",
    cls: "border-[var(--color-info)]/40 bg-[#e1f5fe] text-[var(--color-info)]",
  },
  LOW: { label: "低", cls: "border-gray-300 bg-gray-50 text-gray-600" },
  INFO: { label: "情報", cls: "border-gray-300 bg-gray-50 text-gray-500" },
};

const sourceLabels: Record<Source, string> = {
  ACTION: "Action",
  ALERT: "アラート",
  DATA_SYNC: "データ同期",
  BUSINESS_EVENT: "経営イベント",
};

/* ---------- mock fallback ---------- */

const mockData = {
  summary: {
    urgent: 2,
    thisWeek: 3,
    monthly: 2,
    noise: 1,
    total: 8,
    lastRunAt: new Date().toISOString(),
  },
  signals: [
    {
      id: "s1",
      source: "ACTION" as Source,
      bucket: "URGENT" as Bucket,
      title: "月次レビュー：貸倒引当金の妥当性確認",
      description: "売掛金残高増に伴い引当金見直しが必要",
      severity: "CRITICAL" as Severity,
      agentOwner: "auditor" as AgentKey,
      reason: "重要度CRITICALのため",
      evidenceSource: "Action: 月次レビュー · 作成 2026/04/05",
      confidence: "HIGH" as const,
      linkHref: "/actions",
      detectedAt: "2026-04-05T00:00:00Z",
    },
    {
      id: "s2",
      source: "ALERT" as Source,
      bucket: "URGENT" as Bucket,
      title: "ランウェイ危険水域",
      description: "ランウェイが3ヶ月です。早急な対策が必要です。",
      severity: "CRITICAL" as Severity,
      agentOwner: "sentinel" as AgentKey,
      reason: "アラート重要度がCRITICALのため",
      evidenceSource: "MFクラウド試算表 · 2026/04/20",
      confidence: "HIGH" as const,
      linkHref: "/alerts",
      detectedAt: "2026-04-20T08:00:00Z",
    },
    {
      id: "s3",
      source: "ACTION" as Source,
      bucket: "THIS_WEEK" as Bucket,
      title: "売掛金回収サイト短縮の打診（A社）",
      description: "DSOが前月比+8日",
      severity: "HIGH" as Severity,
      agentOwner: "sentinel" as AgentKey,
      reason: "重要度HIGHのため",
      evidenceSource: "Action: 資金繰り · 作成 2026/04/15",
      confidence: "HIGH" as const,
      linkHref: "/actions",
      detectedAt: "2026-04-15T00:00:00Z",
    },
    {
      id: "s4",
      source: "ACTION" as Source,
      bucket: "MONTHLY" as Bucket,
      title: "広告費予算の見直し",
      description: "Q4広告費が予算比+180%",
      severity: "MEDIUM" as Severity,
      agentOwner: "brief" as AgentKey,
      reason: "重要度MEDIUMで期限に余裕があるため",
      evidenceSource: "Action: 予実差異 · 作成 2026/04/16",
      confidence: "HIGH" as const,
      linkHref: "/actions",
      detectedAt: "2026-04-16T00:00:00Z",
    },
  ] as Signal[],
};

/* ---------- component ---------- */

export default function TriagePage() {
  const user = useAuthStore((s) => s.user);
  const orgId = user?.orgId || "";
  const queryClient = useQueryClient();

  const [activeBucket, setActiveBucket] = useState<Bucket | "ALL">("ALL");
  const [agentFilter, setAgentFilter] = useState<AgentKey | "ALL">("ALL");

  const { data, isFetching } = useQuery({
    queryKey: ["triage", orgId],
    queryFn: () => api.triage.classify(orgId),
    enabled: !!orgId,
    refetchInterval: 120_000,
  });

  const payload = data ?? mockData;
  const signals = payload.signals as Signal[];
  const summary = payload.summary;

  const filteredSignals = useMemo(() => {
    let list = signals;
    if (activeBucket !== "ALL")
      list = list.filter((s) => s.bucket === activeBucket);
    if (agentFilter !== "ALL")
      list = list.filter((s) => s.agentOwner === agentFilter);
    return list;
  }, [signals, activeBucket, agentFilter]);

  const handleReclassify = () => {
    queryClient.invalidateQueries({ queryKey: ["triage", orgId] });
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
                AIトリアージ
              </h1>
              <Badge variant="outline" className="text-[10px]">
                司令塔
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              アラート・Action・データ鮮度の信号を4バケツに分類。担当エージェントが分類理由を提示します。
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              最終実行 {formatRelative(summary.lastRunAt)} · 検出{summary.total}件
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/triage/clients">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Users className="h-4 w-4" />
                顧問先トリアージ
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReclassify}
              disabled={isFetching}
              className="gap-1.5"
            >
              <RefreshCcw
                className={cn("h-4 w-4", isFetching && "animate-spin")}
              />
              再分類
            </Button>
          </div>
        </div>

        {/* 4 bucket summary */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(
            [
              { key: "URGENT" as Bucket, count: summary.urgent },
              { key: "THIS_WEEK" as Bucket, count: summary.thisWeek },
              { key: "MONTHLY" as Bucket, count: summary.monthly },
              { key: "NOISE" as Bucket, count: summary.noise },
            ]
          ).map(({ key, count }) => {
            const cfg = bucketConfig[key];
            const isActive = activeBucket === key;
            return (
              <button
                key={key}
                onClick={() =>
                  setActiveBucket(isActive ? "ALL" : key)
                }
                className={cn(
                  "rounded-lg border-2 p-4 text-left transition-all",
                  cfg.border,
                  cfg.bg,
                  isActive && "ring-2 ring-offset-2",
                  isActive && cfg.text.replace("text-", "ring-"),
                )}
              >
                <div className="flex items-center justify-between">
                  <cfg.icon className={cn("h-5 w-5", cfg.text)} />
                  <span className={cn("text-2xl font-bold", cfg.text)}>
                    {count}
                  </span>
                </div>
                <div
                  className={cn(
                    "mt-2 text-sm font-semibold",
                    cfg.text,
                  )}
                >
                  {cfg.label}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {cfg.sub}
                </div>
              </button>
            );
          })}
        </div>

        {/* agent filter */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground">エージェント:</span>
          <button
            onClick={() => setAgentFilter("ALL")}
            className={cn(
              "rounded-full border px-3 py-1 transition-colors",
              agentFilter === "ALL"
                ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                : "border-gray-300 hover:bg-muted",
            )}
          >
            すべて
          </button>
          {(Object.keys(AGENTS) as AgentKey[]).map((key) => {
            const a = AGENTS[key];
            const AIcon = a.icon;
            const active = agentFilter === key;
            return (
              <button
                key={key}
                onClick={() => setAgentFilter(active ? "ALL" : key)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1 transition-colors",
                  active
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                    : "border-gray-300 hover:bg-muted",
                )}
                title={a.summary}
              >
                <AIcon className="h-3 w-3" />
                {a.roleName}
              </button>
            );
          })}
        </div>

        {/* signal list */}
        <Card>
          <CardContent className="p-0">
            {filteredSignals.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                該当する信号はありません
              </div>
            ) : (
              <ul className="divide-y">
                {filteredSignals.map((signal) => (
                  <SignalRow key={signal.id} signal={signal} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

/* ---------- sub-components ---------- */

function SignalRow({ signal }: { signal: Signal }) {
  const bucket = bucketConfig[signal.bucket];
  const sev = severityConfig[signal.severity];
  const agent = AGENTS[signal.agentOwner];
  const AgentIcon = agent.icon;

  return (
    <li className="flex items-start gap-3 p-4">
      <span
        className={cn("mt-1 h-8 w-1 shrink-0 rounded-full", bucket.accent)}
        title={bucket.label}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
            {signal.title}
          </h3>
          <Badge variant="outline" className={cn("text-[10px]", sev.cls)}>
            {sev.label}
          </Badge>
          <Badge
            variant="outline"
            className="text-[10px] border-gray-300 bg-white gap-1"
          >
            <AgentIcon className="h-2.5 w-2.5" />
            {agent.roleName}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {sourceLabels[signal.source]}
          </Badge>
          {signal.source !== "ACTION" && (
            <AgentLabel kind="提案" />
          )}
        </div>
        {signal.description && (
          <p className="mt-1 text-xs text-muted-foreground whitespace-pre-line">
            {signal.description}
          </p>
        )}
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          <span className="font-medium">分類理由:</span> {signal.reason}
        </div>
        <EvidenceChips
          source={signal.evidenceSource}
          confidence={signal.confidence}
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <CopilotOpenButton
          agentKey={signal.agentOwner}
          mode="dialog"
          size="xs"
          iconOnly
          label="Copilotで深掘り"
          seed={buildSignalSeed(signal)}
        />
        {signal.source !== "ACTION" &&
          (signal.bucket === "URGENT" || signal.bucket === "THIS_WEEK") && (
            <ActionizeButton
              sourceScreen={
                signal.source === "ALERT"
                  ? "ALERTS"
                  : signal.source === "DATA_SYNC"
                    ? "DASHBOARD"
                    : "DASHBOARD"
              }
              sourceRef={{
                signalId: signal.id,
                bucket: signal.bucket,
                source: signal.source,
                from: "triage",
              }}
              defaultTitle={signal.title}
              defaultDescription={`${signal.description || ""}\n分類理由: ${signal.reason}`.trim()}
              defaultSeverity={
                signal.severity === "CRITICAL"
                  ? "CRITICAL"
                  : signal.severity === "HIGH"
                    ? "HIGH"
                    : signal.severity === "MEDIUM"
                      ? "MEDIUM"
                      : "LOW"
              }
              defaultOwnerRole="ADVISOR"
              size="sm"
            />
          )}
        {signal.linkHref && (
          <Link href={signal.linkHref}>
            <Button variant="ghost" size="sm" className="gap-1 text-xs">
              詳細
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        )}
      </div>
    </li>
  );
}

function buildSignalSeed(signal: Signal): string {
  const lines = [
    `以下のシグナルを深掘りしてください。`,
    ``,
    `■ 事象: ${signal.title}`,
    signal.description ? `■ 概要: ${signal.description}` : "",
    `■ 分類理由: ${signal.reason}`,
    `■ 根拠: ${signal.evidenceSource} / 信頼度: ${signal.confidence}`,
    ``,
    `妥当性・前提条件・推奨アクションをドラフトで整理してください。`,
  ];
  return lines.filter(Boolean).join("\n");
}

function formatRelative(iso: string): string {
  const now = new Date();
  const past = new Date(iso);
  const diffMs = now.getTime() - past.getTime();
  const mins = Math.floor(diffMs / (1000 * 60));
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

