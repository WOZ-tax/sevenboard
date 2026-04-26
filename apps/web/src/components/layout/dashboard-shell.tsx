"use client";

import { AppSidebar } from "@/components/layout/sidebar";
import { AppHeader } from "@/components/layout/header";
import { AuthGuard } from "@/components/auth-guard";
import { ErrorBoundary } from "@/components/error-boundary";
import { CopilotLauncher } from "@/components/copilot/copilot-launcher";
import { CopilotPane } from "@/components/copilot/copilot-pane";

// 旧実装は usePrefetchMfData / usePeriodDefaultFromKintone を全ページ共通で
// 走らせていたため、設定/資金繰り/AI レポート等でも MF と kintone の重い API
// が初期表示に同時発火していた。各ページが自前で必要なクエリを宣言する形に
// 変更し、shell では一切のデータフェッチを行わない。usePeriodDefaultFromKintone
// は monthly-review ページに移設済み。
export function DashboardShell({ children }: { children: React.ReactNode }) {
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
