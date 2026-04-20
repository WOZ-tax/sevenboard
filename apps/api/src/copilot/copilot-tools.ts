import type { LlmToolDefinition } from '../ai/llm-provider';

/**
 * execute モードで Claude に渡す tool 定義。
 * - propose_action: Action テーブルへ登録
 * - send_slack_digest: 組織の briefSlackWebhookUrl に向けて要約を送信
 */
export const COPILOT_TOOLS: LlmToolDefinition[] = [
  {
    name: 'propose_action',
    description:
      '顧問向けの対応タスク（Action）を登録する。顧問が後で編集・承認できる前提のドラフトとして作成する。' +
      '具体性のあるタイトルと、根拠データを含む説明を必ず付与する。',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Action のタイトル（40文字以内目安）',
        },
        description: {
          type: 'string',
          description:
            '背景・根拠データ・提案内容を含む説明。根拠→信頼度→前提を併記する。',
        },
        severity: {
          type: 'string',
          enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
          description: 'Action 重要度',
        },
        ownerRole: {
          type: 'string',
          enum: ['ADVISOR', 'EXECUTIVE', 'ACCOUNTING'],
          description: '想定担当ロール',
        },
        sourceScreen: {
          type: 'string',
          enum: [
            'DASHBOARD',
            'CASHFLOW',
            'MONTHLY_REVIEW',
            'AI_REPORT',
            'ALERTS',
            'VARIANCE',
            'KPI',
            'MANUAL',
          ],
          description: '発生源画面',
        },
        dueDate: {
          type: 'string',
          description: 'ISO 8601 形式の期日（省略可）',
        },
      },
      required: ['title', 'description', 'severity', 'sourceScreen'],
    },
  },
  {
    name: 'send_slack_digest',
    description:
      '組織に設定された Slack Webhook へ要約を送信する。送信先 Webhook が未設定の場合はこのツールを呼ばないこと。',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Slack 見出し（短文）',
        },
        summaryMd: {
          type: 'string',
          description: 'Slack 本文（Markdown 可、箇条書き推奨）',
        },
      },
      required: ['title', 'summaryMd'],
    },
  },
];
