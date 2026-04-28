"use client";

import { Placeholder } from "./_placeholder";

export function CapitalReductionSection() {
  return (
    <Placeholder
      description="資本金1億円超の顧問先のみ表示（外形標準課税対応）。資本金等の額 × 0.525% の資本金割を試算し、減資後との差額を提示。"
      todos={[
        "MF office から 資本金 + 資本剰余金 を取得",
        "現状: 資本金等の額 × 0.525% / 減資後（1億円以下）: 0円",
        "中小企業特例（軽減税率15%, 交際費損金算入, 各種税額控除）の適用可否を併記",
        "減資手続きフロー（株主総会・公告・債権者保護・登記）の説明",
        "登記費用 30〜40万円の目安を表示",
      ]}
    />
  );
}
