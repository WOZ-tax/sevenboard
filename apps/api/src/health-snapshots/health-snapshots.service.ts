import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MfApiService } from '../mf/mf-api.service';
import { MfTransformService } from '../mf/mf-transform.service';
import {
  computeHealthScore,
  type HealthScoreBreakdown,
} from './health-score-calculator';
import type { FinancialIndicators } from '../mf/types/mf-api.types';

export interface HealthSnapshotItem {
  id: string;
  snapshotDate: string;
  score: number;
  prevScore: number | null;
  breakdown: HealthScoreBreakdown;
  indicators: FinancialIndicators;
  aiQuestions: string[];
  createdAt: string;
}

@Injectable()
export class HealthSnapshotsService {
  private readonly logger = new Logger('HealthSnapshotsService');

  constructor(
    private prisma: PrismaService,
    private mfApi: MfApiService,
    private mfTransform: MfTransformService,
  ) {}

  /**
   * 当月の健康スナップショットを計算 → 保存。
   *
   * MF 同期完了時 (sync.service) と「健康再計算」ボタンから呼ばれる。
   * fiscalYear / month を明示。指定がなければ今日の月を採る。
   *
   * AI 質問生成は別サービス (health-questions.service) で行うため、
   * このメソッドではスコア計算と保存のみ担当。aiQuestions は引数で受け取る。
   */
  async computeAndSave(
    orgId: string,
    fiscalYear: number,
    month: number,
    aiQuestions?: string[],
  ): Promise<HealthSnapshotItem> {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { industry: true },
    });

    const [pl, bs] = await Promise.all([
      this.mfApi.getTrialBalancePL(orgId, fiscalYear, month),
      this.mfApi.getTrialBalanceBS(orgId, fiscalYear, month),
    ]);
    const indicators = this.mfTransform.calculateFinancialIndicators(pl, bs);
    const { score, breakdown } = computeHealthScore(
      indicators,
      org?.industry ?? null,
    );

    const snapshotDate = new Date(Date.UTC(fiscalYear, month - 1, 1));

    // 1 ヶ月前のスナップショット (前月比表示用)
    const prevMonthDate = new Date(Date.UTC(fiscalYear, month - 2, 1));
    const prev = await this.prisma.healthSnapshot.findFirst({
      where: { tenantId, orgId, snapshotDate: prevMonthDate },
      select: { score: true },
    });

    const saved = await this.prisma.healthSnapshot.upsert({
      where: {
        tenantId_orgId_snapshotDate: {
          tenantId,
          orgId,
          snapshotDate,
        },
      },
      update: {
        score,
        prevScore: prev?.score ?? null,
        breakdown: breakdown as object,
        indicators: indicators as unknown as object,
        ...(aiQuestions ? { aiQuestions: aiQuestions as object } : {}),
      },
      create: {
        tenantId,
        orgId,
        snapshotDate,
        score,
        prevScore: prev?.score ?? null,
        breakdown: breakdown as object,
        indicators: indicators as unknown as object,
        aiQuestions: (aiQuestions ?? []) as object,
      },
    });

    this.logger.log(
      `health snapshot saved for org ${orgId} ${fiscalYear}-${month}: score=${score}` +
        (prev ? ` (prev=${prev.score}, delta=${score - prev.score})` : ''),
    );

    return this.toItem(saved);
  }

  async getLatest(orgId: string): Promise<HealthSnapshotItem | null> {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const row = await this.prisma.healthSnapshot.findFirst({
      where: { tenantId, orgId },
      orderBy: { snapshotDate: 'desc' },
    });
    return row ? this.toItem(row) : null;
  }

  async getByMonth(
    orgId: string,
    fiscalYear: number,
    month: number,
  ): Promise<HealthSnapshotItem | null> {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const snapshotDate = new Date(Date.UTC(fiscalYear, month - 1, 1));
    const row = await this.prisma.healthSnapshot.findUnique({
      where: {
        tenantId_orgId_snapshotDate: { tenantId, orgId, snapshotDate },
      },
    });
    return row ? this.toItem(row) : null;
  }

  async getHistory(
    orgId: string,
    months: number,
  ): Promise<HealthSnapshotItem[]> {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const rows = await this.prisma.healthSnapshot.findMany({
      where: { tenantId, orgId },
      orderBy: { snapshotDate: 'desc' },
      take: Math.min(Math.max(months, 1), 36),
    });
    return rows.map((r) => this.toItem(r)).reverse(); // 古い → 新しい
  }

  /**
   * 既存の保存済 aiQuestions を更新する (HealthQuestionsService が後から差し込む用)。
   */
  async updateAiQuestions(
    orgId: string,
    fiscalYear: number,
    month: number,
    questions: string[],
  ): Promise<HealthSnapshotItem> {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const snapshotDate = new Date(Date.UTC(fiscalYear, month - 1, 1));
    const existing = await this.prisma.healthSnapshot.findUnique({
      where: { tenantId_orgId_snapshotDate: { tenantId, orgId, snapshotDate } },
    });
    if (!existing) {
      throw new NotFoundException('HealthSnapshot not found for the period');
    }
    const updated = await this.prisma.healthSnapshot.update({
      where: { id: existing.id },
      data: { aiQuestions: questions as object },
    });
    return this.toItem(updated);
  }

  private toItem(row: {
    id: string;
    snapshotDate: Date;
    score: number;
    prevScore: number | null;
    breakdown: unknown;
    indicators: unknown;
    aiQuestions: unknown;
    createdAt: Date;
  }): HealthSnapshotItem {
    return {
      id: row.id,
      snapshotDate: row.snapshotDate.toISOString().slice(0, 10),
      score: row.score,
      prevScore: row.prevScore,
      breakdown:
        typeof row.breakdown === 'object' && row.breakdown !== null
          ? (row.breakdown as HealthScoreBreakdown)
          : ({
              activity: 0,
              safety: 0,
              efficiency: 0,
              detail: {
                operatingProfitMargin: 0,
                roe: 0,
                roa: 0,
                currentRatio: 0,
                equityRatio: 0,
                debtCoverage: 0,
                totalAssetTurnover: 0,
                receivablesTurnover: 0,
              },
            } as HealthScoreBreakdown),
      indicators:
        typeof row.indicators === 'object' && row.indicators !== null
          ? (row.indicators as FinancialIndicators)
          : ({
              currentRatio: 0,
              equityRatio: 0,
              debtEquityRatio: 0,
              grossProfitMargin: 0,
              operatingProfitMargin: 0,
              roe: 0,
              roa: 0,
              totalAssetTurnover: 0,
              receivablesTurnover: 0,
            } as FinancialIndicators),
      aiQuestions: Array.isArray(row.aiQuestions)
        ? (row.aiQuestions as string[])
        : [],
      createdAt: row.createdAt.toISOString(),
    };
  }
}
