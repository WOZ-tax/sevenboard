"use client";

import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCopilotStore, type CopilotMode } from "@/lib/copilot-store";
import type { AgentKey } from "@/lib/agent-voice";

interface CopilotOpenButtonProps {
  /** 明示指定しなければ現在画面のエージェントが自動選択される */
  agentKey?: AgentKey;
  /** 入力欄に初期投入する質問/内容 */
  seed?: string;
  /** デフォルトのモード */
  mode?: CopilotMode;
  /** 表示サイズ */
  size?: "xs" | "sm" | "default";
  /** アイコンのみ */
  iconOnly?: boolean;
  /** ラベル差し替え (default: "Copilotで深掘り") */
  label?: string;
  className?: string;
}

export function CopilotOpenButton({
  agentKey,
  seed,
  mode,
  size = "sm",
  iconOnly = false,
  label = "Copilotで深掘り",
  className,
}: CopilotOpenButtonProps) {
  const openWith = useCopilotStore((s) => s.openWith);

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={cn(
        "gap-1 border-[var(--color-border)] text-[var(--color-text-primary)]",
        size === "xs" && "h-6 px-2 text-[11px]",
        size === "sm" && "h-7 px-2 text-xs",
        className,
      )}
      onClick={() => openWith({ agentKey, seed, mode })}
    >
      <Bot className={size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {!iconOnly && label}
    </Button>
  );
}
