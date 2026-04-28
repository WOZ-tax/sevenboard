import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import {
  createLlmProvider,
  type LlmToolDefinition,
  type LlmToolResult,
  type LlmToolCall,
} from '../ai/llm-provider';
import { MfApiService } from '../mf/mf-api.service';
import { MfTransformService } from '../mf/mf-transform.service';
import { AlertsService } from '../alerts/alerts.service';
import { ActionsService } from '../actions/actions.service';
import { DataHealthService } from '../data-health/data-health.service';
import { PrismaService } from '../prisma/prisma.service';
import { AgentRunsService } from '../agent-runs/agent-runs.service';
import { MonthlyCloseService } from '../monthly-close/monthly-close.service';
import type { AgentRunMode } from '@prisma/client';
import type { CopilotChatDto } from './copilot.dto';
import {
  AGENT_SYSTEM_ROLES,
  MODE_INSTRUCTIONS,
  VOICE_GUIDELINES,
} from './agent-voice.prompt';
import { COPILOT_TOOLS } from './copilot-tools';

export interface ChatToolCall {
  name: string;
  input: Record<string, unknown>;
  ok: boolean;
  summary: string;
}

export interface ChatResult {
  reply: string;
  model: string;
  toolCalls?: ChatToolCall[];
}

@Injectable()
export class CopilotService {
  private logger = new Logger('CopilotService');

  constructor(
    private httpService: HttpService,
    private mfApi: MfApiService,
    private mfTransform: MfTransformService,
    private alerts: AlertsService,
    private actions: ActionsService,
    private dataHealth: DataHealthService,
    private prisma: PrismaService,
    private agentRuns: AgentRunsService,
    private monthlyClose: MonthlyCloseService,
  ) {}

  async chat(
    orgId: string,
    dto: CopilotChatDto,
    userId: string,
  ): Promise<ChatResult> {
    const startedAt = Date.now();
    const runMode: AgentRunMode =
      dto.mode === 'execute'
        ? 'EXECUTE'
        : dto.mode === 'dialog'
          ? 'DIALOG'
          : 'OBSERVE';
    const lastUserMsg = [...dto.messages].reverse().find((m) => m.role === 'user');
    const inputForLog = {
      agentKey: dto.agentKey,
      pathname: dto.pathname,
      fiscalYear: dto.fiscalYear ?? null,
      endMonth: dto.endMonth ?? null,
      lastUserMessage: lastUserMsg?.content.slice(0, 2000) ?? null,
    };

    const provider = createLlmProvider(this.httpService);
    if (!provider) {
      await this.agentRuns.logRun({
        orgId,
        agentKey: 'COPILOT',
        mode: runMode,
        userId,
        fiscalYear: dto.fiscalYear ?? null,
        endMonth: dto.endMonth ?? null,
        input: inputForLog,
        output: {},
        status: 'FAILED',
        errorMessage: 'LLM provider not configured',
        durationMs: Date.now() - startedAt,
      });
      throw new ServiceUnavailableException(
        'LLM provider not configured (ANTHROPIC_API_KEY or GOOGLE_AI_API_KEY required)',
      );
    }

    const systemRole = AGENT_SYSTEM_ROLES[dto.agentKey];
    const modeHint = MODE_INSTRUCTIONS[dto.mode];
    const periodLine =
      dto.fiscalYear || dto.endMonth
        ? `対象期間: FY${dto.fiscalYear ?? '—'} / ${dto.endMonth ?? '—'}月`
        : '対象期間: 未指定';

    const contextBlock = await this.buildContextBlock(
      orgId,
      dto.fiscalYear,
      dto.endMonth,
      dto.runwayMode,
    );

    const history = dto.messages
      .map((m) => `${m.role === 'user' ? '顧問' : 'エージェント'}: ${m.content}`)
      .join('\n');

    const industryBlock = dto.industryContext
      ? ['--- 顧問先の業種別知識 ---', dto.industryContext, '']
      : [];

    const basePrompt = [
      systemRole,
      '',
      VOICE_GUIDELINES,
      '',
      modeHint,
      '',
      `現在画面: ${dto.pathname}`,
      periodLine,
      '',
      '--- 参照データ（直近時点） ---',
      contextBlock,
      '',
      ...industryBlock,
      '--- 直近のやり取り ---',
      history,
    ].join('\n');

    // execute モードのときだけ tool-use ループを有効化。
    // Claude / Gemini どちらの provider でも runWithTools を実装しているので両対応。
    // 将来 tool 非対応 provider を足したら自動的に通常 generate にフォールバックする
    // （`provider.runWithTools` は optional なので false fallthrough）。
    if (dto.mode === 'execute' && provider.runWithTools) {
      const tools = await this.filterAvailableTools(orgId, COPILOT_TOOLS);
      const prompt = [
        basePrompt,
        '',
        '--- 指示 ---',
        'この画面の課題に対して、必要なら propose_action / send_slack_digest ツールを使って行動してください。' +
          '決定できない場合はツールを呼ばず、顧問に確認する質問文だけ返してください。',
      ].join('\n');

      try {
        const res = await provider.runWithTools(
          prompt,
          tools,
          (call) => this.handleToolCall(orgId, userId, call),
          { maxTokens: 1600, maxIterations: 4 },
        );
        const toolCalls: ChatToolCall[] = res.toolCalls.map((t) => ({
          name: t.name,
          input: t.input,
          ok: t.result.ok,
          summary: t.result.content.slice(0, 240),
        }));
        const reply = res.text.trim() || '[応答なし]';
        await this.agentRuns.logRun({
          orgId,
          agentKey: 'COPILOT',
          mode: runMode,
          userId,
          fiscalYear: dto.fiscalYear ?? null,
          endMonth: dto.endMonth ?? null,
          input: inputForLog,
          output: { reply: reply.slice(0, 4000) },
          toolCalls: toolCalls as unknown as Record<string, unknown>[],
          status: 'SUCCESS',
          durationMs: Date.now() - startedAt,
        });
        return {
          reply,
          model: process.env.AI_PROVIDER || 'claude',
          toolCalls,
        };
      } catch (err) {
        this.logger.error('Copilot execute with tools failed', err as Error);
        await this.agentRuns.logRun({
          orgId,
          agentKey: 'COPILOT',
          mode: runMode,
          userId,
          fiscalYear: dto.fiscalYear ?? null,
          endMonth: dto.endMonth ?? null,
          input: inputForLog,
          output: {},
          status: 'FAILED',
          errorMessage: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - startedAt,
        });
        throw new ServiceUnavailableException(
          'LLM generation with tools failed',
        );
      }
    }

    const prompt = [basePrompt, '', '--- 応答 ---', 'エージェント:'].join('\n');

    try {
      const res = await provider.generate(prompt, { maxTokens: 1200 });
      const reply = res.text.trim() || '[応答なし]';
      await this.agentRuns.logRun({
        orgId,
        agentKey: 'COPILOT',
        mode: runMode,
        userId,
        fiscalYear: dto.fiscalYear ?? null,
        endMonth: dto.endMonth ?? null,
        input: inputForLog,
        output: { reply: reply.slice(0, 4000) },
        status: 'SUCCESS',
        durationMs: Date.now() - startedAt,
      });
      return {
        reply,
        model: process.env.AI_PROVIDER || 'claude',
      };
    } catch (err) {
      this.logger.error('Copilot chat failed', err as Error);
      await this.agentRuns.logRun({
        orgId,
        agentKey: 'COPILOT',
        mode: runMode,
        userId,
        fiscalYear: dto.fiscalYear ?? null,
        endMonth: dto.endMonth ?? null,
        input: inputForLog,
        output: {},
        status: 'FAILED',
        errorMessage: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedAt,
      });
      throw new ServiceUnavailableException('LLM generation failed');
    }
  }

  /**
   * 組織設定に応じて使えない tool をフィルタする。
   * Slack webhook 未設定なら send_slack_digest を除外。
   */
  private async filterAvailableTools(
    orgId: string,
    all: LlmToolDefinition[],
  ): Promise<LlmToolDefinition[]> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { briefSlackWebhookUrl: true },
    });
    const hasWebhook = !!org?.briefSlackWebhookUrl;
    return all.filter((t) =>
      t.name === 'send_slack_digest' ? hasWebhook : true,
    );
  }

  private async handleToolCall(
    orgId: string,
    userId: string,
    call: LlmToolCall,
  ): Promise<LlmToolResult> {
    this.logger.log(`tool_use: ${call.name} ${JSON.stringify(call.input)}`);
    if (call.name === 'propose_action') {
      return this.runProposeAction(orgId, userId, call);
    }
    if (call.name === 'send_slack_digest') {
      return this.runSendSlackDigest(orgId, call);
    }
    return {
      toolUseId: call.id,
      content: `unknown tool: ${call.name}`,
      isError: true,
    };
  }

  private async runProposeAction(
    orgId: string,
    userId: string,
    call: LlmToolCall,
  ): Promise<LlmToolResult> {
    const i = call.input as Record<string, unknown>;
    const title = typeof i.title === 'string' ? i.title.slice(0, 200) : '';
    const description =
      typeof i.description === 'string' ? i.description.slice(0, 4000) : '';
    const severity = normalizeEnum(i.severity, [
      'CRITICAL',
      'HIGH',
      'MEDIUM',
      'LOW',
    ]);
    const ownerRole = normalizeEnum(i.ownerRole, [
      'ADVISOR',
      'EXECUTIVE',
      'ACCOUNTING',
    ]);
    const sourceScreen = normalizeEnum(i.sourceScreen, [
      'DASHBOARD',
      'CASHFLOW',
      'MONTHLY_REVIEW',
      'AI_REPORT',
      'ALERTS',
      'VARIANCE',
      'KPI',
      'MANUAL',
    ]);

    if (!title || !description || !sourceScreen) {
      return {
        toolUseId: call.id,
        content:
          'Invalid input: title/description/sourceScreen are required. retry with required fields.',
        isError: true,
      };
    }

    try {
      const created = await this.actions.create(
        orgId,
        {
          title,
          description,
          sourceScreen: sourceScreen as any,
          severity: (severity ?? 'MEDIUM') as any,
          ownerRole: (ownerRole ?? 'ADVISOR') as any,
          sourceRef: { viaCopilot: true } as Record<string, unknown>,
          dueDate:
            typeof i.dueDate === 'string' && i.dueDate.length > 0
              ? i.dueDate
              : undefined,
        },
        userId,
      );
      return {
        toolUseId: call.id,
        content: `Action 登録完了: id=${created.id} title="${created.title}"`,
      };
    } catch (err) {
      return {
        toolUseId: call.id,
        content: err instanceof Error ? err.message : 'action creation failed',
        isError: true,
      };
    }
  }

  private async runSendSlackDigest(
    orgId: string,
    call: LlmToolCall,
  ): Promise<LlmToolResult> {
    const i = call.input as Record<string, unknown>;
    const title = typeof i.title === 'string' ? i.title.slice(0, 200) : '';
    const summaryMd =
      typeof i.summaryMd === 'string' ? i.summaryMd.slice(0, 3000) : '';
    if (!title || !summaryMd) {
      return {
        toolUseId: call.id,
        content: 'Invalid input: title/summaryMd are required.',
        isError: true,
      };
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, briefSlackWebhookUrl: true },
    });
    if (!org?.briefSlackWebhookUrl) {
      return {
        toolUseId: call.id,
        content: 'Slack webhook が未設定のため送信できません。',
        isError: true,
      };
    }

    const payload = {
      text: `${org.name} — ${title}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: title, emoji: true },
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `*${org.name}*` }],
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: summaryMd },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '_copilot (execute mode) 経由で送信。顧問の確認を前提とする下書きです。_',
            },
          ],
        },
      ],
    };

    try {
      await this.httpService.axiosRef.post(org.briefSlackWebhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10_000,
      });
      return {
        toolUseId: call.id,
        content: 'Slack へ送信しました。',
      };
    } catch (err) {
      return {
        toolUseId: call.id,
        content: err instanceof Error ? err.message : 'slack send failed',
        isError: true,
      };
    }
  }

  /**
   * エージェント共通の文脈ブロック。
   * 各セクションは個別にtry/catchし、取得失敗は「データ未連携」と明示。
   */
  private async buildContextBlock(
    orgId: string,
    fiscalYear?: number,
    endMonth?: number,
    runwayMode?: 'worstCase' | 'netBurn' | 'actual',
  ): Promise<string> {
    const [financial, alerts, actionSummary, dataHealth] = await Promise.all([
      this.safeFinancial(orgId, fiscalYear, endMonth, runwayMode),
      this.safeAlerts(orgId, fiscalYear, endMonth),
      this.safeActionSummary(orgId),
      this.safeDataHealth(orgId),
    ]);

    return [financial, alerts, actionSummary, dataHealth]
      .filter((x) => x)
      .join('\n\n');
  }

  private async safeFinancial(
    orgId: string,
    fiscalYear?: number,
    endMonth?: number,
    runwayMode?: 'worstCase' | 'netBurn' | 'actual',
  ): Promise<string> {
    try {
      const [pl, bs, bsT, plT, settledMonths] = await Promise.all([
        this.mfApi.getTrialBalancePL(orgId, fiscalYear, endMonth),
        this.mfApi.getTrialBalanceBS(orgId, fiscalYear, endMonth),
        this.mfApi.getTransitionBS(orgId, fiscalYear, endMonth).catch(() => null),
        this.mfApi.getTransitionPL(orgId, fiscalYear, endMonth).catch(() => null),
        fiscalYear ? this.monthlyClose.getSettledMonths(orgId, fiscalYear) : Promise.resolve(undefined),
      ]);
      const cashflowDerived =
        bsT && plT ? this.mfTransform.deriveCashflow(bsT, plT, bs, settledMonths) : undefined;
      const d = this.mfTransform.buildDashboardSummary(pl, bs, cashflowDerived);
      const burnContext = cashflowDerived
        ? this.mfTransform.formatBurnContextForPrompt(cashflowDerived, runwayMode)
        : `- ランウェイ: ${d.runway}ヶ月`;
      return [
        '## 財務KPI (MF会計, 確定値)',
        `- 売上高: ${formatYen(d.revenue)}`,
        `- 営業利益: ${formatYen(d.operatingProfit)}`,
        `- 経常利益: ${formatYen(d.ordinaryProfit)}`,
        `- 現預金: ${formatYen(d.cashBalance)}`,
        `- 期間: ${d.period.start}〜${d.period.end}`,
        '',
        burnContext,
      ].join('\n');
    } catch {
      return '## 財務KPI\n- MF会計未連携のためデータ取得不可';
    }
  }

  private async safeAlerts(
    orgId: string,
    fiscalYear?: number,
    endMonth?: number,
  ): Promise<string> {
    try {
      const items = await this.alerts.detectAlerts(orgId, fiscalYear, endMonth);
      if (items.length === 0) {
        return '## アラート\n- 検知なし';
      }
      const top = items.slice(0, 5);
      return [
        `## アラート (上位${top.length}件 / 全${items.length}件)`,
        ...top.map(
          (a) =>
            `- [${a.severity}] ${a.title}: ${a.description.slice(0, 120)}`,
        ),
      ].join('\n');
    } catch {
      return '## アラート\n- 検知処理失敗';
    }
  }

  private async safeActionSummary(orgId: string): Promise<string> {
    try {
      const s = await this.actions.summary(orgId);
      return [
        '## Action状況',
        `- 未完了: ${s.total}件 (未着手 ${s.notStarted} / 進行中 ${s.inProgress})`,
        `- 期限超過: ${s.overdue}件`,
      ].join('\n');
    } catch {
      return '## Action状況\n- 取得失敗';
    }
  }

  private async safeDataHealth(orgId: string): Promise<string> {
    try {
      const s = await this.dataHealth.getStatus(orgId);
      const failed = s.sources
        .filter((x: { status: string | null }) => x.status === 'FAILED')
        .map((x: { source: string }) => x.source);
      const stale = s.sources.filter((x: { lastSyncAt: string | null }) => !x.lastSyncAt);
      return [
        '## データ鮮度',
        `- 総合: ${s.overall}`,
        failed.length > 0 ? `- 同期失敗: ${failed.join(', ')}` : '- 同期失敗: なし',
        stale.length > 0
          ? `- 未連携: ${stale.map((x: { source: string }) => x.source).join(', ')}`
          : '- 未連携: なし',
      ].join('\n');
    } catch {
      return '## データ鮮度\n- 取得失敗';
    }
  }
}

function formatYen(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const man = Math.round(n / 10000);
  return `${man.toLocaleString('ja-JP')}万円`;
}

function normalizeEnum(
  v: unknown,
  allowed: readonly string[],
): string | null {
  if (typeof v !== 'string') return null;
  return allowed.includes(v) ? v : null;
}
