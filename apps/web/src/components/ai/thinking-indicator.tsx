"use client";

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = [
  "MFデータ取得中",
  "業種知識を参照中",
  "AIが分析中",
  "論点を整理中",
];

/**
 * AI 生成中の「思考中」演出。
 * - ステージのテキストが ~1秒ごとに切り替わる
 * - 最後のステージに到達したらそこで止まる（応答が遅い場合は AI が分析中… でホールド）
 * - 点々アニメは常時動いてる
 */
export function ThinkingIndicator({ className }: { className?: string }) {
  const [stageIndex, setStageIndex] = useState(0);
  const [dots, setDots] = useState(0);

  useEffect(() => {
    if (stageIndex >= STAGES.length - 1) return;
    const t = setTimeout(() => setStageIndex((i) => i + 1), 900);
    return () => clearTimeout(t);
  }, [stageIndex]);

  useEffect(() => {
    const id = setInterval(() => {
      setDots((d) => (d + 1) % 4);
    }, 350);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border bg-muted/20 p-4",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-tertiary)]/10">
        <Bot className="h-5 w-5 animate-pulse text-[var(--color-tertiary)]" />
        <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-tertiary)]/20" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--color-text-primary)]">
          {STAGES[stageIndex]}
          {".".repeat(dots).padEnd(3, " ")}
        </div>
        <ol className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
          {STAGES.map((s, i) => (
            <li
              key={s}
              className={cn(
                "rounded px-1.5 py-0.5",
                i < stageIndex && "bg-emerald-100 text-emerald-700",
                i === stageIndex && "bg-[var(--color-tertiary)]/15 text-[var(--color-tertiary)]",
                i > stageIndex && "bg-muted text-muted-foreground/60",
              )}
            >
              {i < stageIndex ? "✓ " : ""}
              {s}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
