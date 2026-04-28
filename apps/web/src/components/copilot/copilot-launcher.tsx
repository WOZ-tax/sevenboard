"use client";

import { Bot } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useCopilotStore } from "@/lib/copilot-store";

const STORAGE_KEY = "sevenboard:copilot-launcher-pos";
const DEFAULT_POS = { right: 24, bottom: 24 };
/** クリックとドラッグを区別する閾値（px） */
const DRAG_THRESHOLD = 4;

export function CopilotLauncher() {
  const open = useCopilotStore((s) => s.open);
  const setOpen = useCopilotStore((s) => s.setOpen);
  const [pos, setPos] = useState(DEFAULT_POS);
  const dragRef = useRef({
    startX: 0,
    startY: 0,
    startRight: 0,
    startBottom: 0,
    moved: false,
    pointerId: null as number | null,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (
        typeof parsed?.right === "number" &&
        typeof parsed?.bottom === "number"
      ) {
        setPos({ right: parsed.right, bottom: parsed.bottom });
      }
    } catch {
      // ignore corrupt value
    }
  }, []);

  if (open) return null;

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRight: pos.right,
      startBottom: pos.bottom,
      moved: false,
      pointerId: e.pointerId,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (!dragRef.current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    dragRef.current.moved = true;
    // right/bottom 基準なので、ポインタが右/下に動くほど値は小さくなる
    const rawRight = dragRef.current.startRight - dx;
    const rawBottom = dragRef.current.startBottom - dy;
    const maxRight = Math.max(0, window.innerWidth - 80);
    const maxBottom = Math.max(0, window.innerHeight - 60);
    setPos({
      right: Math.min(maxRight, Math.max(0, rawRight)),
      bottom: Math.min(maxBottom, Math.max(0, rawBottom)),
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // capture が既に外れている場合は無視
    }
    if (dragRef.current.moved) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
      } catch {
        // localStorage 不可は無視（プライベートモード等）
      }
    } else {
      setOpen(true);
    }
    dragRef.current.pointerId = null;
  };

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ right: pos.right, bottom: pos.bottom }}
      className={cn(
        "fixed z-40 flex touch-none select-none items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-primary)] px-4 py-2.5 text-sm text-white shadow-lg transition-shadow hover:shadow-xl",
      )}
      aria-label="Copilotを開く（ドラッグで移動可）"
      title="クリックで開く / ドラッグで移動"
    >
      <Bot className="h-4 w-4" />
      <span className="hidden sm:inline">Copilot</span>
    </button>
  );
}
