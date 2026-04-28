"use client";

import { Placeholder } from "./_placeholder";

export function TaxForecastSection() {
  return (
    <Placeholder
      description="着地税引前利益から法人税系5本立て + 消費税の納税予想。中小特例(800万まで15%)自動判定、別表加減算は主要5-6項目を簡易入力。"
      todos={[
        "lib/tax-rates-2026.ts を SSOT 化（reference.html の税率テーブルを移植）",
        "lib/payroll-tax-calc.ts に corpTax 関数を移植",
        "別表加減算: 交際費損金不算入 / 減価償却超過 / 受取配当益金不算入 / 寄附金損金不算入 / 繰越欠損金",
        "法人税 / 地方法人税 / 事業税 / 特別法人事業税 / 法人税割 / 均等割 の表",
        "消費税: 仮受 - 仮払 - 中間納付 = 期末納付額（簡易課税の場合は別計算）",
      ]}
    />
  );
}
