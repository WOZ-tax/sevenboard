import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentRunsService } from '../agent-runs/agent-runs.service';

export type AuditorSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface AuditorFinding {
  id: string;
  category:
    | 'COVERAGE_GAP'
    | 'RECURRING_FINDING'
    | 'RULE_DECAY'
    | 'DATA_FRESHNESS';
  severity: AuditorSeverity;
  title: string;
  body: string;
  evidence: {
    source: string;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    premise: string;
  };
  linkHref?: string;
}

export interface AuditorResponse {
  generatedAt: string;
  findings: AuditorFinding[];
  fallbackReason?: string;
}

@Injectable()
export class AuditorService {
  constructor(
    private prisma: PrismaService,
    private agentRuns: AgentRunsService,
  ) {}

  async checkQuality(orgId: string): Promise<AuditorResponse> {
    const now = new Date();
    const startedAt = Date.now();
    const findings: AuditorFinding[] = [];

    // 1) 再発検知: 同一 sourceScreen × 同じ severity のActionが直近90日で3件以上
    const recurring = await this.findRecurringActions(orgId, 90);
    for (const r of recurring) {
      findings.push({
        id: `recurring-${r.sourceScreen}-${r.severity}`,
        category: 'RECURRING_FINDING',
        severity: r.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
        title: `${labelSourceScreen(r.sourceScreen)}の同種指摘が${r.count}件繰り返し発生`,
        body: `直近90日に ${r.severity} 相当のActionが${r.count}件。同じ根本原因の可能性があるため、ルールの見直しまたは恒久対策の検討を推奨。`,
        evidence: {
          source: 'actions テーブル (source_screen + severity)',
          confidence: 'HIGH',
          premise: '90日間で3件以上の同種Actionを再発と定義',
        },
        linkHref: `/actions?source=${r.sourceScreen}`,
      });
    }

    // 2) 放置検知: 期限超過のActionが5件以上
    const overdue = await this.prisma.action.count({
      where: {
        orgId,
        status: { not: 'COMPLETED' },
        dueDate: { lt: now },
      },
    });
    if (overdue >= 5) {
      findings.push({
        id: 'overdue-backlog',
        category: 'COVERAGE_GAP',
        severity: overdue >= 15 ? 'HIGH' : 'MEDIUM',
        title: `期限超過Actionが${overdue}件累積`,
        body: `期限切れかつ未完了のActionが${overdue}件。担当の再割り当て、または既に対応不要であれば棚卸を推奨。`,
        evidence: {
          source: 'actions テーブル (status ≠ COMPLETED, due_date < now)',
          confidence: 'HIGH',
          premise: '期限を過ぎて未完了のものを累積負債と扱う',
        },
        linkHref: '/actions?overdue=true',
      });
    }

    // 3) ルール陳腐化の予兆: Actionが一度も着手されず閉じている or ずっとNOT_STARTED
    const staleCount = await this.prisma.action.count({
      where: {
        orgId,
        status: 'NOT_STARTED',
        createdAt: { lt: daysAgo(30) },
      },
    });
    if (staleCount >= 3) {
      findings.push({
        id: 'never-started',
        category: 'RULE_DECAY',
        severity: 'LOW',
        title: `30日以上着手されないActionが${staleCount}件`,
        body: `作成から30日以上経ってもNOT_STARTEDのままのActionが${staleCount}件。発生源の検知ルールが現場の優先度と合っていない可能性。`,
        evidence: {
          source: 'actions テーブル (status = NOT_STARTED, created_at < now-30d)',
          confidence: 'MEDIUM',
          premise: '長期未着手は優先度ミスマッチのシグナルと仮定',
        },
        linkHref: '/actions',
      });
    }

    // 4) データ鮮度: 直近の同期失敗が多い
    const syncFail = await this.prisma.dataSyncLog.count({
      where: {
        orgId,
        status: 'FAILED',
        syncedAt: { gte: daysAgo(7) },
      },
    });
    if (syncFail >= 3) {
      findings.push({
        id: 'sync-fail-burst',
        category: 'DATA_FRESHNESS',
        severity: syncFail >= 10 ? 'HIGH' : 'MEDIUM',
        title: `直近7日のデータ同期失敗が${syncFail}件`,
        body: `外部連携の失敗が集中。指標の信頼性に影響するため接続設定の確認を推奨。`,
        evidence: {
          source: 'data_sync_logs テーブル (status = FAILED, 7日以内)',
          confidence: 'HIGH',
          premise: 'MF/kintone等の同期ログ',
        },
        linkHref: '/settings',
      });
    }

    findings.sort((a, b) => sevRank(b.severity) - sevRank(a.severity));

    const result: AuditorResponse = {
      generatedAt: now.toISOString(),
      findings: findings.slice(0, 5),
      fallbackReason: findings.length === 0 ? '品質上の指摘事項なし' : undefined,
    };
    await this.agentRuns.logRun({
      orgId,
      agentKey: 'AUDITOR',
      mode: 'OBSERVE',
      input: {},
      output: result as unknown as Record<string, unknown>,
      status: findings.length === 0 ? 'FALLBACK' : 'SUCCESS',
      durationMs: Date.now() - startedAt,
    });
    return result;
  }

  private async findRecurringActions(
    orgId: string,
    days: number,
  ): Promise<
    Array<{ sourceScreen: string; severity: string; count: number }>
  > {
    const rows = await this.prisma.$queryRaw<
      Array<{ source_screen: string; severity: string; cnt: bigint }>
    >`
      SELECT source_screen, severity, COUNT(*)::bigint AS cnt
      FROM actions
      WHERE org_id = ${orgId}::uuid
        AND created_at >= NOW() - (${days}::int || ' days')::interval
      GROUP BY source_screen, severity
      HAVING COUNT(*) >= 3
      ORDER BY cnt DESC
      LIMIT 5
    `;
    return rows.map((r) => ({
      sourceScreen: r.source_screen,
      severity: r.severity,
      count: Number(r.cnt),
    }));
  }
}

function sevRank(s: AuditorSeverity): number {
  switch (s) {
    case 'CRITICAL':
      return 5;
    case 'HIGH':
      return 4;
    case 'MEDIUM':
      return 3;
    case 'LOW':
      return 2;
    case 'INFO':
      return 1;
  }
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function labelSourceScreen(s: string): string {
  const map: Record<string, string> = {
    DASHBOARD: 'ダッシュボード',
    ALERTS: 'アラート',
    AI_REPORT: 'AIレポート',
    MONTHLY_REVIEW: '月次レビュー',
    CASHFLOW: '資金繰り',
    TRIAGE: 'トリアージ',
  };
  return map[s] ?? s;
}
