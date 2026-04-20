"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Calendar, ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";
import { useMfOffice } from "@/hooks/use-mf-data";
import { NotificationDropdown } from "@/components/layout/notification-dropdown";
import { DataHealthBadge } from "@/components/ui/data-health-badge";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function AppHeader() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const office = useMfOffice();

  const { fiscalYear, month, periods, setPeriod, initPeriods } =
    usePeriodStore();

  // MF officeデータから会計期間を初期化
  useEffect(() => {
    if (office.data?.accounting_periods?.length) {
      initPeriods(office.data.accounting_periods);
    }
  }, [office.data, initPeriods]);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const initials = user?.name
    ? user.name
        .split(/\s+/)
        .map((s) => s[0])
        .join("")
        .slice(0, 2)
    : "U";

  const periodLabel = getPeriodLabel(fiscalYear, month, periods);

  // 会計年度の開始月を取得（期間セレクタの月リスト用）
  const currentPeriod = periods.find((p) => p.fiscal_year === fiscalYear) || periods[0];
  const fyStartMonth = currentPeriod
    ? new Date(currentPeriod.start_date).getMonth() + 1
    : 1;

  // 会計年度順に月を並べ替え（例: 4月始まり → 4,5,6,...,3）
  const orderedMonths = [
    ...MONTHS.filter((m) => m >= fyStartMonth),
    ...MONTHS.filter((m) => m < fyStartMonth),
  ];

  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6">
      <div className="flex items-center gap-3">
        {/* 現在のクライアント名 */}
        {office.data?.name && (
          <span className="hidden rounded-md bg-[var(--color-primary)]/10 px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] sm:inline">
            {office.data.name}
          </span>
        )}
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-1.5">
          {/* 会計年度セレクタ */}
          <select
            value={fiscalYear ?? ""}
            onChange={(e) => {
              const fy = e.target.value ? Number(e.target.value) : undefined;
              setPeriod(fy, month);
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm font-medium text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          >
            {periods.length === 0 && (
              <option value="">—</option>
            )}
            {periods.map((p) => (
              <option key={p.fiscal_year} value={p.fiscal_year}>
                {p.fiscal_year}年度
              </option>
            ))}
          </select>

          {/* 月セレクタ */}
          <select
            value={month ?? ""}
            onChange={(e) => {
              const m = e.target.value ? Number(e.target.value) : undefined;
              setPeriod(fiscalYear, m);
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm font-medium text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          >
            <option value="">通期</option>
            {orderedMonths.map((m) => (
              <option key={m} value={m}>
                {m}月
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <DataHealthBadge />
        <NotificationDropdown />
        {user && (
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-[var(--color-primary)] text-xs text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="hidden text-sm font-medium text-[var(--color-text-primary)] sm:inline">
              {user.name}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              title="ログアウト"
              className="text-muted-foreground hover:text-[var(--color-negative)]"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
        {!user && (
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-[var(--color-primary)] text-xs text-white">
              --
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </header>
  );
}
