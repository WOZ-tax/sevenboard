import { HttpService } from '@nestjs/axios';
import type { BriefingHeadline, BriefingResponse } from './briefing.service';

const SEVERITY_EMOJI: Record<BriefingHeadline['severity'], string> = {
  CRITICAL: ':rotating_light:',
  HIGH: ':warning:',
  MEDIUM: ':large_yellow_circle:',
  LOW: ':information_source:',
  INFO: ':information_source:',
};

export function formatSlackPayload(
  orgName: string,
  response: BriefingResponse,
): { text: string; blocks: unknown[] } {
  const header = `*${orgName}* — 今朝のサマリー`;
  const greeting = response.greeting;

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '今朝のサマリー', emoji: true },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `${header}\n${greeting}` }],
    },
  ];

  if (response.headlines.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          response.fallbackReason ?? '本日の注目点はありません。',
      },
    });
  } else {
    response.headlines.forEach((h, i) => {
      const emoji = SEVERITY_EMOJI[h.severity] ?? ':information_source:';
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *${i + 1}. ${h.title}*\n${h.body}`,
        },
      });
    });
    if (response.fallbackReason) {
      blocks.push({
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `_※ ${response.fallbackReason}_` },
        ],
      });
    }
  }

  const plainText = [
    `${header}`,
    greeting,
    ...response.headlines.map(
      (h, i) => `${i + 1}. [${h.severity}] ${h.title} — ${h.body}`,
    ),
  ].join('\n');

  return { text: plainText, blocks };
}

export async function postBriefingToSlack(
  http: HttpService,
  webhookUrl: string,
  orgName: string,
  response: BriefingResponse,
): Promise<void> {
  const payload = formatSlackPayload(orgName, response);
  await http.axiosRef.post(webhookUrl, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10_000,
  });
}
