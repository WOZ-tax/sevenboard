"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CurrentOrgProvider } from "@/contexts/current-org";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/auth";

export function Providers({ children }: { children: React.ReactNode }) {
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const isChecking = useAuthStore((s) => s.isChecking);
  useEffect(() => {
    void useAuthStore.getState().initialize();
    const sync = (event: StorageEvent) => {
      if (event.key === 'user' || event.key === null) useAuthStore.getState().syncSession();
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  if (isChecking) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">ログイン状態を確認中...</div>;
  }
  // Remount the entire data/UI boundary synchronously: no previous user's cached
  // query, open form, or component state can render for even one frame after login.
  return <SessionProviders key={sessionVersion}>{children}</SessionProviders>;
}

function SessionProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <CurrentOrgProvider>
        <TooltipProvider>{children}</TooltipProvider>
      </CurrentOrgProvider>
      <Toaster />
    </QueryClientProvider>
  );
}
