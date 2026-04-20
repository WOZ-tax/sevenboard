"use client";

import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCopilotStore } from "@/lib/copilot-store";

export function CopilotLauncher() {
  const open = useCopilotStore((s) => s.open);
  const setOpen = useCopilotStore((s) => s.setOpen);

  if (open) return null;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        "fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-primary)] px-4 py-2.5 text-sm text-white shadow-lg transition-all hover:shadow-xl",
      )}
      aria-label="Copilotを開く"
    >
      <Bot className="h-4 w-4" />
      <span className="hidden sm:inline">Copilot</span>
    </button>
  );
}
