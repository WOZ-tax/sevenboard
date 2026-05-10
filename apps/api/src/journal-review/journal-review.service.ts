import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 仕訳レビュー: 「要確認」フラグ + (Phase 2-2 で) コメントスレッド を扱う service。
 *
 * 仕訳本体 (MF v3) は引き続き既存の `mfApi.getJournals` で取得し、ここでは
 * SevenBoard 側の overlay 情報 (flag / 解決状態 / コメント) だけを管理する。
 */
@Injectable()
export class JournalReviewService {
  constructor(private prisma: PrismaService) {}

  /**
   * 期間 (fiscalYear × month) 内の flag 一覧を返す。
   * Web 側で journal_id をキーに lookup して赤ハイライトに使う。
   */
  async listFlags(
    orgId: string,
    fiscalYear: number,
    month: number,
  ): Promise<JournalReviewFlagItem[]> {
    const { tenantId } = await this.resolveOrg(orgId);
    const items = await this.prisma.journalReviewFlag.findMany({
      where: { tenantId, orgId, fiscalYear, month },
      orderBy: { flaggedAt: 'desc' },
    });
    return items.map((f) => ({
      id: f.id,
      journalId: f.journalId,
      fiscalYear: f.fiscalYear,
      month: f.month,
      flaggedAt: f.flaggedAt.toISOString(),
      flaggedById: f.flaggedById,
      resolvedAt: f.resolvedAt?.toISOString() ?? null,
      resolvedById: f.resolvedById,
    }));
  }

  /**
   * 指定 journal の flag を toggle (upsert)。
   *
   * 仕様:
   *   - body.resolved=false (デフォルト): 既存なし → 新規作成 (未解決) / 既存あり →
   *     resolved_at をクリア (再 open)
   *   - body.resolved=true: 既存あり → resolved_at セット (解決) / 既存なし → 何もせず
   *
   * 1 仕訳に 1 flag (UNIQUE 制約)。fiscalYear / month は flag 作成時の参考値。
   */
  async upsertFlag(
    orgId: string,
    journalId: string,
    fiscalYear: number,
    month: number,
    resolved: boolean,
    userId: string,
  ): Promise<JournalReviewFlagItem> {
    const { tenantId } = await this.resolveOrg(orgId);
    const existing = await this.prisma.journalReviewFlag.findUnique({
      where: {
        tenantId_orgId_journalId: { tenantId, orgId, journalId },
      },
    });

    let saved;
    if (existing) {
      saved = await this.prisma.journalReviewFlag.update({
        where: { id: existing.id },
        data: resolved
          ? { resolvedAt: new Date(), resolvedById: userId }
          : { resolvedAt: null, resolvedById: null, flaggedAt: new Date(), flaggedById: userId },
      });
    } else {
      // 既存なしで「解決済」を要求されても作成しない (no-op を避けるため flag 立ててから resolve に揃える)
      saved = await this.prisma.journalReviewFlag.create({
        data: {
          tenantId,
          orgId,
          fiscalYear,
          month,
          journalId,
          flaggedById: userId,
          resolvedAt: resolved ? new Date() : null,
          resolvedById: resolved ? userId : null,
        },
      });
    }

    return {
      id: saved.id,
      journalId: saved.journalId,
      fiscalYear: saved.fiscalYear,
      month: saved.month,
      flaggedAt: saved.flaggedAt.toISOString(),
      flaggedById: saved.flaggedById,
      resolvedAt: saved.resolvedAt?.toISOString() ?? null,
      resolvedById: saved.resolvedById,
    };
  }

  /**
   * 指定 journal の flag を削除 (履歴ごと消す)。
   * 通常は upsertFlag(resolved=true) で十分なので、運用上ほぼ未使用。
   */
  async deleteFlag(orgId: string, journalId: string): Promise<void> {
    const { tenantId } = await this.resolveOrg(orgId);
    const existing = await this.prisma.journalReviewFlag.findUnique({
      where: {
        tenantId_orgId_journalId: { tenantId, orgId, journalId },
      },
    });
    if (!existing) {
      throw new NotFoundException('Flag not found');
    }
    await this.prisma.journalReviewFlag.delete({ where: { id: existing.id } });
  }

  private async resolveOrg(orgId: string): Promise<{ tenantId: string }> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { tenantId: true },
    });
    return { tenantId: org.tenantId };
  }
}

export interface JournalReviewFlagItem {
  id: string;
  journalId: string;
  fiscalYear: number;
  month: number;
  flaggedAt: string;
  flaggedById: string | null;
  resolvedAt: string | null;
  resolvedById: string | null;
}
