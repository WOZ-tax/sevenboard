"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, AlertTriangle, MessageSquare, RefreshCw, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  type: "alert" | "comment" | "sync" | "ai";
  title: string;
  time: string;
  read: boolean;
}

const mockNotifications: Notification[] = [
  { id: "1", type: "alert", title: "ランウェイが12ヶ月を下回りました", time: "5分前", read: false },
  { id: "2", type: "comment", title: "山田太郎がコメントを追加", time: "1時間前", read: false },
  { id: "3", type: "sync", title: "MFデータ同期が完了しました", time: "3時間前", read: true },
  { id: "4", type: "ai", title: "AIレポートが生成されました", time: "昨日", read: true },
];

const typeIcons = {
  alert: AlertTriangle,
  comment: MessageSquare,
  sync: RefreshCw,
  ai: Bot,
};

const typeColors = {
  alert: "text-[var(--color-error)]",
  comment: "text-[var(--color-primary)]",
  sync: "text-[var(--color-success)]",
  ai: "text-[var(--color-tertiary)]",
};

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = mockNotifications.filter((n) => !n.read).length;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setOpen(!open)}
      >
        <Bell className="h-5 w-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-negative)] text-[10px] text-white">
            {unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-3)]">
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">通知</h3>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {mockNotifications.map((n) => {
              const Icon = typeIcons[n.type];
              return (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
                    !n.read && "bg-[var(--color-primary)]/5"
                  )}
                >
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", typeColors[n.type])} />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", !n.read ? "font-medium text-[var(--color-text-primary)]" : "text-muted-foreground")}>
                      {n.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground/60">{n.time}</p>
                  </div>
                  {!n.read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-primary)]" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="border-t border-[var(--color-border)] px-4 py-2">
            <a
              href="/alerts"
              className="block text-center text-xs font-medium text-[var(--color-text-link)] hover:underline"
            >
              すべて見る
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
