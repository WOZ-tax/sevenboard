"use client";

import { Placeholder } from "./_placeholder";

export function ConsumptionTaxFilingSection() {
  return (
    <Placeholder
      description="①課税事業者選択（還付検討）②簡易課税の有利不利判定 ③届出書提出履歴。期末までの届出が必要なため、9-10ヶ月目で必ず確認。"
      todos={[
        "課税選択: 還付検討事業年度 / 翌期 / 翌々期 の3期試算（10%/8%別、設備投資予定の入力）",
        "簡易課税判定: 当期実績の税区分集計（仮受-仮払 vs みなし仕入率）から有利不利を自動算出。第1〜6種事業の業種選択",
        "届出書履歴: org ごとに 課税事業者選択届 / 簡易課税選択届 / 課税事業者選択不適用届 等の提出記録を保存",
        "提出期限アラート（決算月までに届出必須なケース）",
      ]}
    />
  );
}
