"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  AlertTriangle,
  MessageSquare,
  RefreshCw,
  Bot,
  Settings as SettingsIcon,
  CheckCheck,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";

type NotificationType =
  | "ANOMALY_ALERT"
  | "CASHFLOW_ALERT"
  | "SYNC_ERROR"
  | "AI_COMMENT"
  | "ADVISOR_COMMENT"
  | "SYSTEM";

const typeIcons: Record<NotificationType, typeof AlertTriangle> = {
  ANOMALY_ALERT: AlertTriangle,
  CASHFLOW_ALERT: AlertTriangle,
  SYNC_ERROR: RefreshCw,
  AI_COMMENT: Bot,
  ADVISOR_COMMENT: MessageSquare,
  SYSTEM: SettingsIcon,
};

const typeColors: Record<NotificationType, string> = {
  ANOMALY_ALERT: "text-[var(--color-error)]",
  CASHFLOW_ALERT: "text-[var(--color-error)]",
  SYNC_ERROR: "text-[var(--color-warning)]",
  AI_COMMENT: "text-[var(--color-tertiary)]",
  ADVISOR_COMMENT: "text-[var(--color-primary)]",
  SYSTEM: "text-muted-foreground",
};

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return "今";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}時間前`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}日前`;
  return new Date(iso).toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
  });
}

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const orgId = useAuthStore((s) => s.user?.orgId || "");
  const queryClient = useQueryClient();

  const unread = useQuery({
    queryKey: ["notifications-unread-count", orgId],
    queryFn: () => api.notifications.unreadCount(orgId),
    enabled: !!orgId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const list = useQuery({
    queryKey: ["notifications-list", orgId],
    queryFn: () => api.notifications.list(orgId, { limit: 30, days: 30 }),
    enabled: !!orgId && open,
    staleTime: 10_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.notifications.markRead(orgId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["notifications-list", orgId],
      });
      queryClient.invalidateQueries({
        queryKey: ["notifications-unread-count", orgId],
      });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api.notifications.markAllRead(orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["notifications-list", orgId],
      });
      queryClient.invalidateQueries({
        queryKey: ["notifications-unread-count", orgId],
      });
    },
  });

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

  const unreadCount = unread.data?.count ?? 0;
  const items = list.data ?? [];

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
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-negative)] px-1 text-[10px] text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-96 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-3)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              通知
              {unreadCount > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  未読 {unreadCount}
                </span>
              )}
            </h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="inline-flex items-center gap-1 text-xs text-[var(--color-text-link)] hover:underline disabled:opacity-50"
              >
                {markAllRead.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCheck className="h-3 w-3" />
                )}
                すべて既読
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {list.isLoading ? (
              <div className="space-y-2 p-3">
                <div className="h-10 animate-pulse rounded bg-muted" />
                <div className="h-10 animate-pulse rounded bg-muted" />
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                通知はありません
              </p>
            ) : (
              items.map((n) => {
                const Icon = typeIcons[n.type as NotificationType] ?? Bell;
                const color =
                  typeColors[n.type as NotificationType] ??
                  "text-muted-foreground";
                const inner = (
                  <div
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
                      !n.isRead && "bg-[var(--color-primary)]/5",
                    )}
                  >
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", color)} />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm",
                          !n.isRead
                            ? "font-medium text-[var(--color-text-primary)]"
                            : "text-muted-foreground",
                        )}
                      >
                        {n.title}
                      </p>
                      {n.message && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {n.message}
                        </p>
                      )}
                      <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                        {relativeTime(n.createdAt)}
                      </p>
                    </div>
                    {!n.isRead && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-primary)]" />
                    )}
                  </div>
                );
                const onClick = () => {
                  if (!n.isRead) markRead.mutate(n.id);
                };
                return n.linkHref ? (
                  <Link
                    key={n.id}
                    href={n.linkHref}
                    onClick={() => {
                      onClick();
                      setOpen(false);
                    }}
                    className="block"
                  >
                    {inner}
                  </Link>
                ) : (
                  <button
                    key={n.id}
                    type="button"
                    onClick={onClick}
                    className="block w-full text-left"
                  >
                    {inner}
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-[var(--color-border)] px-4 py-2">
            <Link
              href="/alerts"
              onClick={() => setOpen(false)}
              className="block text-center text-xs font-medium text-[var(--color-text-link)] hover:underline"
            >
              アラート一覧を開く
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
