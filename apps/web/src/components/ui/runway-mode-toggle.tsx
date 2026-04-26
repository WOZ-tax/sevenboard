"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { RunwayMode } from "@/lib/mf-types";

const STORAGE_KEY = "sevenboard:runway-mode:v2";
const DEFAULT_MODE: RunwayMode = "netBurn";

const MODES: Array<{
  key: RunwayMode;
  label: string;
  hint: string;
}> = [
  {
    key: "netBurn",
    label: "Net Burn",
    hint: "PL経常損益ベースの構造的な事業消費。過年度AR回収などの一時入金は除外",
  },
  {
    key: "actual",
    label: "Actual",
    hint: "BS現預金純減に財務ネット（流入プラス/流出マイナス）を加えた実消費",
  },
  {
    key: "worstCase",
    label: "Gross Burn",
    hint: "営業現金支出のみ。売上回収が止まった場合の保守的な見方",
  },
];

export function useRunwayMode(): [RunwayMode, (m: RunwayMode) => void] {
  const [mode, setModeState] = useState<RunwayMode>(DEFAULT_MODE);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY) as RunwayMode | null;
    if (saved === "worstCase" || saved === "netBurn" || saved === "actual") {
      setModeState(saved);
    }
  }, []);
  const setMode = (m: RunwayMode) => {
    setModeState(m);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, m);
    }
  };
  return [mode, setMode];
}

interface Props {
  mode: RunwayMode;
  onChange: (m: RunwayMode) => void;
  className?: string;
}

export function RunwayModeToggle({ mode, onChange, className }: Props) {
  return (
    <div
      className={cn(
        "inline-flex overflow-hidden rounded-md border border-input",
        className,
      )}
    >
      {MODES.map((m) => {
        const active = mode === m.key;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onChange(m.key)}
            title={m.hint}
            className={cn(
              "h-7 border-r border-input px-2.5 text-[11px] font-medium transition-colors last:border-r-0",
              active
                ? "bg-[var(--color-primary)] text-white"
                : "bg-background text-[var(--color-text-secondary)] hover:bg-muted",
            )}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

/** モードからvariantを安全に取り出すヘルパー */
export function pickRunwayVariant<
  T extends {
    months: number;
    cashBalance?: number;
    monthlyBurnRate?: number;
    alertLevel: "SAFE" | "CAUTION" | "WARNING" | "CRITICAL";
    variants?: {
      worstCase?: { months: number; basis: number; alertLevel: "SAFE" | "CAUTION" | "WARNING" | "CRITICAL" };
      netBurn?: { months: number; basis: number; alertLevel: "SAFE" | "CAUTION" | "WARNING" | "CRITICAL" };
      actual?: { months: number; basis: number; alertLevel: "SAFE" | "CAUTION" | "WARNING" | "CRITICAL" };
    };
  },
>(runway: T | undefined | null, mode: RunwayMode) {
  if (!runway) return null;
  const v = runway.variants?.[mode];
  if (v) return v;
  // 後方互換: variants が無い古いレスポンスでは既存値を返す
  return {
    months: runway.months,
    basis: runway.monthlyBurnRate ?? 0,
    alertLevel: runway.alertLevel,
  };
}
