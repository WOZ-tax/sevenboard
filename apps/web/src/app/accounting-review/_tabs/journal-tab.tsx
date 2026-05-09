"use client";

/**
 * 仕訳レビュータブ — Phase 0: 一覧 + フィルタ表示の枠。
 *
 * Phase 0 スコープ (このタブの最終目標):
 *   - MF 仕訳取得 API (mfc_ca_getJournals) から期間内の仕訳一覧を取る
 *   - フィルタ: 期間 / 科目 / 金額レンジ / 未レビュー
 *   - risk-findings 検知ルールの自動マーク (異常仕訳ハイライト)
 *   - 行コメント + 差戻し (Phase 1+)
 *
 * このファイル時点ではUI枠だけ。データフェッチは次の unit で実装。
 */

import { BookText } from "lucide-react";

interface Props {
  orgId: string;
  fiscalYear: number | undefined;
  month: number | undefined;
}

export function JournalReviewTab({ orgId, fiscalYear, month }: Props) {
  void orgId;
  void fiscalYear;
  void month;
  return (
    <div className="rounded-md border border-dashed bg-muted/20 p-8 text-center">
      <BookText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
      <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
        仕訳レビュー
      </h3>
      <p className="mt-1.5 text-xs text-muted-foreground">
        個別仕訳の検品 (準備中) — 期間/科目/金額/未レビューでフィルタ + 異常マーク
      </p>
      <ul className="mx-auto mt-4 inline-block list-inside list-disc text-left text-[11px] text-muted-foreground">
        <li>MF仕訳API + risk-findings の検知ルールで自動マーク</li>
        <li>残高調書の行クリックから「該当取引の仕訳」へドリルダウン (Phase 1)</li>
        <li>コメント / 差戻し / 修正履歴</li>
      </ul>
    </div>
  );
}
