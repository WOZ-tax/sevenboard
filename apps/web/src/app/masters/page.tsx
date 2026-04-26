"use client";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, Construction } from "lucide-react";

/**
 * マスタ管理（勘定科目 / 部門 / ユーザー）。
 *
 * 旧実装はダミー配列をそのまま表示していたため、本番ではデータ連携前に
 * 「準備中」プレースホルダーで置き換える。実データ連携は MF Cloud 同期 +
 * OrganizationMembership 経由のユーザー一覧 API 整備後に着手予定。
 */
export default function MastersPage() {
  return (
    <DashboardShell>
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-[var(--color-text-primary)]" />
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
              マスタ管理
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            勘定科目・部門・ユーザーの基本設定
          </p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
              <Construction className="h-4 w-4" />
              準備中
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              勘定科目・部門は MF Cloud との連携データから自動生成される予定です。
              ユーザー一覧は <a href="/advisor/staff" className="text-[var(--color-primary)] underline">事務所スタッフ管理</a> および
              各顧問先の招待機能（実装予定）から管理します。
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
