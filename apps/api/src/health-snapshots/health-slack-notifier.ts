import { HttpService } from '@nestjs/axios';
import type { HealthSnapshotItem } from './health-snapshots.service';

/**
 * 健康スコアが ±3pt 以上動いたときに Slack へ通知する payload を組み立てる。
 *
 * 既存の briefing/slack-notifier とは別系統 (briefing は朝サマリー全体、こちらは
 * 健康スコア変動の即時通知)。webhookUrl は organization.briefSlackWebhookUrl を
 * 兼用する想定。
 */
export function formatHealthSlackPayload(
  orgName: string,
  snapshot: HealthSnapshotItem,
): { text: string; blocks: unknown[] } {
  const delta =
    snapshot.prevScore !== null ? snapshot.score - snapshot.prevScore : null;
  const arrow = delta === null ? '–' : delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
  const deltaLabel =
    delta === null ? '前月データなし' : `前月比 ${arrow} ${delta > 0 ? '+' : ''}${delta} pt`;

  const text = `${orgName} 健康スコア ${snapshot.score}/100 (${deltaLabel})`;

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'AI CFO 健康スコア更新', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*${orgName}* — ${snapshot.snapshotDate}\n` +
          `総合スコア: *${snapshot.score}/100* (${deltaLabel})\n` +
          `活動性: ${snapshot.breakdown.activity}/40 ・ ` +
          `安全性: ${snapshot.breakdown.safety}/40 ・ ` +
          `効率性: ${snapshot.breakdown.efficiency}/20`,
      },
    },
  ];

  if (snapshot.aiQuestions.length > 0) {
    const questionsText = snapshot.aiQuestions
      .slice(0, 3)
      .map((q, i) => `${i + 1}. ${q}`)
      .join('\n');
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*AI CFO からの今月の論点 (上位 3 問)*\n${questionsText}`,
      },
    });
  }

  return { text, blocks };
}

export async function postHealthSnapshotToSlack(
  http: HttpService,
  webhookUrl: string,
  orgName: string,
  snapshot: HealthSnapshotItem,
): Promise<void> {
  const payload = formatHealthSlackPayload(orgName, snapshot);
  await http.axiosRef.post(webhookUrl, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10_000,
  });
}
