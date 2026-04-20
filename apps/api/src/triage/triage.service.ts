import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AlertsService, AlertItem } from '../alerts/alerts.service';
import { DataHealthService } from '../data-health/data-health.service';
import { ActionSeverity, ActionStatus } from '@prisma/client';

export type TriageBucket = 'URGENT' | 'THIS_WEEK' | 'MONTHLY' | 'NOISE';

export interface TriageSignal {
  id: string;
  source: 'ACTION' | 'ALERT' | 'DATA_SYNC' | 'BUSINESS_EVENT';
  bucket: TriageBucket;
  title: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  agentOwner: 'brief' | 'sentinel' | 'drafter' | 'auditor';
  /** 分類理由（人間が読んで納得できるもの） */
  reason: string;
  /** 根拠データソース */
  evidenceSource: string;
  /** 信頼度 */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  /** 遷移先URL */
  linkHref?: string;
  /** 検知日時 */
  detectedAt: string;
  /** 紐付けレコードID（Action ID等） */
  refId?: string;
}

export interface TriageSummary {
  urgent: number;
  thisWeek: number;
  monthly: number;
  noise: number;
  total: number;
  lastRunAt: string;
}

@Injectable()
export class TriageService {
  private readonly logger = new Logger(TriageService.name);

  constructor(
    private prisma: PrismaService,
    private alertsService: AlertsService,
    private dataHealthService: DataHealthService,
  ) {}

  async classify(
    orgId: string,
    options?: { fiscalYear?: number; endMonth?: number },
  ): Promise<{ summary: TriageSummary; signals: TriageSignal[] }> {
    const signals: TriageSignal[] = [];

    // 1. Actions（未完了のみ）
    try {
      const actions = await this.prisma.action.findMany({
        where: {
          orgId,
          status: { in: ['NOT_STARTED', 'IN_PROGRESS'] satisfies ActionStatus[] },
        },
        orderBy: [{ severity: 'asc' }, { dueDate: 'asc' }],
      });
      for (const a of actions) {
        signals.push(this.classifyAction(a));
      }
    } catch (err) {
      this.logger.warn(`Failed to fetch actions: ${err instanceof Error ? err.message : err}`);
    }

    // 2. Alerts（MF連携できれば）
    try {
      const alerts = await this.alertsService.detectAlerts(
        orgId,
        options?.fiscalYear,
        options?.endMonth,
      );
      for (const a of alerts) {
        signals.push(this.classifyAlert(a));
      }
    } catch (err) {
      this.logger.warn(
        `Failed to detect alerts: ${err instanceof Error ? err.message : err}`,
      );
    }

    // 3. Data sync health
    try {
      const health = await this.dataHealthService.getStatus(orgId);
      for (const s of health.sources) {
        const signal = this.classifyDataSync(s);
        if (signal) signals.push(signal);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to fetch data health: ${err instanceof Error ? err.message : err}`,
      );
    }

    // サマリ
    const summary: TriageSummary = {
      urgent: signals.filter((s) => s.bucket === 'URGENT').length,
      thisWeek: signals.filter((s) => s.bucket === 'THIS_WEEK').length,
      monthly: signals.filter((s) => s.bucket === 'MONTHLY').length,
      noise: signals.filter((s) => s.bucket === 'NOISE').length,
      total: signals.length,
      lastRunAt: new Date().toISOString(),
    };

    // 並び替え: URGENT → THIS_WEEK → MONTHLY → NOISE、内部は重要度順
    const bucketOrder: Record<TriageBucket, number> = {
      URGENT: 0,
      THIS_WEEK: 1,
      MONTHLY: 2,
      NOISE: 3,
    };
    const sevOrder: Record<TriageSignal['severity'], number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
      INFO: 4,
    };
    signals.sort((a, b) => {
      const bd = bucketOrder[a.bucket] - bucketOrder[b.bucket];
      if (bd !== 0) return bd;
      return sevOrder[a.severity] - sevOrder[b.severity];
    });

    return { summary, signals };
  }

  /* ---------- classification rules ---------- */

  private classifyAction(a: {
    id: string;
    title: string;
    description: string | null;
    severity: ActionSeverity;
    dueDate: Date | null;
    status: ActionStatus;
    sourceScreen: string;
    createdAt: Date;
  }): TriageSignal {
    const now = new Date();
    const due = a.dueDate;
    const daysUntilDue = due
      ? Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    let bucket: TriageBucket;
    let reason: string;

    if (
      a.severity === 'CRITICAL' ||
      (daysUntilDue !== null && daysUntilDue < 0)
    ) {
      bucket = 'URGENT';
      reason =
        a.severity === 'CRITICAL'
          ? '重要度CRITICALのため'
          : `期限超過（${daysUntilDue}日）のため`;
    } else if (
      a.severity === 'HIGH' ||
      (daysUntilDue !== null && daysUntilDue <= 7)
    ) {
      bucket = 'THIS_WEEK';
      reason =
        a.severity === 'HIGH'
          ? '重要度HIGHのため'
          : `期限が${daysUntilDue}日以内のため`;
    } else if (a.severity === 'MEDIUM') {
      bucket = 'MONTHLY';
      reason = '重要度MEDIUMで期限に余裕があるため';
    } else {
      bucket = 'NOISE';
      reason = '重要度LOWのため、定常業務として処理';
    }

    return {
      id: `action:${a.id}`,
      source: 'ACTION',
      bucket,
      title: a.title,
      description: a.description ?? '',
      severity: a.severity,
      agentOwner: this.inferAgent(a.sourceScreen),
      reason,
      evidenceSource: `Action: ${sourceScreenLabel(a.sourceScreen)} · 作成 ${formatDate(a.createdAt)}`,
      confidence: 'HIGH',
      linkHref: `/actions`,
      detectedAt: a.createdAt.toISOString(),
      refId: a.id,
    };
  }

  private classifyAlert(a: AlertItem): TriageSignal {
    const sev =
      a.severity === 'critical'
        ? 'CRITICAL'
        : a.severity === 'warning'
          ? 'HIGH'
          : 'MEDIUM';

    let bucket: TriageBucket;
    let reason: string;

    if (sev === 'CRITICAL') {
      bucket = 'URGENT';
      reason = 'アラート重要度がCRITICALのため';
    } else if (sev === 'HIGH') {
      bucket = 'THIS_WEEK';
      reason = 'アラート重要度がWARNINGのため';
    } else {
      bucket = 'MONTHLY';
      reason = 'アラート重要度がINFOのため';
    }

    // タイトルからエージェント推定
    const isCashAlert = /ランウェイ|資金|現金|キャッシュ/.test(a.title);
    const agent: TriageSignal['agentOwner'] = isCashAlert ? 'sentinel' : 'brief';

    return {
      id: `alert:${a.id}`,
      source: 'ALERT',
      bucket,
      title: a.title,
      description: a.description,
      severity: sev,
      agentOwner: agent,
      reason,
      evidenceSource: `MFクラウド試算表 · ${formatDate(new Date(a.detectedAt))}`,
      confidence: 'HIGH',
      linkHref: '/alerts',
      detectedAt: a.detectedAt,
      refId: a.id,
    };
  }

  private classifyDataSync(status: {
    source: string;
    lastSyncAt: string | null;
    status: string | null;
    errorMessage: string | null;
  }): TriageSignal | null {
    if (status.status === 'SUCCESS' || status.status === null) return null;

    const isFailed = status.status === 'FAILED';
    const severity = isFailed ? 'HIGH' : 'MEDIUM';
    const bucket: TriageBucket = isFailed ? 'URGENT' : 'THIS_WEEK';

    return {
      id: `sync:${status.source}:${status.lastSyncAt ?? 'never'}`,
      source: 'DATA_SYNC',
      bucket,
      title: `${sourceLabel(status.source)}の同期に${isFailed ? '失敗' : '部分的な問題'}`,
      description:
        status.errorMessage ??
        '詳細はデータ鮮度センターで確認してください',
      severity,
      agentOwner: 'auditor',
      reason: isFailed
        ? '外部連携が失敗しているため、数値の信頼性が損なわれている'
        : '外部連携が部分的に成功している',
      evidenceSource: `データ鮮度センター · ${status.lastSyncAt ? formatDate(new Date(status.lastSyncAt)) : '未同期'}`,
      confidence: 'HIGH',
      linkHref: '/data-health',
      detectedAt: status.lastSyncAt ?? new Date().toISOString(),
    };
  }

  private inferAgent(sourceScreen: string): TriageSignal['agentOwner'] {
    switch (sourceScreen) {
      case 'CASHFLOW':
        return 'sentinel';
      case 'AI_REPORT':
        return 'drafter';
      case 'MONTHLY_REVIEW':
        return 'auditor';
      default:
        return 'brief';
    }
  }
}

/* ---------- helpers ---------- */

function formatDate(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function sourceScreenLabel(s: string): string {
  const map: Record<string, string> = {
    DASHBOARD: 'ダッシュボード',
    ALERTS: 'アラート',
    CASHFLOW: '資金繰り',
    MONTHLY_REVIEW: '月次レビュー',
    AI_REPORT: 'AIレポート',
    VARIANCE: '予実差異',
    KPI: 'KPI',
    MANUAL: '手動作成',
  };
  return map[s] ?? s;
}

function sourceLabel(s: string): string {
  const map: Record<string, string> = {
    MF_CLOUD: 'MFクラウド',
    KINTONE: 'kintone',
    SLACK: 'Slack',
    TAX_PLUGIN: 'Tax',
    BOOKKEEPING_PLUGIN: 'Bookkeeping',
  };
  return map[s] ?? s;
}
