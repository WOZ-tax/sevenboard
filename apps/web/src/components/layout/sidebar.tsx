"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ClipboardCheck,
  FileText,
  Wallet,
  Bot,
  Bell,
  Settings,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  Mic,
  FileBarChart,
  Gauge,
  CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAuthStore } from "@/lib/auth";
import { useSidebarConfig } from "@/lib/sidebar-config";
import { useFyElapsed } from "@/hooks/use-fy-elapsed";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const menuItems = [
  { label: "ダッシュボード", href: "/", icon: Home },
  { label: "月次レビュー", href: "/monthly-review", icon: ClipboardCheck },
  { label: "財務指標", href: "/indicators", icon: Gauge },
  { label: "AI CFOレポート", href: "/ai-report", icon: Bot },
  { label: "財務諸表", href: "/financial-statements", icon: FileText },
  { label: "資金繰り", href: "/cashflow", icon: Wallet },
  { label: "資金調達レポート", href: "/funding-report", icon: FileBarChart },
  { label: "変動損益", href: "/variable-cost", icon: TrendingDown },
  { label: "決算検討", href: "/year-end-review", icon: CalendarClock },
  { label: "トークスクリプト", href: "/talk-script", icon: Mic },
  { label: "アラート", href: "/alerts", icon: Bell },
  { label: "設定", href: "/settings", icon: Settings },
];

export { menuItems };

/** 期首から minMonths 経過するまで disabled にするメニューの href */
const GATED_HREFS: Record<string, { minMonths: number; reason: string }> = {
  "/year-end-review": {
    minMonths: 9,
    reason: "決算3ヶ月前から表示",
  },
};

export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { isHidden } = useSidebarConfig();
  const { elapsedMonths, remainingMonths, isReady } = useFyElapsed();
  // localhost / dev 環境ではゲートを無効化。Vercel production では NODE_ENV=production になる。
  const isDev =
    typeof process !== "undefined" && process.env.NODE_ENV === "development";

  const visibleMenus = menuItems.filter((item) => !isHidden(item.href));

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-[var(--color-primary)] text-white transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b border-white/15 px-4">
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight text-white">
            SevenBoard
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "rounded p-1 transition-colors hover:bg-white/5",
            collapsed && "mx-auto"
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto py-2">
        {visibleMenus.map((item) => {
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const gate = GATED_HREFS[item.href];
          const isLocked = !isDev && !!gate && isReady && elapsedMonths < gate.minMonths;
          const lockTip = gate
            ? `${gate.reason}（あと${Math.max(0, gate.minMonths - elapsedMonths)}ヶ月 / 残${remainingMonths}ヶ月）`
            : "";

          const innerContent = (
            <span
              className={cn(
                "relative flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                isLocked
                  ? "cursor-not-allowed text-white/40"
                  : isActive
                    ? "border-l-3 border-white bg-white/15 font-medium text-white"
                    : "text-white/90 hover:bg-white/10 hover:text-white",
              )}
            >
              <span className="relative shrink-0">
                <item.icon className="h-5 w-5" />
              </span>
              {!collapsed && <span className="flex-1">{item.label}</span>}
            </span>
          );

          const linkContent = isLocked ? (
            <div key={item.href} title={lockTip} aria-disabled="true">
              {innerContent}
            </div>
          ) : (
            <Link key={item.href} href={item.href}>
              {innerContent}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger>{linkContent}</TooltipTrigger>
                <TooltipContent side="right" className="font-sans">
                  {isLocked ? `${item.label}（${lockTip}）` : item.label}
                </TooltipContent>
              </Tooltip>
            );
          }

          return linkContent;
        })}
      </nav>

      <Separator className="bg-white/15" />
      <UserSection collapsed={collapsed} />
    </aside>
  );
}

function UserSection({ collapsed }: { collapsed: boolean }) {
  const user = useAuthStore((s) => s.user);

  if (!user) return null;

  const initials = user.name
    ? user.name
        .split(/\s+/)
        .map((s) => s[0])
        .join("")
        .slice(0, 2)
    : "U";

  const roleLabel =
    user.role === "owner"
      ? "事務所オーナー"
      : user.role === "advisor"
        ? "顧問スタッフ"
        : user.role === "admin"
          ? "管理者"
          : user.role === "member"
            ? "メンバー"
            : user.role === "viewer"
              ? "閲覧"
              : "ユーザー";

  // 顧問先切替の入口はヘッダーの OrgSwitcher（社名バッジのドロップダウン）に
  // 統一したため、ここからは削除。

  return (
    <div className="p-4">
      {!collapsed ? (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 bg-[var(--color-secondary)]">
            <AvatarFallback className="bg-[var(--color-secondary)] text-xs font-bold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="text-xs">
            <div className="text-white/90">{roleLabel}</div>
            <div className="font-medium text-white">{user.name}</div>
          </div>
        </div>
      ) : (
        <Avatar className="mx-auto h-8 w-8 bg-[var(--color-secondary)]">
          <AvatarFallback className="bg-[var(--color-secondary)] text-xs font-bold text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
