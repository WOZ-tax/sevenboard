"use client";

import { Placeholder } from "./_placeholder";

export function LandingPlSection() {
  return (
    <Placeholder
      description="MF会計の前期実績・当期YTD実績・着地予測の3列を勘定科目別に並べる。残月推計は前年同月 / 直近3ヶ月平均 / 手入力 をトグル切替。固変分解流用で売上 ±5% / ±10% の感度レンジも併記。"
      todos={[
        "GET /reports/landing-pl エンドポイント追加（org_id, fy）",
        "勘定科目別に 前期 / 当期実績 / 残月推計 / 着地予測 / 増減率 を返す",
        "残月推計方式トグル（前年同月 / 直近3ヶ月平均 / 手入力）",
        "感度レンジ（売上±5%, ±10%）の利益振れ幅表示",
        "経過月数で年換算の表示切替",
      ]}
    />
  );
}
