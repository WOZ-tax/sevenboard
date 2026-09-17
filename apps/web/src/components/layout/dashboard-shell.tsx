"use client";

import { AppSidebar } from "@/components/layout/sidebar";
import { AppHeader } from "@/components/layout/header";
import { AuthGuard } from "@/components/auth-guard";
import { ErrorBoundary } from "@/components/error-boundary";
import { CopilotLauncher } from "@/components/copilot/copilot-launcher";
import { CopilotPane } from "@/components/copilot/copilot-pane";
import { useCurrentOrg } from "@/contexts/current-org";

// 旧実装は usePrefetchMfData / usePeriodDefaultFromKintone を全ページ共通で
// 走らせていたため、設定/資金繰り/AI レポート等でも MF と kintone の重い API
// が初期表示に同時発火していた。各ページが自前で必要なクエリを宣言する形に
// 変更し、shell では一切のデータフェッチを行わない。usePeriodDefaultFromKintone
// は monthly-review ページに移設済み。
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { currentOrg } = useCurrentOrg();
  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <AppHeader />
          {currentOrg?.isDemo && (
            <div className="border-b border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-950" role="note">
              <strong>研修・説明用デモ</strong> · 架空の卸売会社 · 実績は {currentOrg.dataAsOf} まで。
              入力・保存は共通アカウントの利用者全員に反映されます。実在する顧客情報は入力しないでください。
            </div>
          )}
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
