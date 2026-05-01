import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FindingStatus, RiskLayer } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RiskScanOrchestrator } from '../sentinel/risk-rules/orchestrator.service';

export interface RiskFindingListItem {
  id: string;
  fiscalYear: number;
  month: number;
  layer: RiskLayer;
  ruleKey: string;
  scopeKey: string;
  title: string;
  body: string;
  riskScore: number;
  flags: string[];
  evidence: Record<string, unknown>;
  recommendedAction: string;
  status: FindingStatus;
  detectedAt: string;
  resolvedAt: string | null;
}

@Injectable()
export class RiskFindingsService {
  private readonly logger = new Logger('RiskFindingsService');

  constructor(
    private prisma: PrismaService,
    private orchestrator: RiskScanOrchestrator,
  ) {}

  async list(
    orgId: string,
    fiscalYear: number,
    month: number,
    statuses: FindingStatus[] = [FindingStatus.OPEN, FindingStatus.CONFIRMED],
  ): Promise<RiskFindingListItem[]> {
    const { tenantId } = await this.prisma.orgScope(orgId);

    const rows = await this.prisma.riskFinding.findMany({
      where: {
        tenantId,
        orgId,
        fiscalYear,
        month,
        status: { in: statuses },
      },
      orderBy: [{ riskScore: 'desc' }, { detectedAt: 'desc' }],
    });

    return rows.map((r) => ({
      id: r.id,
      fiscalYear: r.fiscalYear,
      month: r.month,
      layer: r.layer,
      ruleKey: r.ruleKey,
      scopeKey: r.scopeKey,
      title: r.title,
      body: r.body,
      riskScore: r.riskScore,
      flags: Array.isArray(r.flags) ? (r.flags as unknown as string[]) : [],
      evidence:
        typeof r.evidence === 'object' && r.evidence !== null
          ? (r.evidence as Record<string, unknown>)
          : {},
      recommendedAction: r.recommendedAction,
      status: r.status,
      detectedAt: r.detectedAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    }));
  }

  async updateStatus(
    orgId: string,
    findingId: string,
    status: FindingStatus,
    actorUserId: string,
  ): Promise<RiskFindingListItem> {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const finding = await this.prisma.riskFinding.findUnique({
      where: { id: findingId },
    });
    if (!finding) throw new NotFoundException('RiskFinding not found');
    if (finding.tenantId !== tenantId || finding.orgId !== orgId) {
      throw new ForbiddenException('RiskFinding does not belong to this organization');
    }

    const isResolution =
      status === FindingStatus.RESOLVED || status === FindingStatus.DISMISSED;

    const updated = await this.prisma.riskFinding.update({
      where: { id: findingId },
      data: {
        status,
        resolvedById: isResolution ? actorUserId : null,
        resolvedAt: isResolution ? new Date() : null,
      },
    });

    return {
      id: updated.id,
      fiscalYear: updated.fiscalYear,
      month: updated.month,
      layer: updated.layer,
      ruleKey: updated.ruleKey,
      scopeKey: updated.scopeKey,
      title: updated.title,
      body: updated.body,
      riskScore: updated.riskScore,
      flags: Array.isArray(updated.flags)
        ? (updated.flags as unknown as string[])
        : [],
      evidence:
        typeof updated.evidence === 'object' && updated.evidence !== null
          ? (updated.evidence as Record<string, unknown>)
          : {},
      recommendedAction: updated.recommendedAction,
      status: updated.status,
      detectedAt: updated.detectedAt.toISOString(),
      resolvedAt: updated.resolvedAt?.toISOString() ?? null,
    };
  }

  /**
   * 手動再検証。L1 はコスト無料 (TS 関数のみ) なので随時実行可。
   * L3 は LLM トークンを消費するため、「AI詳細チェック」ボタンからのみ呼ばれる想定。
   */
  async runScan(
    orgId: string,
    fiscalYear: number,
    month: number,
    layer: 'L1' | 'L3',
  ): Promise<{
    layer: 'L1' | 'L3';
    ruleCount: number;
    findingCount: number;
    errors: { ruleKey: string; message: string }[];
  }> {
    const result =
      layer === 'L1'
        ? await this.orchestrator.runL1(orgId, fiscalYear, month)
        : await this.orchestrator.runL3(orgId, fiscalYear, month);
    return {
      layer,
      ruleCount: result.ruleCount,
      findingCount: result.findingCount,
      errors: result.errors,
    };
  }
}
