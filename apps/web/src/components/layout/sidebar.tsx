"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ClipboardCheck,
  Users,
  BarChart3,
  PenLine,
  FileText,
  Wallet,
  Target,
  Bot,
  MessageSquare,
  Bell,
  Database,
  Settings,
  ChevronLeft,
  ChevronRight,
  ArrowLeftRight,
  TrendingDown,
  Mic,
  Calculator,
  Landmark,
  FileBarChart,
  Gauge,
  FlaskConical,
  CalendarDays,
  Zap,
  Activity,
  Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth";
import { useSidebarConfig } from "@/lib/sidebar-config";
import { api } from "@/lib/api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const menuItems = [
  { label: "ダッシュボード", href: "/", icon: Home },
  { label: "Actionセンター", href: "/actions", icon: Zap },
  { label: "AIトリアージ", href: "/triage", icon: Users },
  { label: "月次レビュー", href: "/monthly-review", icon: ClipboardCheck },
  { label: "予実差異", href: "/variance", icon: BarChart3 },
  { label: "予算策定", href: "/budget", icon: PenLine },
  { label: "変動損益", href: "/variable-cost", icon: TrendingDown },
  { label: "財務諸表", href: "/financial-statements", icon: FileText },
  { label: "資金繰り", href: "/cashflow", icon: Wallet },
  { label: "融資シミュレーション", href: "/loan", icon: Landmark },
  { label: "What-if", href: "/simulation", icon: FlaskConical },
  { label: "財務指標", href: "/indicators", icon: Gauge },
  { label: "KPI", href: "/kpi", icon: Target },
  { label: "顧問コメント", href: "/comments", icon: MessageSquare },
  { label: "AIレポート", href: "/ai-report", icon: Bot },
  { label: "トークスクリプト", href: "/talk-script", icon: Mic },
  { label: "予算策定ヘルパー", href: "/budget-helper", icon: Calculator },
  { label: "資金調達レポート", href: "/funding-report", icon: FileBarChart },
  { label: "アラート", href: "/alerts", icon: Bell },
  { label: "カレンダー", href: "/calendar", icon: CalendarDays },
  { label: "経営イベント", href: "/business-events", icon: Briefcase },
  { label: "データ鮮度", href: "/data-health", icon: Activity },
  { label: "マスタ管理", href: "/masters", icon: Database },
  { label: "設定", href: "/settings", icon: Settings },
];

export { menuItems };

export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { isHidden, hydrate } = useSidebarConfig();
  const orgId = useAuthStore((s) => s.user?.orgId || "");

  useEffect(() => { hydrate(); }, [hydrate]);

  const { data: triageData } = useQuery({
    queryKey: ["triage", orgId],
    queryFn: () => api.triage.classify(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const urgentCount = triageData?.summary.urgent ?? 0;

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

          const showUrgentBadge =
            item.href === "/triage" && urgentCount > 0;

          const linkContent = (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                isActive
                  ? "border-l-3 border-[var(--color-tertiary)] bg-white/10 text-white"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <span className="relative shrink-0">
                <item.icon className="h-5 w-5" />
                {showUrgentBadge && collapsed && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--color-error)] px-1 text-[10px] font-bold leading-none text-white">
                    {urgentCount > 99 ? "99+" : urgentCount}
                  </span>
                )}
              </span>
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {showUrgentBadge && !collapsed && (
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--color-error)] px-1.5 text-[10px] font-bold leading-none text-white">
                  {urgentCount > 99 ? "99+" : urgentCount}
                </span>
              )}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger>{linkContent}</TooltipTrigger>
                <TooltipContent side="right" className="font-sans">
                  {item.label}
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

  const roleLabel = user.role === "ADVISOR" ? "経営アドバイザー" : "管理者";

  return (
    <div className="p-4">
      {!collapsed ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8 bg-[var(--color-secondary)]">
              <AvatarFallback className="bg-[var(--color-secondary)] text-xs font-bold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="text-xs">
              <div className="text-white/70">{roleLabel}</div>
              <div className="font-medium text-white">{user.name}</div>
            </div>
          </div>
          {user.role === "ADVISOR" && (
            <Link
              href="/select-org"
              className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-white/50 transition-colors hover:bg-white/5 hover:text-white"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              <span>顧問先切替</span>
            </Link>
          )}
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
