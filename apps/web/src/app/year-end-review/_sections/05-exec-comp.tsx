"use client";

import { Placeholder } from "./_placeholder";

export function ExecCompSimulatorSection() {
  return (
    <Placeholder
      description="既存の HTML 役員報酬シミュレーター（projects/board/index.html）を React に移植。法人税・所得税・社会保険料・キャッシュフローを総合最適化。MF実績から売上・経費を初期値プリセット。小規模企業共済等掛金控除を④節税と連動。"
      todos={[
        "lib/payroll-tax-calc.ts: simulate / corpTax / calcSI / spouseDed / salaryDed / incomeTax / stdComp 関数移植",
        "lib/tax-rates-2026.ts: 標準報酬月額表 / 社保料率 / 法人税・住民税・事業税率 / 給与所得控除 / 基礎控除特例 を SSOT 化",
        "components: 報酬月額スライダー + 直接入力、結果カード4枚、報酬額別シミュチャート（recharts）",
        "MF実績連動: 売上=当期売上高, 経費=販管費合計-役員報酬, 現役員報酬=月次平均",
        "小規模企業共済掛金欄を追加し④と相互参照",
        "適用税率・計算過程ページ（reference.html 移植）は別ルート /year-end-review/exec-comp/reference",
      ]}
    />
  );
}
