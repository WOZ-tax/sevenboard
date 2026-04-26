"use client";

import { AppSidebar } from "@/components/layout/sidebar";
import { AppHeader } from "@/components/layout/header";
import { AuthGuard } from "@/components/auth-guard";
import { ErrorBoundary } from "@/components/error-boundary";
import { usePrefetchMfData } from "@/hooks/use-mf-data";
import { usePeriodDefaultFromKintone } from "@/hooks/use-kintone-progress";
import { CopilotLauncher } from "@/components/copilot/copilot-launcher";
import { CopilotPane } from "@/components/copilot/copilot-pane";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  // P-1: ログイン後に主要MFデータを一括プリフェッチ
  usePrefetchMfData();
  // kintone月次進捗の「納品済」最新月を期間デフォルトに自動適用
  usePeriodDefaultFromKintone();

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <AppHeader />
          <main className="flex-1 overflow-y-auto bg-[var(--color-background)] p-4">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
        </div>
      </div>
      <CopilotLauncher />
      <CopilotPane />
    </AuthGuard>
  );
}
