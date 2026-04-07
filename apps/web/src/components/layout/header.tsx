"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth";
import { NotificationDropdown } from "@/components/layout/notification-dropdown";

export function AppHeader() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

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

  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6">
      <div className="flex items-center gap-4">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
          部門別サマリー
        </h2>
        <Badge variant="outline" className="text-xs text-muted-foreground">
          3月度
        </Badge>
      </div>
      <div className="flex items-center gap-3">
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
