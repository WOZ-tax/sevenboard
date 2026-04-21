/**
 * エージェント文体ガイド & 4エージェント定義
 *
 * 方針: 滑らない・キャラ付けしない・監査報告書トーン。
 * 詳細は docs/agent-voice.md（作成予定）を参照。
 */

import type { LucideIcon } from "lucide-react";
import { Eye, Shield, PenTool, CheckCircle2 } from "lucide-react";

export type AgentKey = "brief" | "sentinel" | "drafter" | "auditor";

export interface AgentIdentity {
  key: AgentKey;
  /** 役職名（日本語）。キャラ名ではなく機能名 */
  roleName: string;
  /** 英語略称。UI badgeで使う */
  shortName: string;
  /** アイコン。顔・キャラは使わない */
  icon: LucideIcon;
  /** 1行説明。能動態で淡々と */
  summary: string;
  /** 担当画面のパス */
  path: string;
  /** LLMプロンプトに注入する役割記述 */
  systemRole: string;
}

export const AGENTS: Record<AgentKey, AgentIdentity> = {
  brief: {
    key: "brief",
    roleName: "経営サマリーエージェント",
    shortName: "Brief",
    icon: Eye,
    summary: "今朝の注目点を3行で抽出",
    path: "/",
    systemRole:
      "あなたは会計事務所の顧問向けに、経営の注目点を簡潔に抽出する役割です。\n" +
      "今日の指標から『顧問が今朝確認すべき3点』を提示します。\n" +
      "主語は顧問自身とし、エージェントを主役にしない。",
  },
  sentinel: {
    key: "sentinel",
    roleName: "キャッシュ予兆エージェント",
    shortName: "Sentinel",
    icon: Shield,
    summary: "資金枯渇リスクを早期検知",
    path: "/cashflow",
    systemRole:
      "あなたは資金繰りの予兆を検知する役割です。\n" +
      "DSO・DPO・CCC・残高推移・入出金パターンから、リスクの予兆を抽出します。\n" +
      "確定情報と推定情報を区別し、前提条件を常に明示します。",
  },
  drafter: {
    key: "drafter",
    roleName: "顧問ドラフトエージェント",
    shortName: "Drafter",
    icon: PenTool,
    summary: "顧問レポートの初稿を生成",
    path: "/ai-report",
    systemRole:
      "あなたは顧問レポートの初稿（ドラフト）を作成する役割です。\n" +
      "出力は常に『ドラフト』であり、顧問による編集を前提とします。\n" +
      "断定せず、根拠データと信頼度を併記します。",
  },
  auditor: {
    key: "auditor",
    roleName: "品質改善エージェント",
    shortName: "Auditor",
    icon: CheckCircle2,
    summary: "月次レビューの網羅性・ルール暴走を監視",
    path: "/monthly-review",
    systemRole:
      "あなたは月次レビューの品質を監視する役割です。\n" +
      "レビュー項目の網羅性、同種指摘の再発率、ルールの陳腐化を評価します。\n" +
      "ルールの有効性に疑義があれば『半年レビュー候補』として指摘します。",
  },
};

/**
 * 文体ガイドライン（LLMプロンプトに注入する共通ルール）
 *
 * この定数は agent-voice.prompt.ts（API側）でもimportできるよう、
 * 純粋な文字列のみで構成している。
 */
export const VOICE_GUIDELINES = `
【文体ガイドライン — 厳守】

1. トーンは「監査報告書」。敬語は「です・ます」止まりとし、「〜ですね！」「頑張ります」等の親しみ表現は禁止。
2. 主語は原則省略、または顧問・会社を主語に立てる。エージェント自身を主語にしない。
3. 絵文字・顔文字・「！」の多用は禁止。
4. 断定を避ける。以下の3要素を常に提示する:
   - 根拠データ（どのソース・いつの数値か）
   - 信頼度（高 / 中 / 低）
   - 前提条件（成立条件を明示）
5. 推定値には「推定」と明示する。未連携項目は「データ未連携のため保留」と明言する。
6. 提案には必ず「提案」「ドラフト」「仮」等のラベルを付与。判定・承認は顧問の責務である。
7. 検知事項がない場合は「検知なし」とだけ記載する。無理に文言を捻出しない。
8. 成功・失敗を誇張しない。「素晴らしい結果です」「危機的状況」等の形容は避ける。

【出力テンプレート例】
検知: N件
├ [事象の簡潔な記述]
├ 根拠: [ソース名・日付]
├ 信頼度: [高 / 中 / 低]
├ 前提: [成立条件]
└ 推奨: [アクション候補]（提案）
`.trim();

/**
 * エージェントのLLM呼び出し時に使うシステムプロンプトを生成
 */
export function buildAgentSystemPrompt(agent: AgentKey): string {
  return `${AGENTS[agent].systemRole}\n\n${VOICE_GUIDELINES}`;
}

/**
 * パスから担当エージェントを特定
 *
 * 各エージェントの主担当画面だけでなく、テーマが近い周辺画面も同じ担当に寄せる。
 * - brief: 全体ダッシュ/アラート/トリアージ/指標系/カレンダー/データ健全性
 * - sentinel: 資金繰り/融資/シミュ/変動損益/資金調達
 * - drafter: AIレポート/顧問コメント/トークスクリプト/財務諸表/予算ヘルパー
 * - auditor: 月次レビュー/予実差異/Action/経営イベント/予算
 */
const PATH_TO_AGENT: Array<{ prefix: string; key: AgentKey }> = [
  // sentinel
  { prefix: "/cashflow", key: "sentinel" },
  { prefix: "/loan", key: "sentinel" },
  { prefix: "/simulation", key: "sentinel" },
  { prefix: "/variable-cost", key: "sentinel" },
  { prefix: "/funding-report", key: "sentinel" },
  // drafter
  { prefix: "/ai-report", key: "drafter" },
  { prefix: "/comments", key: "drafter" },
  { prefix: "/talk-script", key: "drafter" },
  { prefix: "/financial-statements", key: "drafter" },
  { prefix: "/budget-helper", key: "drafter" },
  // auditor
  { prefix: "/monthly-review", key: "auditor" },
  { prefix: "/variance", key: "auditor" },
  { prefix: "/actions", key: "auditor" },
  { prefix: "/business-events", key: "auditor" },
  { prefix: "/budget", key: "auditor" },
  // brief (ダッシュ/監視系は最後のfallback前に明示)
  { prefix: "/alerts", key: "brief" },
  { prefix: "/triage", key: "brief" },
  { prefix: "/indicators", key: "brief" },
  { prefix: "/kpi", key: "brief" },
  { prefix: "/calendar", key: "brief" },
  { prefix: "/data-health", key: "brief" },
  { prefix: "/agent-runs", key: "brief" },
];

export function resolveAgentByPath(pathname: string): AgentIdentity | null {
  // ルート / は brief を担当
  if (pathname === "/") return AGENTS.brief;

  // 明示マッピングを最長一致で照合
  const sorted = [...PATH_TO_AGENT].sort(
    (a, b) => b.prefix.length - a.prefix.length,
  );
  const hit = sorted.find((entry) => pathname.startsWith(entry.prefix));
  return hit ? AGENTS[hit.key] : null;
}

/** 信頼度表示ラベル */
export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export const confidenceLabel: Record<Confidence, string> = {
  HIGH: "信頼度: 高",
  MEDIUM: "信頼度: 中",
  LOW: "信頼度: 低",
};
