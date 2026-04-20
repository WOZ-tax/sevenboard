import { Injectable } from '@nestjs/common';
import { SyncSource, SyncResult, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordSyncParams {
  orgId: string;
  source: SyncSource;
  status: SyncResult;
  errorMessage?: string;
  durationMs?: number;
}

@Injectable()
export class DataHealthService {
  constructor(private prisma: PrismaService) {}

  async getStatus(orgId: string) {
    // 各sourceの最新ログを取得
    const sources: SyncSource[] = [
      'MF_CLOUD',
      'KINTONE',
      'SLACK',
      'TAX_PLUGIN',
      'BOOKKEEPING_PLUGIN',
    ];

    const statuses = await Promise.all(
      sources.map(async (source) => {
        const latest = await this.prisma.dataSyncLog.findFirst({
          where: { orgId, source },
          orderBy: { syncedAt: 'desc' },
        });
        return {
          source,
          lastSyncAt: latest?.syncedAt.toISOString() ?? null,
          status: latest?.status ?? null,
          errorMessage: latest?.errorMessage ?? null,
          durationMs: latest?.durationMs ?? null,
        };
      }),
    );

    const overall = this.computeOverall(statuses);

    return { overall, sources: statuses };
  }

  async getRecentLogs(orgId: string, limit = 50) {
    const logs = await this.prisma.dataSyncLog.findMany({
      where: { orgId },
      orderBy: { syncedAt: 'desc' },
      take: Math.min(limit, 200),
    });
    return logs.map((l) => ({
      id: l.id,
      source: l.source,
      status: l.status,
      errorMessage: l.errorMessage,
      syncedAt: l.syncedAt.toISOString(),
      durationMs: l.durationMs,
    }));
  }

  async record(params: RecordSyncParams) {
    return this.prisma.dataSyncLog.create({
      data: {
        orgId: params.orgId,
        source: params.source,
        status: params.status,
        errorMessage: params.errorMessage ?? null,
        durationMs: params.durationMs ?? null,
      },
    });
  }

  private computeOverall(
    statuses: Array<{ source: SyncSource; status: SyncResult | null; lastSyncAt: string | null }>,
  ): 'HEALTHY' | 'DEGRADED' | 'UNKNOWN' {
    const known = statuses.filter((s) => s.status !== null);
    if (known.length === 0) return 'UNKNOWN';
    const anyFailed = known.some((s) => s.status === 'FAILED');
    const anyPartial = known.some((s) => s.status === 'PARTIAL');
    if (anyFailed) return 'DEGRADED';
    if (anyPartial) return 'DEGRADED';
    return 'HEALTHY';
  }
}
