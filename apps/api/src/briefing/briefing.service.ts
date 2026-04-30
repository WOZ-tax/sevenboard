import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { createLlmProvider } from '../ai/llm-provider';
import { TriageService } from '../triage/triage.service';
import { MfApiService } from '../mf/mf-api.service';
import { MfTransformService } from '../mf/mf-transform.service';
import { PrismaService } from '../prisma/prisma.service';
import { AgentRunsService } from '../agent-runs/agent-runs.service';
import type { Prisma } from '@prisma/client';

export type BriefSource = 'URGENT' | 'ALERT' | 'ACTION' | 'FINANCIAL' | 'DATA_HEALTH';
export type BriefSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface BriefingHeadline {
  title: string;
  body: string;
  source: BriefSource;
  severity: BriefSeverity;
  linkHref?: string;
}

export interface BriefingResponse {
  generatedAt: string;
  greeting: string;
  headlines: BriefingHeadline[];
  /** LLMが使えない/未連携時の理由 */
  fallbackReason?: string;
}

@Injectable()
export class BriefingService {
  private logger = new Logger('BriefingService');

  constructor(
    private httpService: HttpService,
    private triage: TriageService,
    private mfApi: MfApiService,
    private mfTransform: MfTransformService,
    private prisma: PrismaService,
    private agentRuns: AgentRunsService,
  ) {}

  async today(
    orgId: string,
    options?: { fiscalYear?: number; endMonth?: number },
  ): Promise<BriefingResponse> {
    const startedAt = Date.now();
    const { tenantId } = await this.prisma.orgScope(orgId);
    const response = await this.generateToday(orgId, options);
    // 履歴保存（失敗してもレスポンスは返す）
    await this.persistSnapshot(orgId, tenantId, response, {
      urgent: response.headlines.length > 0 ? this.countUrgent(response.headlines) : 0,
      thisWeek: 0,
    }).catch((err) =>
      this.logger.warn(
        `Briefing snapshot persist failed: ${err instanceof Error ? err.message : err}`,
      ),
    );
    await this.agentRuns.logRun({
      orgId,
      agentKey: 'BRIEF',
      mode: 'OBSERVE',
      fiscalYear: options?.fiscalYear ?? null,
      endMonth: options?.endMonth ?? null,
      input: { fiscalYear: options?.fiscalYear ?? null, endMonth: options?.endMonth ?? null },
      output: response as unknown as Record<string, unknown>,
      status: response.fallbackReason ? 'FALLBACK' : 'SUCCESS',
      durationMs: Date.now() - startedAt,
    });
    return response;
  }

  /**
   * 過去の朝サマリー履歴を新しい順に返す。
   */
  async history(
    orgId: string,
    options?: { limit?: number; days?: number },
  ): Promise<
    Array<{
      id: string;
      generatedAt: string;
      greeting: string;
      headlines: BriefingHeadline[];
      fallbackReason?: string;
      urgentCount: number;
      headlineCount: number;
    }>
  > {
    const limit = Math.min(Math.max(options?.limit ?? 14, 1), 60);
    const { tenantId } = await this.prisma.orgScope(orgId);
    const since = new Date();
    since.setDate(since.getDate() - (options?.days ?? 30));
    const rows = await this.prisma.briefingSnapshot.findMany({
      where: { tenantId, orgId, generatedAt: { gte: since } },
      orderBy: { generatedAt: 'desc' },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      generatedAt: r.generatedAt.toISOString(),
      greeting: r.greeting,
      headlines: toHeadlines(r.headlines),
      fallbackReason: r.fallbackReason ?? undefined,
      urgentCount: r.urgentCount,
      headlineCount: r.headlineCount,
    }));
  }

  private async generateToday(
    orgId: string,
    options?: { fiscalYear?: number; endMonth?: number },
  ): Promise<BriefingResponse> {
    const now = new Date();
    const greeting = buildGreeting(now);

    const { summary, signals } = await this.triage
      .classify(orgId, options)
      .catch(() => ({
        summary: { urgent: 0, thisWeek: 0, monthly: 0, noise: 0, total: 0, lastRunAt: now.toISOString() },
        signals: [] as Awaited<ReturnType<TriageService['classify']>>['signals'],
      }));

    const urgentSignals = signals.filter((s) => s.bucket === 'URGENT').slice(0, 5);
    const thisWeekSignals = signals.filter((s) => s.bucket === 'THIS_WEEK').slice(0, 5);

    const ruleHeadlines = this.buildRuleHeadlines(urgentSignals, thisWeekSignals);

    const provider = createLlmProvider(this.httpService);
    if (!provider || ruleHeadlines.length === 0) {
      return {
        generatedAt: now.toISOString(),
        greeting,
        headlines: ruleHeadlines,
        fallbackReason: !provider
          ? 'LLM未設定のため定型の注目点のみ表示'
          : ruleHeadlines.length === 0
            ? '注目すべき事象はありません'
            : undefined,
      };
    }

    try {
      const context = [
        `URGENT: ${summary.urgent}件 / THIS_WEEK: ${summary.thisWeek}件`,
        '## 緊急',
        ...urgentSignals.map(
          (s) => `- [${s.severity}] ${s.title} — ${s.reason}`,
        ),
        '## 今週',
        ...thisWeekSignals.map(
          (s) => `- [${s.severity}] ${s.title} — ${s.reason}`,
        ),
      ].join('\n');

      const prompt = [
        'あなたはSevenBoardの「brief」エージェントです。',
        '顧問が朝の3分で全体像を把握できるよう、注目点を最大3件まで日本語で整理してください。',
        '各項目は「見出し（30字以内）」＋「本文（1〜2文・根拠と示唆）」で構成。',
        '事実のみ。推測や一般論は書かない。該当なしのカテゴリはスキップ。',
        '出力は JSON のみ。余計な前後の説明は禁止。',
        '形式: {"headlines":[{"title":"...","body":"..."}]}',
        '',
        '--- 本日の事象 ---',
        context,
      ].join('\n');

      const res = await provider.generate(prompt, { maxTokens: 800, json: true });
      const parsed = safeParseHeadlines(res.text);
      if (parsed && parsed.length > 0) {
        const merged = ruleHeadlines.slice(0, parsed.length).map((rule, i) => ({
          ...rule,
          title: parsed[i].title || rule.title,
          body: parsed[i].body || rule.body,
        }));
        return {
          generatedAt: now.toISOString(),
          greeting,
          headlines: merged,
        };
      }
    } catch (err) {
      this.logger.warn(`Briefing LLM narration failed: ${err instanceof Error ? err.message : err}`);
    }

    return {
      generatedAt: now.toISOString(),
      greeting,
      headlines: ruleHeadlines,
    };
  }

  private async persistSnapshot(
    orgId: string,
    tenantId: string,
    response: BriefingResponse,
    counts: { urgent: number; thisWeek: number },
  ): Promise<void> {
    await this.prisma.briefingSnapshot.create({
      data: {
        tenantId,
        orgId,
        generatedAt: new Date(response.generatedAt),
        greeting: response.greeting,
        headlines: response.headlines as unknown as Prisma.InputJsonValue,
        fallbackReason: response.fallbackReason ?? null,
        urgentCount: counts.urgent,
        thisWeekCount: counts.thisWeek,
        headlineCount: response.headlines.length,
      },
    });
  }

  private countUrgent(headlines: BriefingHeadline[]): number {
    return headlines.filter(
      (h) => h.severity === 'CRITICAL' || h.severity === 'HIGH',
    ).length;
  }

  private buildRuleHeadlines(
    urgent: Awaited<ReturnType<TriageService['classify']>>['signals'],
    thisWeek: Awaited<ReturnType<TriageService['classify']>>['signals'],
  ): BriefingHeadline[] {
    const out: BriefingHeadline[] = [];

    // 最優先: URGENT 1件目
    if (urgent[0]) {
      out.push({
        title: urgent[0].title,
        body: urgent[0].reason || urgent[0].description || '要対応',
        source: mapSource(urgent[0].source),
        severity: urgent[0].severity,
        linkHref: urgent[0].linkHref,
      });
    }

    // 次: URGENT 2件目 or THIS_WEEK トップ
    const second = urgent[1] ?? thisWeek[0];
    if (second) {
      out.push({
        title: second.title,
        body: second.reason || second.description || '',
        source: mapSource(second.source),
        severity: second.severity,
        linkHref: second.linkHref,
      });
    }

    // 3件目: さらに次の候補
    const third = urgent[2] ?? thisWeek[urgent[1] ? 0 : 1];
    if (third) {
      out.push({
        title: third.title,
        body: third.reason || third.description || '',
        source: mapSource(third.source),
        severity: third.severity,
        linkHref: third.linkHref,
      });
    }

    return out;
  }
}

function mapSource(
  src: 'ACTION' | 'ALERT' | 'DATA_SYNC' | 'BUSINESS_EVENT',
): BriefSource {
  switch (src) {
    case 'ACTION':
      return 'ACTION';
    case 'ALERT':
      return 'ALERT';
    case 'DATA_SYNC':
      return 'DATA_HEALTH';
    default:
      return 'ALERT';
  }
}

function buildGreeting(now: Date): string {
  const h = now.getHours();
  const day = now.toLocaleDateString('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
  if (h < 10) return `おはようございます。${day}の注目点です。`;
  if (h < 17) return `${day}の注目点をお届けします。`;
  return `${day}の終業時点の注目点です。`;
}

function toHeadlines(json: unknown): BriefingHeadline[] {
  if (!Array.isArray(json)) return [];
  return json.filter((h): h is BriefingHeadline => {
    if (typeof h !== 'object' || h === null) return false;
    const o = h as Record<string, unknown>;
    return typeof o.title === 'string' && typeof o.body === 'string';
  });
}

function safeParseHeadlines(
  raw: string,
): Array<{ title: string; body: string }> | null {
  try {
    const trimmed = raw.trim().replace(/^```json\s*|```$/g, '');
    const obj = JSON.parse(trimmed);
    if (!obj || !Array.isArray(obj.headlines)) return null;
    return obj.headlines
      .filter((h: unknown): h is { title: string; body: string } => {
        return (
          typeof h === 'object' &&
          h !== null &&
          typeof (h as { title?: unknown }).title === 'string' &&
          typeof (h as { body?: unknown }).body === 'string'
        );
      })
      .slice(0, 3);
  } catch {
    return null;
  }
}
