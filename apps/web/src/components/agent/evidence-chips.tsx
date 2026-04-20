"use client";

import { Database, Gauge, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Confidence } from "@/lib/agent-voice";

interface EvidenceChipsProps {
  /** 根拠データ: どのソース・いつの数値か */
  source?: string | null;
  /** 信頼度 */
  confidence?: Confidence | null;
  /** 前提条件 */
  premise?: string | null;
  className?: string;
}

/**
 * エージェント出力に必ず同梱する「根拠・信頼度・前提」の3点セット。
 * 1行で表示。未指定項目は非表示。
 */
export function EvidenceChips({
  source,
  confidence,
  premise,
  className,
}: EvidenceChipsProps) {
  if (!source && !confidence && !premise) return null;

  return (
    <div
      className={cn(
        "mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground",
        className,
      )}
    >
      {source && (
        <span className="inline-flex items-center gap-1">
          <Database className="h-2.5 w-2.5" />
          根拠: {source}
        </span>
      )}
      {confidence && (
        <span
          className={cn(
            "inline-flex items-center gap-1",
            confidenceColor(confidence),
          )}
        >
          <Gauge className="h-2.5 w-2.5" />
          信頼度: {confidenceLabel(confidence)}
        </span>
      )}
      {premise && (
        <span className="inline-flex items-center gap-1">
          <Info className="h-2.5 w-2.5" />
          前提: {premise}
        </span>
      )}
    </div>
  );
}

/** 「提案」「ドラフト」「推定」などのラベルバッジ */
export function AgentLabel({
  kind,
  className,
}: {
  kind: "提案" | "ドラフト" | "推定" | "仮" | "要確認" | "データ未連携";
  className?: string;
}) {
  const cls = {
    提案: "border-[var(--color-info)]/40 bg-[#e1f5fe] text-[var(--color-info)]",
    ドラフト:
      "border-[var(--color-info)]/40 bg-[#e1f5fe] text-[var(--color-info)]",
    推定: "border-[var(--color-warning)]/40 bg-[#fff4e5] text-[var(--color-warning)]",
    仮: "border-gray-300 bg-gray-50 text-gray-600",
    要確認:
      "border-[var(--color-warning)]/40 bg-[#fff4e5] text-[var(--color-warning)]",
    "データ未連携": "border-gray-300 bg-gray-50 text-gray-600",
  }[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium",
        cls,
        className,
      )}
    >
      {kind}
    </span>
  );
}

function confidenceColor(c: Confidence): string {
  switch (c) {
    case "HIGH":
      return "text-[var(--color-success)]";
    case "MEDIUM":
      return "text-[var(--color-text-primary)]";
    case "LOW":
      return "text-[var(--color-warning)]";
  }
}

function confidenceLabel(c: Confidence): string {
  switch (c) {
    case "HIGH":
      return "高";
    case "MEDIUM":
      return "中";
    case "LOW":
      return "低";
  }
}
