"use client";

import { Placeholder } from "./_placeholder";

export function ScheduleSection() {
  return (
    <Placeholder
      description="決算検討シート Ver3「2.スケジュール」と同じ運用。決算日 → 資料提出 → QA送付 → QA回答 → DRAFT送付 → DRAFT確認 → 電子申告/納税 → 株主総会・役員報酬改定 を SRA / 貴社の役割分担列付きで管理。"
      todos={[
        "デフォルトテンプレ: 決算日, +30d 資料提出(貴社), +37d QA送付(SRA), +38d QA回答(貴社), +45d DRAFT送付(SRA), +46d DRAFT確認(貴社), +50d 電子申告・納税(両社), +60d 株主総会(貴社)",
        "顧問先ごとに日付調整可。kintone「月次進捗」から決算月実績を取得",
        "期限○日前（5/3/1日前）に色を変える。期限超過は赤",
      ]}
    />
  );
}
