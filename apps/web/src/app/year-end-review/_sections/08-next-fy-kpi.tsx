"use client";

import { Placeholder } from "./_placeholder";

export function NextFyKpiSection() {
  return (
    <Placeholder
      description="過去3年実績から来期の売上 / 粗利 / 営業利益のレンジ提示。顧問が来期目標を入力 → 月次ブレイクダウン（前年同月比%配分 / 均等配分）。保存して来期 dashboard で予実比較線として使う。"
      todos={[
        "POST /reports/next-fy-kpi: 過去3年の YoY を平均化してレンジ算出（Conservative / Mid / Aggressive）",
        "目標入力欄: 売上, 粗利率, 販管費目標, 営業利益",
        "月次配分トグル: 前年同月比% / 均等",
        "保存先: budget table（既存）の next_fy エントリとして書き込み",
      ]}
    />
  );
}
