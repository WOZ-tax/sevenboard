"use client";

import { Placeholder } from "./_placeholder";

export function CashflowLandingSection() {
  return (
    <Placeholder
      description="既存の資金繰りページから「期末3ヶ月 + 納税2ヶ月」だけ切り出した着地版。①の通期着地利益から納税月キャッシュアウトを自動算出し、月次残高推移グラフと最低残高警告を出す。"
      todos={[
        "③納税予想の納付月（決算月+2ヶ月＝通常）を自動キャッシュアウトに反映",
        "賞与月・大型設備投資の手入力欄",
        "最低残高警告閾値（例: 月商1ヶ月分）",
        "節税④で採用したカードの資金流出も連動表示",
      ]}
    />
  );
}
