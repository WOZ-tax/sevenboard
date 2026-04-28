"use client";

import { Placeholder } from "./_placeholder";

export function BsCleanupSection() {
  return (
    <Placeholder
      description="BS残高から決算前に整理すべき項目を自動抽出してチェックリスト化。滞留売掛 / 棚卸残急増 / 償却完了済固定資産 / 仮勘定残 / 残高一致しない未払金。"
      todos={[
        "GET /reports/bs-cleanup-tasks: 売掛金90日超 / 棚卸前期比+20%超 / 簿価<1万の固定資産 / 仮払金・仮受金残 / 未払金個別残",
        "チェックボックス + メモ + 期限。状態は org_id ごとに DB に保存（new table: bs_cleanup_tasks）",
        "完了したタスクはアーカイブ表示。当期に作ったタスクのみアクティブ表示",
      ]}
    />
  );
}
