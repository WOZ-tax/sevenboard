"use client";

/**
 * 残高調書タブ — 月末残高の3階層 (勘定→補助→取引先) 一覧 + 異常検知 + コメント。
 *
 * Phase 1 スコープ:
 *   - MF推移表APIから 12ヶ月分の月末残高を取得
 *   - 期首〜選択月=通常 / 選択月以降=outOfRange (淡くグレー) / 選択月の異常セル=赤
 *   - expandable rows (▶で勘定→補助→取引先を展開)
 *   - 行右端コメントボタン (1:N) / 赤セルコメント (1セル1コメント)
 *   - 異常ルール: 零残高違反 + 3ヶ月以上滞留
 *   - 版管理: draft → approved
 *
 * このファイル時点ではUI枠だけ。データフェッチ・テーブル本体は次の unit で実装。
 */

import { ClipboardList } from "lucide-react";

interface Props {
  orgId: string;
  fiscalYear: number | undefined;
  month: number | undefined;
}

export function ChoshoTab({ orgId, fiscalYear, month }: Props) {
  void orgId;
  void fiscalYear;
  void month;
  return (
    <div className="rounded-md border border-dashed bg-muted/20 p-8 text-center">
      <ClipboardList className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
      <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
        残高調書
      </h3>
      <p className="mt-1.5 text-xs text-muted-foreground">
        月末残高の3階層レビュー (準備中) — MF推移表からデータ取得 → 異常検知 → コメント
      </p>
      <ul className="mx-auto mt-4 inline-block list-inside list-disc text-left text-[11px] text-muted-foreground">
        <li>期首〜選択月: 通常表示 / 選択月以降: 未確定 (淡いグレー)</li>
        <li>異常ルール: 零残高違反 / 3ヶ月以上滞留</li>
        <li>行コメント (URL添付可) + 赤セルコメント</li>
        <li>版管理: draft → approved</li>
      </ul>
    </div>
  );
}
