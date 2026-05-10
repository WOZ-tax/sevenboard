import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MfApiService } from '../mf/mf-api.service';

/**
 * 仕訳レビュー: 「要確認」フラグ + (Phase 2-2 で) コメントスレッド を扱う service。
 *
 * 仕訳本体 (MF v3) は引き続き既存の `mfApi.getJournals` で取得し、ここでは
 * SevenBoard 側の overlay 情報 (flag / 解決状態 / コメント) だけを管理する。
 */
@Injectable()
export class JournalReviewService {
  constructor(
    private prisma: PrismaService,
    private mfApi: MfApiService,
  ) {}

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
   * 指定 journal のレビューメモごと削除する (flag + 紐づく全 comment)。
   * memo タブからの「メモ削除」で呼ばれる。 comments は journalId が
   * テキスト一致で紐づくだけ (FK ではない) なので、同じ transaction で消す。
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
    await this.prisma.$transaction([
      this.prisma.journalReviewComment.deleteMany({
        where: { tenantId, orgId, journalId },
      }),
      this.prisma.journalReviewFlag.delete({ where: { id: existing.id } }),
    ]);
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

  async updateComment(
    orgId: string,
    commentId: string,
    body: string,
    urls: string[],
    requesterId: string,
  ): Promise<JournalReviewCommentItem> {
    const { tenantId } = await this.resolveOrg(orgId);
    const target = await this.prisma.journalReviewComment.findFirst({
      where: { id: commentId, tenantId, orgId },
      select: { id: true, authorId: true },
    });
    if (!target) {
      throw new NotFoundException('Comment not found');
    }
    if (target.authorId && target.authorId !== requesterId) {
      throw new ForbiddenException('You can edit only your own comment');
    }
    const updated = await this.prisma.journalReviewComment.update({
      where: { id: commentId },
      data: { body, urls: urls as Prisma.InputJsonValue },
      include: { author: { select: { name: true } } },
    });
    return toCommentItem(updated);
  }

  async listSnapshots(
    orgId: string,
    fiscalYear: number,
    month?: number,
    throughMonth?: number,
  ): Promise<JournalReviewSnapshotItem[]> {
    const { tenantId, fiscalMonthEnd } = await this.resolveOrg(orgId);
    const fyStartMonth = fiscalMonthEnd === 12 ? 1 : fiscalMonthEnd + 1;
    const targetMonths =
      month != null
        ? [month]
        : monthsForFiscalPeriod(fyStartMonth, throughMonth);

    await this.ensureSnapshotMonths(orgId, tenantId, fiscalYear, targetMonths, fyStartMonth);

    const flags = await this.prisma.journalReviewFlag.findMany({
      where: {
        tenantId,
        orgId,
        fiscalYear,
        month: { in: targetMonths },
      },
      select: { journalId: true, month: true },
    });
    const journalIds = Array.from(new Set(flags.map((f) => f.journalId)));
    if (journalIds.length === 0) return [];

    let snapshots = await this.findSnapshotsForJournals(tenantId, orgId, journalIds);
    const cachedIds = new Set(snapshots.map((s) => s.journalId));
    const fallbackMonths = Array.from(
      new Set(flags.filter((f) => !cachedIds.has(f.journalId)).map((f) => f.month)),
    );
    if (fallbackMonths.length > 0) {
      await Promise.allSettled(
        fallbackMonths.map((m) =>
          this.fetchAndCacheSnapshotMonth(orgId, tenantId, fiscalYear, m, fyStartMonth),
        ),
      );
      snapshots = await this.findSnapshotsForJournals(tenantId, orgId, journalIds);
    }
    return snapshots.map(toSnapshotItem);
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

  private async findSnapshotsForJournals(
    tenantId: string,
    orgId: string,
    journalIds: string[],
  ) {
    return this.prisma.journalReviewSnapshot.findMany({
      where: {
        tenantId,
        orgId,
        journalId: { in: journalIds },
      },
      orderBy: [{ month: 'asc' }, { issueDate: 'asc' }, { number: 'asc' }],
    });
  }

  private async ensureSnapshotMonths(
    orgId: string,
    tenantId: string,
    fiscalYear: number,
    months: number[],
    fyStartMonth: number,
  ): Promise<void> {
    if (months.length === 0) return;
    const existing = await this.prisma.journalReviewSnapshotMonth.findMany({
      where: { tenantId, orgId, fiscalYear, month: { in: months } },
      select: { month: true },
    });
    const existingMonths = new Set(existing.map((m) => m.month));
    const missingMonths = months.filter((m) => !existingMonths.has(m));
    if (missingMonths.length === 0) return;

    await Promise.allSettled(
      missingMonths.map((m) =>
        this.fetchAndCacheSnapshotMonth(orgId, tenantId, fiscalYear, m, fyStartMonth),
      ),
    );
  }

  private async fetchAndCacheSnapshotMonth(
    orgId: string,
    tenantId: string,
    fiscalYear: number,
    month: number,
    fyStartMonth: number,
  ): Promise<void> {
    const year = month >= fyStartMonth ? fiscalYear : fiscalYear + 1;
    const range = monthRange(year, month);
    const data = await this.mfApi.getJournals(orgId, {
      startDate: range.start,
      endDate: range.end,
    });
    const source = Array.isArray(data?.journals) ? (data.journals as unknown[]) : [];
    const rows: NormalizedJournalSnapshot[] = [];
    for (const item of source) {
      const normalized = normalizeJournalSnapshot(item);
      if (normalized) rows.push(normalized);
    }
    const fetchedAt = new Date();

    for (const chunk of chunkArray(rows, 500)) {
      await this.prisma.journalReviewSnapshot.createMany({
        data: chunk.map((j) => ({
          tenantId,
          orgId,
          fiscalYear,
          month,
          journalId: j.id,
          number: j.number,
          issueDate: j.issueDate,
          description: j.description,
          partnerName: j.partnerName,
          debitSummary: j.debits as unknown as Prisma.InputJsonValue,
          creditSummary: j.credits as unknown as Prisma.InputJsonValue,
          totalAmount: new Prisma.Decimal(j.totalAmount),
          fetchedAt,
        })),
        skipDuplicates: true,
      });
    }

    await this.prisma.journalReviewSnapshotMonth.upsert({
      where: {
        tenantId_orgId_fiscalYear_month: { tenantId, orgId, fiscalYear, month },
      },
      create: { tenantId, orgId, fiscalYear, month, fetchedAt },
      update: { fetchedAt },
    });
  }

  private async resolveOrg(orgId: string): Promise<{ tenantId: string; fiscalMonthEnd: number }> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { tenantId: true, fiscalMonthEnd: true },
    });
    return { tenantId: org.tenantId, fiscalMonthEnd: org.fiscalMonthEnd };
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

export interface JournalReviewSideSummary {
  accountName: string;
  subAccountName?: string;
  amount: number;
}

export interface JournalReviewSnapshotItem {
  id: string;
  number: string | null;
  issueDate: string | null;
  description: string | null;
  partnerName: string | null;
  debits: JournalReviewSideSummary[];
  credits: JournalReviewSideSummary[];
  totalAmount: number;
  fiscalYear: number;
  month: number;
  fetchedAt: string;
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

function toSnapshotItem(s: {
  journalId: string;
  number: string | null;
  issueDate: string | null;
  description: string | null;
  partnerName: string | null;
  debitSummary: Prisma.JsonValue;
  creditSummary: Prisma.JsonValue;
  totalAmount: Prisma.Decimal | number | string;
  fiscalYear: number;
  month: number;
  fetchedAt: Date;
}): JournalReviewSnapshotItem {
  return {
    id: s.journalId,
    number: s.number,
    issueDate: s.issueDate,
    description: s.description,
    partnerName: s.partnerName,
    debits: parseSideSummary(s.debitSummary),
    credits: parseSideSummary(s.creditSummary),
    totalAmount: Number(s.totalAmount ?? 0),
    fiscalYear: s.fiscalYear,
    month: s.month,
    fetchedAt: s.fetchedAt.toISOString(),
  };
}

interface NormalizedJournalSnapshot {
  id: string;
  number: string | null;
  issueDate: string | null;
  description: string | null;
  partnerName: string | null;
  debits: JournalReviewSideSummary[];
  credits: JournalReviewSideSummary[];
  totalAmount: number;
}

function normalizeJournalSnapshot(j: unknown): NormalizedJournalSnapshot | null {
  const obj = j as Record<string, unknown>;
  const id = pickString(obj.id);
  if (!id) return null;
  const branches = Array.isArray(obj.branches)
    ? (obj.branches as Record<string, unknown>[])
    : [];
  const debits: JournalReviewSideSummary[] = [];
  const credits: JournalReviewSideSummary[] = [];
  let totalAmount = 0;
  let firstRemark: string | null = null;
  let firstPartner: string | null = null;

  for (const b of branches) {
    if (firstRemark == null) {
      const remark = pickString(b.remark);
      if (remark) firstRemark = remark;
    }
    const debit = normalizeJournalSide(b.debitor as Record<string, unknown> | undefined);
    if (debit) {
      debits.push(debit);
      totalAmount += debit.amount;
      if (firstPartner == null) {
        firstPartner = pickString((b.debitor as Record<string, unknown> | undefined)?.trade_partner_name) ?? null;
      }
    }
    const credit = normalizeJournalSide(b.creditor as Record<string, unknown> | undefined);
    if (credit) {
      credits.push(credit);
      if (firstPartner == null) {
        firstPartner = pickString((b.creditor as Record<string, unknown> | undefined)?.trade_partner_name) ?? null;
      }
    }
  }

  return {
    id,
    number: normalizeNumber(obj.number),
    issueDate:
      pickString(obj.transaction_date) ??
      pickString(obj.date) ??
      pickString(obj.issue_date) ??
      null,
    description:
      firstRemark ??
      pickString(obj.memo) ??
      pickString(obj.description) ??
      null,
    partnerName:
      firstPartner ??
      pickString(obj.partner_name) ??
      pickString(obj.trade_partner_name) ??
      null,
    debits,
    credits,
    totalAmount,
  };
}

function normalizeJournalSide(side: Record<string, unknown> | undefined): JournalReviewSideSummary | null {
  if (!side) return null;
  return {
    accountName: pickString(side.account_name) ?? '—',
    subAccountName: pickString(side.sub_account_name),
    amount: Number(side.value ?? side.amount ?? 0),
  };
}

function parseSideSummary(value: Prisma.JsonValue): JournalReviewSideSummary[] {
  if (!Array.isArray(value)) return [];
  const out: JournalReviewSideSummary[] = [];
  for (const v of value) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const obj = v as Record<string, unknown>;
    const accountName = pickString(obj.accountName);
    if (!accountName) continue;
    out.push({
      accountName,
      subAccountName: pickString(obj.subAccountName),
      amount: Number(obj.amount ?? 0),
    });
  }
  return out;
}

function normalizeNumber(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return pickString(value) ?? null;
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function monthsForFiscalPeriod(fyStartMonth: number, throughMonth?: number): number[] {
  const months: number[] = [];
  for (let i = 0; i < 12; i++) {
    months.push(((fyStartMonth - 1 + i) % 12) + 1);
  }
  if (throughMonth == null) return months;
  const idx = months.indexOf(throughMonth);
  return idx >= 0 ? months.slice(0, idx + 1) : months;
}

function monthRange(year: number, month: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { start: fmt(start), end: fmt(end) };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
