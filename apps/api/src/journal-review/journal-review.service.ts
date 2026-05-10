import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    month?: number,
  ): Promise<JournalReviewFlagItem[]> {
    const { tenantId } = await this.resolveOrg(orgId);
    const items = await this.prisma.journalReviewFlag.findMany({
      where: {
        tenantId,
        orgId,
        fiscalYear,
        ...(month != null ? { month } : {}),
      },
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

  // ============================================================
  // コメント (Phase 2-2: スレッド + 返信)
  // ============================================================

  /**
   * 期間内のコメント全件を返す。Web 側で journal_id ごとに groupBy する。
   * 返信は parent_comment_id で root に紐づく (Web 側でツリー組み立て)。
   */
  async listComments(
    orgId: string,
    journalIds?: string[],
  ): Promise<JournalReviewCommentItem[]> {
    const { tenantId } = await this.resolveOrg(orgId);
    const where: Prisma.JournalReviewCommentWhereInput = { tenantId, orgId };
    if (journalIds && journalIds.length > 0) {
      where.journalId = { in: journalIds };
    }
    const items = await this.prisma.journalReviewComment.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { name: true } } },
    });
    return items.map(toCommentItem);
  }

  async addComment(
    orgId: string,
    journalId: string,
    body: string,
    urls: string[],
    parentCommentId: string | null,
    authorId: string,
  ): Promise<JournalReviewCommentItem> {
    const { tenantId } = await this.resolveOrg(orgId);

    // parent が指定された場合、同 (org, tenant, journal) 配下にあるかチェック
    if (parentCommentId) {
      const parent = await this.prisma.journalReviewComment.findFirst({
        where: { id: parentCommentId, tenantId, orgId, journalId },
        select: { id: true, parentCommentId: true },
      });
      if (!parent) {
        throw new NotFoundException('Parent comment not found');
      }
      if (parent.parentCommentId) {
        // 返信の返信は root にぶら下げる (2 階層に flatten、ツリー深度を制御)
        parentCommentId = parent.parentCommentId;
      }
    }

    const created = await this.prisma.journalReviewComment.create({
      data: {
        tenantId,
        orgId,
        journalId,
        parentCommentId,
        body,
        urls: urls as Prisma.InputJsonValue,
        authorId,
      },
      include: { author: { select: { name: true } } },
    });
    return toCommentItem(created);
  }

  async deleteComment(
    orgId: string,
    commentId: string,
    requesterId: string,
  ): Promise<void> {
    const { tenantId } = await this.resolveOrg(orgId);
    const target = await this.prisma.journalReviewComment.findFirst({
      where: { id: commentId, tenantId, orgId },
      select: { id: true, authorId: true },
    });
    if (!target) {
      throw new NotFoundException('Comment not found');
    }
    if (target.authorId && target.authorId !== requesterId) {
      throw new ForbiddenException('You can delete only your own comment');
    }
    await this.prisma.journalReviewComment.delete({ where: { id: commentId } });
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

export interface JournalReviewCommentItem {
  id: string;
  journalId: string;
  parentCommentId: string | null;
  body: string;
  urls: string[];
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

function toCommentItem(c: {
  id: string;
  journalId: string;
  parentCommentId: string | null;
  body: string;
  urls: Prisma.JsonValue;
  authorId: string | null;
  createdAt: Date;
  updatedAt: Date;
  author?: { name: string } | null;
}): JournalReviewCommentItem {
  const urls = Array.isArray(c.urls)
    ? c.urls.filter((v): v is string => typeof v === 'string')
    : [];
  return {
    id: c.id,
    journalId: c.journalId,
    parentCommentId: c.parentCommentId,
    body: c.body,
    urls,
    authorId: c.authorId,
    authorName: c.author?.name ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
