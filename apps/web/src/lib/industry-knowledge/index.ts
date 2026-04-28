/**
 * 業種別経営知識のpublic API。
 * UI と AI 双方から呼び出せる構造。
 */

export type { IndustryCode, IndustryKnowledge, IndustryMetrics, BsCleanupHints } from "./types";
export { INDUSTRY_KNOWLEDGE, GENERAL_INDUSTRY_CONTEXT } from "./data";

import { INDUSTRY_KNOWLEDGE, GENERAL_INDUSTRY_CONTEXT } from "./data";
import type { IndustryCode, IndustryKnowledge } from "./types";

/** 業種コードを受け取り、対応する knowledge を返す。未指定/不明は other */
export function getIndustryKnowledge(code: IndustryCode | null | undefined): IndustryKnowledge {
  if (!code) return INDUSTRY_KNOWLEDGE.other;
  return INDUSTRY_KNOWLEDGE[code] ?? INDUSTRY_KNOWLEDGE.other;
}

/** 業種選択UI用のラベル一覧（select オプション） */
export function getIndustryOptions(): Array<{ value: IndustryCode; label: string }> {
  return Object.values(INDUSTRY_KNOWLEDGE).map((k) => ({
    value: k.code,
    label: k.label,
  }));
}

/**
 * AI(Copilot)へ渡すための業種コンテキスト文字列を生成。
 * system prompt に注入して、業種特性を理解した回答を出させる。
 */
export function getKnowledgeForAI(code: IndustryCode | null | undefined): string {
  const k = getIndustryKnowledge(code);
  // その他/未設定の場合は全業種共通コンテキストを返す
  if (k.code === "other") {
    return `[業種: ${k.label}]\n${GENERAL_INDUSTRY_CONTEXT}`;
  }

  const sections: string[] = [
    `[業種: ${k.label}]`,
    `ROA軸: ${k.roaAxis === "profit-margin" ? "利益率軸（建設・医療等）" : "回転率軸（小売・卸売等）"}`,
    `業界平均指標: ${formatMetrics(k.metrics)}`,
    `業界特性:\n${k.generalContext}`,
    `ヒアリング項目:\n${k.hearingChecklist.map((q) => `- ${q}`).join("\n")}`,
    `やりがちな失敗(注意喚起):\n${k.pitfalls.map((p) => `- ${p}`).join("\n")}`,
  ];
  if (k.scheduleExtras.length > 0) {
    sections.push(
      `業種特有の決算スケジュール項目:\n${k.scheduleExtras.map((s) => `- ${s.task}（${s.note}）`).join("\n")}`,
    );
  }
  // 全業種共通の知識も併記（AIの判断材料として）
  sections.push(`参考: 全業種共通の目利き ${GENERAL_INDUSTRY_CONTEXT}`);
  return sections.join("\n\n");
}

function formatMetrics(m: import("./types").IndustryMetrics): string {
  const parts: string[] = [];
  if (m.grossMarginPct !== undefined) parts.push(`売上総利益率 ${m.grossMarginPct}%`);
  if (m.cogsRatioPct !== undefined) parts.push(`原価率 ${m.cogsRatioPct}%`);
  if (m.flCostRatioPct !== undefined) parts.push(`FL比率 ${m.flCostRatioPct}%`);
  if (m.sgaRatioPct !== undefined) parts.push(`販管費率 ${m.sgaRatioPct}%`);
  if (m.operatingMarginPct !== undefined) parts.push(`営業利益率 ${m.operatingMarginPct}%`);
  if (m.laborCostRatioPct !== undefined) parts.push(`人件費率 ${m.laborCostRatioPct}%`);
  const result = parts.length > 0 ? parts.join(", ") : "—";
  return m.sourceNote ? `${result}（${m.sourceNote}）` : result;
}
