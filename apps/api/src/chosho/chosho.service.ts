import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChoshoAnomalyType, ChoshoStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MfApiService } from '../mf/mf-api.service';
import { buildChoshoPreviewRows } from './chosho-preview.builder';
import type { MfReportRow, MfTrialBalance } from '../mf/types/mf-api.types';
import { TB_COL } from '../mf/types/mf-api.types';
import type {
  ChoshoAnomaly,
  ChoshoExpectedRuleValue,
  ChoshoPreviewResult,
  ChoshoPreviewRow,
} from './chosho-preview.types';

type ChoshoPreviewScope = 'bs' | 'pl';

/**
 * 残高調書 service。
 *
 * 役割:
 *   preview      : MF 推移表 + builder でその場生成 (DB なし)
 *   createDraft  : preview と同じロジックを再実行 → chosho_versions / chosho_rows に snapshot 保存
 *   getVersion   : 保存済 version を読み取り、UI が再描画できる shape で返す
 *
 * tenant/org 権限境界は controller の PermissionGuard で担保。本 service では
 * tenantId/orgId を必ずクエリ条件に含めて、別テナント越境を service レイヤでも二重防御する。
 */
@Injectable()
export class ChoshoService {
  constructor(
    private prisma: PrismaService,
    private mfApi: MfApiService,
  ) {}

  // ============================================================
  // preview (DB 書き込みなし)
  // ============================================================

  async preview(
    orgId: string,
    fiscalYear: number,
    selectedMonth: number,
    scope: ChoshoPreviewScope = 'bs',
  ): Promise<ChoshoPreviewResult> {
    const { fyStartMonth } = await this.resolveOrg(orgId);
    const transition =
      scope === 'pl'
        ? await this.mfApi
            .getTransitionPL(orgId, fiscalYear, selectedMonth)
            .catch(() => null)
        : await this.mfApi
            .getTransitionBS(orgId, fiscalYear, selectedMonth, {
              withSubAccounts: true,
            })
            .catch(() => null);
    const recentActivityByPath =
      scope === 'bs'
        ? await this.fetchRecentActivityByPath(orgId, fiscalYear, selectedMonth)
        : undefined;
    const { rows, monthOrder } = buildChoshoPreviewRows({
      bsTransition: transition,
      selectedMonth,
      recentActivityByPath,
      filterAccountKeywords: [],
      rowKeyPrefix: scope,
    });
    return { fiscalYear, selectedMonth, fyStartMonth, monthOrder, rows };
  }

  // ============================================================
  // createDraft (snapshot 保存)
  // ============================================================

  /**
   * preview と同じ shape の row 配列を server 側で再生成して chosho_versions / chosho_rows に保存。
   * client から row を受け取らない (越境防止)。
   *
   * Insert 順序: preview rows は DFS 順で displayOrder が連番なので、parent が必ず先に挿入される。
   * 1 pass で rowKey -> 生成された DB id の Map を逐次拡張し、子行は Map から parentRowId を解決する。
   */
  async createDraft(
    orgId: string,
    fiscalYear: number,
    selectedMonth: number,
    title: string | null,
    createdById: string,
  ): Promise<ChoshoVersionDetail> {
    const { tenantId, fyStartMonth } = await this.resolveOrg(orgId);

    // server 側で再生成。client から渡された rows は信用しない。
    const bsTransition = await this.mfApi
      .getTransitionBS(orgId, fiscalYear, selectedMonth, {
        withSubAccounts: true,
      })
      .catch(() => null);
    const recentActivityByPath = await this.fetchRecentActivityByPath(
      orgId,
      fiscalYear,
      selectedMonth,
    );
    const { rows: previewRows, monthOrder } = buildChoshoPreviewRows({
      bsTransition,
      selectedMonth,
      recentActivityByPath,
      filterAccountKeywords: [],
      rowKeyPrefix: 'bs',
    });

    const versionId = await this.prisma.$transaction(async (tx) => {
      const version = await tx.choshoVersion.create({
        data: {
          tenantId,
          orgId,
          fiscalYear,
          selectedMonth,
          status: ChoshoStatus.DRAFT,
          title,
          createdById,
        },
        select: { id: true },
      });

      // rowKey -> DB id の Map。DFS 順なので親が必ず先に入る。
      const idByRowKey = new Map<string, string>();
      for (const r of previewRows) {
        const parentRowId = r.parentRowKey
          ? (idByRowKey.get(r.parentRowKey) ?? null)
          : null;
        const created = await tx.choshoRow.create({
          data: {
            versionId: version.id,
            tenantId,
            orgId,
            level: r.level,
            displayOrder: r.displayOrder,
            parentRowId,
            // schema は accountName 必須 / subaccountName / partnerName optional の 3 列だが、
            // MF 階層の深さは不定 (2-4 階層) なので column 分離せず、すべて accountName に
            // 入れる。階層は level + parentRowId で完全復元できる。
            accountName: r.name,
            // monthlyBalances は jsonb 列。Prisma 経由で Record<number, number> をそのまま入る。
            monthlyBalances: r.monthlyBalances as Prisma.InputJsonValue,
            expectedRule: r.expectedRule,
            // expectedValue は EXPECTED_VALUE ルール時のみ意味を持つ。null は未設定として保存。
            expectedValue: r.expectedValue,
            agingCheckEnabled: r.agingCheckEnabled,
          },
          select: { id: true },
        });
        idByRowKey.set(r.rowKey, created.id);
      }

      return version.id;
    });

    // 保存後即時で詳細を返す (UI が即座に「保存済 version モード」へ遷移できるように)
    const detail = await this.getVersionInternal(orgId, versionId);
    // monthOrder は preview から流用 (DB には保存しない値)
    detail.monthOrder = monthOrder;
    detail.fyStartMonth = fyStartMonth;
    return detail;
  }

  // ============================================================
  // getVersion (snapshot 読み取り)
  // ============================================================

  async getVersion(
    orgId: string,
    versionId: string,
  ): Promise<ChoshoVersionDetail> {
    // saved version の anomaly 再判定で AGING_3M 抑制を効かせるため、
    // version の selectedMonth に対する直近3ヶ月の activity を取得しておく
    const head = await this.prisma.choshoVersion.findFirst({
      where: { id: versionId, orgId },
      select: { fiscalYear: true, selectedMonth: true },
    });
    const recentActivityByPath = head
      ? await this.fetchRecentActivityByPath(
          orgId,
          head.fiscalYear,
          head.selectedMonth,
        )
      : undefined;
    const detail = await this.getVersionInternal(
      orgId,
      versionId,
      recentActivityByPath,
    );
    // 期首月は読み取り時に Organization から再取得 (snapshot に持たない)
    const { fyStartMonth } = await this.resolveOrg(orgId);
    detail.fyStartMonth = fyStartMonth;
    detail.monthOrder = computeMonthOrderFromFyStart(fyStartMonth);
    return detail;
  }

  /**
   * tenantId は controller 経由で確定済の orgId からだけ引く (越境チェックを service 層で再度)。
   * 別テナントの versionId を投げられても 404 にする。
   */
  private async getVersionInternal(
    orgId: string,
    versionId: string,
    recentActivityByPath?: Map<string, { debit: number; credit: number }>,
  ): Promise<ChoshoVersionDetail> {
    const { tenantId } = await this.resolveOrg(orgId);

    const version = await this.prisma.choshoVersion.findFirst({
      where: { id: versionId, orgId, tenantId },
      include: {
        rows: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });
    if (!version) {
      throw new NotFoundException('Chosho version not found');
    }

    // 各 row の name path を id の親子関係から事前計算 (computeAnomaliesFromSaved の activity lookup 用)
    const namePathById = buildNamePathByIdFromSavedRows(version.rows);

    // saved row -> ChoshoPreviewRow 互換 shape へ整形。
    // rowKey = id、parentRowKey = parentRowId (UI が preview と同じレンダリング経路で再描画できる)
    const rows: ChoshoPreviewRow[] = version.rows.map((r) => {
      const monthlyBalances = parseMonthlyBalances(r.monthlyBalances);
      // Prisma の Decimal は string で来るので Number 変換。NULL は null 維持。
      const expectedValue =
        r.expectedValue == null ? null : Number(r.expectedValue.toString());
      const path = namePathById.get(r.id) ?? r.accountName;
      const recentActivity = recentActivityByPath?.get(path) ?? null;
      const anomalies = computeAnomaliesFromSaved({
        monthlyBalances,
        expectedRule: r.expectedRule as ChoshoExpectedRuleValue,
        expectedValue,
        agingCheckEnabled: r.agingCheckEnabled,
        selectedMonth: version.selectedMonth,
        recentActivity,
      });
      // 同額条件は満たしたが activity 抑制で aging を発火させなかった場合のみ、
      // tooltip 表示のため activity を残す。saved 経路では simplified に「直近3ヶ月で
      // 同額 & activity あり」のときだけ set。
      const agingSuppressedBy =
        recentActivity != null &&
        (r.agingCheckEnabled || r.expectedRule === 'AGING_3M') &&
        anomalies.every((a) => a.type !== 'AGING_3M') &&
        wasMonthlyAmountSameForLast3(monthlyBalances, version.selectedMonth) &&
        (recentActivity.debit > 0 || recentActivity.credit > 0)
          ? recentActivity
          : null;
      return {
        rowKey: r.id,
        parentRowKey: r.parentRowId,
        level: r.level,
        displayOrder: r.displayOrder,
        name: r.accountName,
        // saved row には mfType がない (snapshot 用なので) — UI は mfType を使ってないので空でOK
        mfType: '',
        monthlyBalances,
        settlementBalance: null,
        total: null,
        // children 判定は parentRowId の集合から逆引き
        hasChildren: false,
        expectedRule: r.expectedRule as ChoshoExpectedRuleValue,
        expectedValue,
        agingCheckEnabled: r.agingCheckEnabled,
        anomalies,
        agingSuppressedBy,
      };
    });

    // hasChildren を1パスで埋める
    const parentIds = new Set(
      rows.map((r) => r.parentRowKey).filter((v): v is string => !!v),
    );
    for (const r of rows) {
      r.hasChildren = parentIds.has(r.rowKey);
    }

    return {
      versionId: version.id,
      orgId: version.orgId,
      fiscalYear: version.fiscalYear,
      selectedMonth: version.selectedMonth,
      status: version.status,
      title: version.title,
      createdAt: version.createdAt.toISOString(),
      approvedAt: version.approvedAt?.toISOString() ?? null,
      // 後で resolveOrg / monthOrder 計算で上書きされる初期値
      fyStartMonth: 0,
      monthOrder: [],
      rows,
    };
  }

  // ============================================================
  // 承認 (DRAFT → APPROVED)
  // ============================================================

  /**
   * 指定 version を APPROVED に遷移する。
   *
   * 成功条件:
   *   1. version が指定 (orgId, tenantId) に属する
   *   2. status === DRAFT
   *   3. 同 (tenantId, orgId, fiscalYear, selectedMonth) に APPROVED 既存なし
   *      (DB 側 partial unique index `chosho_versions_one_approved_per_period`
   *       で保証されているが、ユーザー向け 409 メッセージのため事前 check)
   *
   * 競合経路:
   *   - 同期的にチェック後、UPDATE で transaction 内に partial unique index 違反が
   *     起きうる (ほぼ同時に別 request が approve した場合)。
   *     P2002 を捕まえて 409 ConflictException に変換する。
   */
  async approve(
    orgId: string,
    versionId: string,
    approverId: string,
  ): Promise<ChoshoVersionDetail> {
    const { tenantId } = await this.resolveOrg(orgId);

    const version = await this.prisma.choshoVersion.findFirst({
      where: { id: versionId, orgId, tenantId },
      select: {
        id: true,
        status: true,
        fiscalYear: true,
        selectedMonth: true,
      },
    });
    if (!version) {
      throw new NotFoundException('Chosho version not found');
    }
    if (version.status !== ChoshoStatus.DRAFT) {
      throw new ConflictException(
        `Cannot approve: version status is ${version.status} (only DRAFT is approvable)`,
      );
    }

    // 同 (org, fy, month) に既存 APPROVED が無いか事前 check。
    const existingApproved = await this.prisma.choshoVersion.findFirst({
      where: {
        tenantId,
        orgId,
        fiscalYear: version.fiscalYear,
        selectedMonth: version.selectedMonth,
        status: ChoshoStatus.APPROVED,
      },
      select: { id: true },
    });
    if (existingApproved) {
      throw new ConflictException(
        `Another approved chosho already exists for FY${version.fiscalYear}/${version.selectedMonth}月 (versionId: ${existingApproved.id})`,
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.choshoVersion.update({
          where: { id: versionId },
          data: {
            status: ChoshoStatus.APPROVED,
            approvedById: approverId,
            approvedAt: new Date(),
          },
        });
      });
    } catch (e) {
      // partial unique index 違反 (chosho_versions_one_approved_per_period)
      // race condition で事前 check 後に別 request が approve した場合に発生。
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'Another approved chosho was created concurrently for the same period',
        );
      }
      throw e;
    }

    return this.getVersion(orgId, versionId);
  }

  // ============================================================
  // 行ルール編集 (expectedRule / expectedValue / agingCheckEnabled)
  // ============================================================

  /**
   * chosho_rows 1 行のルールを更新。DRAFT 時のみ可能。
   *
   * Phase 1 Unit 2B-5b。
   * 期待残高ルール (EXPECTED_VALUE + expected_value) と滞留チェック (agingCheckEnabled)
   * を会計士が UI から行ごとに編集できるようにする経路。
   */
  async updateRowRule(
    orgId: string,
    versionId: string,
    rowId: string,
    rule: {
      expectedRule: 'NONE' | 'EXPECTED_VALUE' | 'AGING_3M';
      expectedValue?: number | null;
      agingCheckEnabled: boolean;
    },
  ): Promise<ChoshoVersionDetail> {
    const { tenantId } = await this.resolveOrg(orgId);
    await this.assertVersionIsDraft(versionId, orgId, tenantId);
    await this.assertRowBelongsToVersion(rowId, versionId, orgId, tenantId);

    // EXPECTED_VALUE 以外なら expected_value をクリア (NULL に戻す) して整合性を保つ
    const expectedValueToSave: Prisma.Decimal | null =
      rule.expectedRule === 'EXPECTED_VALUE' && rule.expectedValue != null
        ? new Prisma.Decimal(rule.expectedValue)
        : null;

    await this.prisma.choshoRow.update({
      where: { id: rowId },
      data: {
        expectedRule: rule.expectedRule as
          | 'NONE'
          | 'EXPECTED_VALUE'
          | 'AGING_3M',
        expectedValue: expectedValueToSave,
        agingCheckEnabled: rule.agingCheckEnabled,
      },
    });

    // 更新後の version 全体を返して UI が再描画できるように
    return this.getVersion(orgId, versionId);
  }

  // ============================================================
  // 行コメント (1:N)
  // ============================================================

  async listRowComments(
    orgId: string,
    versionId: string,
  ): Promise<RowCommentRow[]> {
    const { tenantId } = await this.resolveOrg(orgId);
    await this.assertVersionBelongsToOrg(versionId, orgId, tenantId);
    const items = await this.prisma.choshoRowComment.findMany({
      where: { tenantId, orgId, row: { versionId } },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { name: true } } },
    });
    return items.map((c) => ({
      id: c.id,
      rowId: c.rowId,
      body: c.body,
      urls: parseStringArray(c.urls),
      authorId: c.authorId,
      authorName: c.author?.name ?? null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  async addRowComment(
    orgId: string,
    versionId: string,
    rowId: string,
    body: string,
    urls: string[],
    authorId: string,
  ): Promise<RowCommentRow> {
    const { tenantId } = await this.resolveOrg(orgId);
    // APPROVED / ARCHIVED の version へは書き込み不可
    await this.assertVersionIsDraft(versionId, orgId, tenantId);
    await this.assertRowBelongsToVersion(rowId, versionId, orgId, tenantId);
    const created = await this.prisma.choshoRowComment.create({
      data: {
        rowId,
        tenantId,
        orgId,
        body,
        urls: urls as Prisma.InputJsonValue,
        authorId,
      },
      include: { author: { select: { name: true } } },
    });
    return {
      id: created.id,
      rowId: created.rowId,
      body: created.body,
      urls: parseStringArray(created.urls),
      authorId: created.authorId,
      authorName: created.author?.name ?? null,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async deleteRowComment(
    orgId: string,
    versionId: string,
    commentId: string,
    requesterId: string,
  ): Promise<void> {
    const { tenantId } = await this.resolveOrg(orgId);
    await this.assertVersionIsDraft(versionId, orgId, tenantId);
    // 削除前に「同テナント・同 org・同 version 配下のコメントか」を確認。
    // 別テナントの commentId を投げられても 404 で止める。
    const target = await this.prisma.choshoRowComment.findFirst({
      where: {
        id: commentId,
        tenantId,
        orgId,
        row: { versionId },
      },
      select: { id: true, authorId: true },
    });
    if (!target) {
      throw new NotFoundException('Row comment not found');
    }
    // Phase 1 簡易ルール: 削除は本人のみ。Phase 2 で advisor 権限拡張可。
    if (target.authorId && target.authorId !== requesterId) {
      throw new ForbiddenException('You can delete only your own comment');
    }
    await this.prisma.choshoRowComment.delete({ where: { id: commentId } });
  }

  // ============================================================
  // セルコメント (1:1, UNIQUE(row_id, month))
  // ============================================================

  async listCellComments(
    orgId: string,
    versionId: string,
  ): Promise<CellCommentRow[]> {
    const { tenantId } = await this.resolveOrg(orgId);
    await this.assertVersionBelongsToOrg(versionId, orgId, tenantId);
    const items = await this.prisma.choshoCellComment.findMany({
      where: { tenantId, orgId, row: { versionId } },
      orderBy: [{ rowId: 'asc' }, { month: 'asc' }, { createdAt: 'asc' }],
      include: { author: { select: { name: true } } },
    });
    return items.map(toCellCommentRow);
  }

  /**
   * 旧 upsert (1:1) は Phase 2-3 で deprecated。互換のため最初の root コメントを upsert する形で残置。
   * 新規 UI は addCellComment / resolveCellComment / deleteCellCommentById を使う。
   */
  async upsertCellComment(
    orgId: string,
    versionId: string,
    rowId: string,
    month: number,
    body: string,
    urls: string[],
    anomalyType: ChoshoAnomalyType | null,
    authorId: string,
  ): Promise<CellCommentRow> {
    const { tenantId } = await this.resolveOrg(orgId);
    await this.assertVersionIsDraft(versionId, orgId, tenantId);
    await this.assertRowBelongsToVersion(rowId, versionId, orgId, tenantId);
    if (month < 1 || month > 12) {
      throw new ForbiddenException('month must be 1..12');
    }
    // 既存 root (parent_comment_id IS NULL) があれば update、なければ create
    const existing = await this.prisma.choshoCellComment.findFirst({
      where: { rowId, month, parentCommentId: null },
      orderBy: { createdAt: 'asc' },
    });
    let saved;
    if (existing) {
      saved = await this.prisma.choshoCellComment.update({
        where: { id: existing.id },
        data: { body, urls: urls as Prisma.InputJsonValue, anomalyType },
      });
    } else {
      saved = await this.prisma.choshoCellComment.create({
        data: {
          rowId,
          tenantId,
          orgId,
          month,
          body,
          urls: urls as Prisma.InputJsonValue,
          anomalyType,
          authorId,
        },
      });
    }
    return toCellCommentRow(saved);
  }

  /**
   * 新 API (Phase 2-3): 1セルに複数 root + 返信を許容する add。
   * parentCommentId NULL = root、UUID = 返信。
   */
  async addCellComment(
    orgId: string,
    versionId: string,
    rowId: string,
    month: number,
    body: string,
    urls: string[],
    anomalyType: ChoshoAnomalyType | null,
    parentCommentId: string | null,
    authorId: string,
  ): Promise<CellCommentRow> {
    const { tenantId } = await this.resolveOrg(orgId);
    await this.assertVersionIsDraft(versionId, orgId, tenantId);
    await this.assertRowBelongsToVersion(rowId, versionId, orgId, tenantId);
    if (month < 1 || month > 12) {
      throw new ForbiddenException('month must be 1..12');
    }
    if (parentCommentId) {
      const parent = await this.prisma.choshoCellComment.findFirst({
        where: { id: parentCommentId, rowId, month, tenantId, orgId },
        select: { id: true, parentCommentId: true },
      });
      if (!parent) throw new NotFoundException('Parent comment not found');
      // 返信の返信は root に flatten
      if (parent.parentCommentId) parentCommentId = parent.parentCommentId;
    }
    const created = await this.prisma.choshoCellComment.create({
      data: {
        rowId,
        tenantId,
        orgId,
        month,
        body,
        urls: urls as Prisma.InputJsonValue,
        anomalyType,
        parentCommentId,
        authorId,
      },
    });
    return toCellCommentRow(created);
  }

  /**
   * 解決状態の toggle。 root コメントに対して使う。
   * resolved=true → resolved_at セット、false → クリア。
   */
  async resolveCellComment(
    orgId: string,
    commentId: string,
    resolved: boolean,
    userId: string,
  ): Promise<CellCommentRow> {
    const { tenantId } = await this.resolveOrg(orgId);
    const target = await this.prisma.choshoCellComment.findFirst({
      where: { id: commentId, tenantId, orgId },
    });
    if (!target) throw new NotFoundException('Cell comment not found');
    const updated = await this.prisma.choshoCellComment.update({
      where: { id: commentId },
      data: {
        resolvedAt: resolved ? new Date() : null,
        resolvedById: resolved ? userId : null,
      },
    });
    return toCellCommentRow(updated);
  }

  /** 旧 (rowId, month) ベースの delete (1:1 想定の chosho-tab UI 互換)。最初の root を削除。 */
  async deleteCellComment(
    orgId: string,
    versionId: string,
    rowId: string,
    month: number,
  ): Promise<void> {
    const { tenantId } = await this.resolveOrg(orgId);
    await this.assertVersionIsDraft(versionId, orgId, tenantId);
    await this.assertRowBelongsToVersion(rowId, versionId, orgId, tenantId);
    const target = await this.prisma.choshoCellComment.findFirst({
      where: { rowId, month, tenantId, orgId, parentCommentId: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException('Cell comment not found');
    }
    await this.prisma.choshoCellComment.delete({ where: { id: target.id } });
  }

  /** 新 API: commentId 指定で本文+URL を編集。本人のみ可。 */
  async updateCellCommentById(
    orgId: string,
    commentId: string,
    body: string,
    urls: string[],
    requesterId: string,
  ): Promise<CellCommentRow> {
    const { tenantId } = await this.resolveOrg(orgId);
    const target = await this.prisma.choshoCellComment.findFirst({
      where: { id: commentId, tenantId, orgId },
      select: { id: true, authorId: true },
    });
    if (!target) throw new NotFoundException('Cell comment not found');
    if (target.authorId && target.authorId !== requesterId) {
      throw new ForbiddenException('You can edit only your own comment');
    }
    const updated = await this.prisma.choshoCellComment.update({
      where: { id: commentId },
      data: { body, urls: urls as Prisma.InputJsonValue },
      include: { author: { select: { name: true } } },
    });
    return toCellCommentRow(updated);
  }

  /** 新 API: commentId 指定で削除 (root → 返信もカスケード)。本人のみ可。 */
  async deleteCellCommentById(
    orgId: string,
    commentId: string,
    requesterId: string,
  ): Promise<void> {
    const { tenantId } = await this.resolveOrg(orgId);
    const target = await this.prisma.choshoCellComment.findFirst({
      where: { id: commentId, tenantId, orgId },
      select: { id: true, authorId: true },
    });
    if (!target) throw new NotFoundException('Cell comment not found');
    if (target.authorId && target.authorId !== requesterId) {
      throw new ForbiddenException('You can delete only your own comment');
    }
    await this.prisma.choshoCellComment.delete({ where: { id: commentId } });
  }

  // ============================================================
  // 新 API: preview/saved 共通の cell コメント (rowKey ベース)
  //   モード切替を撤去し、 (org, fy, month, rowKey) で直接書き読みする経路。
  //   既存 saved 経路 (rowId 紐付け) は読み出しのみ後方互換。
  // ============================================================

  /** (org, fy, month, rowKey?) のセルコメント一覧 (返信含む)。 rowKey 省略時は (fy, month) 全件。 */
  async listPreviewCellComments(
    orgId: string,
    fiscalYear: number,
    month: number,
    rowKey?: string,
  ): Promise<CellCommentRow[]> {
    const { tenantId } = await this.resolveOrg(orgId);
    if (month < 1 || month > 12) {
      throw new ForbiddenException('month must be 1..12');
    }
    const items = await this.prisma.choshoCellComment.findMany({
      where: {
        tenantId,
        orgId,
        fiscalYear,
        month,
        ...(rowKey ? { rowKey } : {}),
      },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { name: true } } },
    });
    return items.map(toCellCommentRow);
  }

  /** preview モードからのコメント追加 (root or 返信)。 versionId 不要、 (fy, month, rowKey) で identify。 */
  async addPreviewCellComment(
    orgId: string,
    fiscalYear: number,
    month: number,
    rowKey: string,
    body: string,
    urls: string[],
    anomalyType: ChoshoAnomalyType | null,
    parentCommentId: string | null,
    authorId: string,
  ): Promise<CellCommentRow> {
    const { tenantId } = await this.resolveOrg(orgId);
    if (month < 1 || month > 12) {
      throw new ForbiddenException('month must be 1..12');
    }
    if (!rowKey || rowKey.length === 0) {
      throw new ForbiddenException('rowKey is required');
    }
    if (parentCommentId) {
      const parent = await this.prisma.choshoCellComment.findFirst({
        where: {
          id: parentCommentId,
          tenantId,
          orgId,
          fiscalYear,
          month,
          rowKey,
        },
        select: { id: true, parentCommentId: true },
      });
      if (!parent) throw new NotFoundException('Parent comment not found');
      // 返信の返信は root にぶら下げる (2 階層 flatten)
      if (parent.parentCommentId) parentCommentId = parent.parentCommentId;
    }
    const created = await this.prisma.choshoCellComment.create({
      data: {
        tenantId,
        orgId,
        fiscalYear,
        rowKey,
        month,
        rowId: null,
        body,
        urls: urls as Prisma.InputJsonValue,
        anomalyType,
        parentCommentId,
        authorId,
      },
      include: { author: { select: { name: true } } },
    });
    return toCellCommentRow(created);
  }

  // ============================================================
  // memo タブ用: 期間内の cell コメントを集約
  // ============================================================

  /**
   * 指定会計年度の cell コメントを集約して返す。
   *
   * - 旧 saved 経路: 各月の最新 version に紐づく rowId コメント
   * - 新 preview 共通経路: (org, fiscalYear, month, rowKey) に紐づくコメント
   *   rowKey 経路は version を持たないため、saved version の有無に関係なく返す。
   */
  async listRecentCellCommentsForPeriod(
    orgId: string,
    fiscalYear: number,
    selectedMonth?: number,
  ): Promise<RecentCellCommentItem[]> {
    const { tenantId } = await this.resolveOrg(orgId);

    const savedItems: RecentCellCommentItem[] = [];

    // 各月の最新 saved version を引く (selectedMonth 省略時は全月)
    const versionWhere: Prisma.ChoshoVersionWhereInput = {
      tenantId,
      orgId,
      fiscalYear,
      ...(selectedMonth != null ? { selectedMonth } : {}),
    };
    const versions = await this.prisma.choshoVersion.findMany({
      where: versionWhere,
      orderBy: [{ selectedMonth: 'asc' }, { createdAt: 'desc' }],
      select: { id: true, selectedMonth: true },
    });
    if (versions.length > 0) {
      // selectedMonth ごとに最新 (createdAt desc 順で最初に出てきたもの) を採用
      const latestByMonth = new Map<number, string>();
      for (const v of versions) {
        if (!latestByMonth.has(v.selectedMonth)) {
          latestByMonth.set(v.selectedMonth, v.id);
        }
      }
      const versionIds = Array.from(latestByMonth.values());

      const items = await this.prisma.choshoCellComment.findMany({
        where: { tenantId, orgId, row: { versionId: { in: versionIds } } },
        orderBy: [{ createdAt: 'asc' }],
        include: {
          row: { select: { id: true, accountName: true, versionId: true } },
          author: { select: { name: true } },
        },
      });
      savedItems.push(
        ...items.map((c) => ({
          id: c.id,
          versionId: c.row?.versionId ?? '',
          rowId: c.rowId,
          fiscalYear: c.fiscalYear ?? null,
          rowKey: c.rowKey ?? null,
          rowName: c.row?.accountName ?? '',
          month: c.month,
          parentCommentId: c.parentCommentId,
          body: c.body,
          urls: parseStringArray(c.urls),
          anomalyType: c.anomalyType,
          authorId: c.authorId,
          authorName: c.author?.name ?? null,
          resolvedAt: c.resolvedAt?.toISOString() ?? null,
          resolvedById: c.resolvedById,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        })),
      );
    }

    const rowKeyItems = await this.prisma.choshoCellComment.findMany({
      where: {
        tenantId,
        orgId,
        fiscalYear,
        rowId: null,
        rowKey: { not: null },
        ...(selectedMonth != null ? { month: selectedMonth } : {}),
      },
      orderBy: [{ createdAt: 'asc' }],
      include: { author: { select: { name: true } } },
    });

    const previewItems = rowKeyItems.map((c) => ({
      id: c.id,
      versionId: '',
      rowId: c.rowId,
      fiscalYear: c.fiscalYear ?? null,
      rowKey: c.rowKey ?? null,
      rowName: rowNameFromRowKey(c.rowKey),
      month: c.month,
      parentCommentId: c.parentCommentId,
      body: c.body,
      urls: parseStringArray(c.urls),
      anomalyType: c.anomalyType,
      authorId: c.authorId,
      authorName: c.author?.name ?? null,
      resolvedAt: c.resolvedAt?.toISOString() ?? null,
      resolvedById: c.resolvedById,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));

    return [...savedItems, ...previewItems].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    );
  }

  async listRecentCellCommentGroupsForPeriod(
    orgId: string,
    fiscalYear: number,
    selectedMonth: number | undefined,
    pageRaw: number,
    limitRaw: number,
  ): Promise<RecentCellCommentPage> {
    const page = normalizeMemoPage(pageRaw);
    const limit = normalizeMemoLimit(limitRaw);
    const items = await this.listRecentCellCommentsForPeriod(
      orgId,
      fiscalYear,
      selectedMonth,
    );
    const groups = groupRecentCellComments(items);
    const total = groups.length;
    const unresolvedTotal = groups.filter((g) => !g.resolved).length;
    const resolvedTotal = total - unresolvedTotal;
    const pageGroups = groups.slice((page - 1) * limit, page * limit);
    const pageKeys = new Set(pageGroups.map((g) => g.key));
    return {
      items: items.filter((item) => {
        const key = recentCellGroupKey(item);
        return key != null && pageKeys.has(key);
      }),
      total,
      unresolvedTotal,
      resolvedTotal,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ============================================================
  // helpers
  // ============================================================

  /**
   * versionId が指定 org/tenant に属するかチェック。属していなければ 404。
   * 別テナントから投げ込まれた versionId を service 層でも遮断する二重防御。
   */
  private async assertVersionBelongsToOrg(
    versionId: string,
    orgId: string,
    tenantId: string,
  ): Promise<void> {
    const found = await this.prisma.choshoVersion.findFirst({
      where: { id: versionId, orgId, tenantId },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException('Chosho version not found');
    }
  }

  /**
   * mutation 系 API の前提チェック: version が DRAFT であること。
   * APPROVED / ARCHIVED への書き込みは 409 で弾く。
   *
   * UI 側で readonly 表示しても client は HTTP を直叩きできるため、
   * 編集禁止の判定は API 側を正本にする。
   */
  private async assertVersionIsDraft(
    versionId: string,
    orgId: string,
    tenantId: string,
  ): Promise<void> {
    const found = await this.prisma.choshoVersion.findFirst({
      where: { id: versionId, orgId, tenantId },
      select: { status: true },
    });
    if (!found) {
      throw new NotFoundException('Chosho version not found');
    }
    if (found.status !== ChoshoStatus.DRAFT) {
      throw new ConflictException(
        `Chosho version is not editable (status: ${found.status})`,
      );
    }
  }

  /**
   * rowId が指定 version/org/tenant に属するかチェック。
   * 複合 FK で DB レイヤでも保証されているが、攻撃面を狭めるため早期 404。
   */
  private async assertRowBelongsToVersion(
    rowId: string,
    versionId: string,
    orgId: string,
    tenantId: string,
  ): Promise<void> {
    const found = await this.prisma.choshoRow.findFirst({
      where: { id: rowId, versionId, orgId, tenantId },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException('Chosho row not found');
    }
  }

  /**
   * 直近 3 ヶ月の試算表 BS を取得し、'/' 区切りの name path -> {debit, credit} の Map を返す。
   * AGING_3M 抑制判定 (毎月相殺パターンの誤検知除外) で使う。
   *
   * 取得期間:
   *   - end_month = selectedMonth
   *   - start_month = max(fyStart, selectedMonth - 2)
   *   (3 ヶ月未満しか取れない場合 = aging 判定が発火しないので影響なし)
   *
   * 失敗時は null を返し、抑制を skip (= 既存の純粋な月末残高同額判定のまま) する。
   */
  private async fetchRecentActivityByPath(
    orgId: string,
    fiscalYear: number,
    selectedMonth: number,
  ): Promise<Map<string, { debit: number; credit: number }> | undefined> {
    // selectedMonth - 2 が前会計年度に跨ぐケースは Phase 1 ではスキップ (現実装の checkAging3M
    // も「monthOrder で先頭2 ヶ月以内なら判定不可」で揃っている)。
    const startMonth = Math.max(1, selectedMonth - 2);
    const trial = await this.mfApi
      .getTrialBalanceBS(orgId, fiscalYear, selectedMonth, {
        startMonth,
        withSubAccounts: true,
      })
      .catch(() => null);
    if (!trial) return undefined;

    const map = new Map<string, { debit: number; credit: number }>();
    flattenTrialForActivity(trial.rows, [], map);
    return map;
  }

  private async resolveOrg(
    orgId: string,
  ): Promise<{ tenantId: string; fyStartMonth: number }> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { tenantId: true, fiscalMonthEnd: true },
    });
    // fiscalMonthEnd=3 (3月決算) → fyStart=4
    return {
      tenantId: org.tenantId,
      fyStartMonth: (org.fiscalMonthEnd % 12) + 1,
    };
  }
}

// ============================================================
// 戻り値型
// ============================================================

/**
 * GET /chosho/versions/:id および POST /chosho/versions の戻り値。
 * preview と shape を揃えて UI が同じ描画経路を使えるようにする。
 */
export interface ChoshoVersionDetail {
  versionId: string;
  orgId: string;
  fiscalYear: number;
  selectedMonth: number;
  status: ChoshoStatus;
  title: string | null;
  createdAt: string;
  approvedAt: string | null;
  fyStartMonth: number;
  monthOrder: number[];
  rows: ChoshoPreviewRow[];
}

/** GET /chosho/versions/:id/comments の戻り値要素 */
export interface RowCommentRow {
  id: string;
  rowId: string;
  body: string;
  urls: string[];
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /chosho/versions/:id/cell-comments の戻り値要素 (Phase 2-3: スレッド対応)
 *
 * 旧設計の rowId は schema 変更で nullable に。 新 API (preview-cell-comments) で
 * 書き込まれたコメントは rowId=null となり、 (fiscalYear, month, rowKey) で識別する。
 */
export interface CellCommentRow {
  id: string;
  rowId: string | null;
  /** 新設計: (fiscalYear, month, rowKey) で識別。 旧データは migration で best-effort 埋め。 */
  fiscalYear: number | null;
  rowKey: string | null;
  month: number;
  /** NULL = root コメント、UUID = 返信 */
  parentCommentId: string | null;
  body: string;
  urls: string[];
  /** null = ユーザーが任意セルに付けたメモ (異常検知無し) */
  anomalyType: ChoshoAnomalyType | null;
  authorId: string | null;
  /** 表示用ユーザー名 (現状 lookup 不要箇所では null) */
  authorName: string | null;
  /** 解決状態 (root に意味あり)。null = 未解決 */
  resolvedAt: string | null;
  resolvedById: string | null;
  createdAt: string;
  updatedAt: string;
}

/** memo タブ用: 期間内最新 version の cell コメント (row.accountName 込み) */
export interface RecentCellCommentItem extends CellCommentRow {
  versionId: string;
  rowName: string;
}

export interface RecentCellCommentPage {
  items: RecentCellCommentItem[];
  total: number;
  unresolvedTotal: number;
  resolvedTotal: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================================
// 共通変換: Prisma row → CellCommentRow
// ============================================================

function toCellCommentRow(c: {
  id: string;
  rowId: string | null;
  fiscalYear?: number | null;
  rowKey?: string | null;
  month: number;
  parentCommentId: string | null;
  body: string;
  urls: Prisma.JsonValue;
  anomalyType: ChoshoAnomalyType | null;
  authorId: string | null;
  resolvedAt: Date | null;
  resolvedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  author?: { name: string } | null;
}): CellCommentRow {
  return {
    id: c.id,
    rowId: c.rowId,
    fiscalYear: c.fiscalYear ?? null,
    rowKey: c.rowKey ?? null,
    month: c.month,
    parentCommentId: c.parentCommentId,
    body: c.body,
    urls: parseStringArray(c.urls),
    anomalyType: c.anomalyType,
    authorId: c.authorId,
    authorName: c.author?.name ?? null,
    resolvedAt: c.resolvedAt?.toISOString() ?? null,
    resolvedById: c.resolvedById,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// ============================================================
// pure helpers (test 用に export)
// ============================================================

/**
 * saved row の monthlyBalances で「対象月含む直近3ヶ月の非ゼロ残高が同額」かを判定する小ヘルパー。
 * computeAnomaliesFromSaved の判定式と揃えてある (selectedMonth から月またぎで遡る形)。
 */
function wasMonthlyAmountSameForLast3(
  monthlyBalances: Record<number, number>,
  selectedMonth: number,
): boolean {
  const m2 = selectedMonth;
  const m1 = m2 === 1 ? 12 : m2 - 1;
  const m0 = m1 === 1 ? 12 : m1 - 1;
  const v0 = monthlyBalances[m0];
  const v1 = monthlyBalances[m1];
  const v2 = monthlyBalances[m2];
  if (
    typeof v0 !== 'number' ||
    typeof v1 !== 'number' ||
    typeof v2 !== 'number'
  )
    return false;
  return v2 !== 0 && v0 === v1 && v1 === v2;
}

/**
 * saved chosho_rows の id -> '/' 区切り name path を再帰計算した Map を返す。
 * builder の name path 生成と同じ shape (parent.name/.../self.name)。
 *
 * activity lookup 用。 recentActivityByPath は試算表側で同じ name path で組まれている。
 */
export function buildNamePathByIdFromSavedRows(
  rows: { id: string; accountName: string; parentRowId: string | null }[],
): Map<string, string> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out = new Map<string, string>();
  for (const r of rows) {
    const parts: string[] = [r.accountName];
    let cur:
      | { id: string; accountName: string; parentRowId: string | null }
      | undefined = r;
    while (cur && cur.parentRowId) {
      const parent = byId.get(cur.parentRowId);
      if (!parent) break;
      parts.unshift(parent.accountName);
      cur = parent;
    }
    out.set(r.id, parts.join('/'));
  }
  return out;
}

/**
 * 試算表 (MfTrialBalance) の rows を再帰展開し、name path → {debit, credit} の Map を埋める。
 * builder の name path 生成 (chosho-preview.builder.buildNamePath) と整合させる。
 *
 * MfReportRow.values[1] = debit_amount, [2] = credit_amount (TB_COL.DEBIT/CREDIT)
 */
export function flattenTrialForActivity(
  rows: MfReportRow[] | null,
  parentNames: string[],
  out: Map<string, { debit: number; credit: number }>,
): void {
  if (!rows) return;
  for (const r of rows) {
    const path = [...parentNames, r.name].join('/');
    const debit =
      typeof r.values[TB_COL.DEBIT] === 'number'
        ? (r.values[TB_COL.DEBIT] as number)
        : 0;
    const credit =
      typeof r.values[TB_COL.CREDIT] === 'number'
        ? (r.values[TB_COL.CREDIT] as number)
        : 0;
    if (debit > 0 || credit > 0) {
      out.set(path, { debit, credit });
    }
    if (r.rows && r.rows.length > 0) {
      flattenTrialForActivity(r.rows, [...parentNames, r.name], out);
    }
  }
}

/** jsonb 列に保存された string[] をパース。string 以外の要素は drop。 */
export function parseStringArray(value: Prisma.JsonValue | unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function rowNameFromRowKey(rowKey: string | null): string {
  if (!rowKey) return '';
  const tail = rowKey.split('/').filter(Boolean).at(-1) ?? rowKey;
  return tail.replace(/^\d+-/, '').replace(/_/g, ' ') || rowKey;
}

function recentCellGroupKey(item: RecentCellCommentItem): string | null {
  const targetKey = item.rowId ?? item.rowKey;
  return targetKey ? `${targetKey}:${item.month}` : null;
}

function groupRecentCellComments(items: RecentCellCommentItem[]): {
  key: string;
  rowName: string;
  month: number;
  resolved: boolean;
}[] {
  const map = new Map<
    string,
    {
      key: string;
      rowName: string;
      month: number;
      roots: RecentCellCommentItem[];
    }
  >();
  for (const item of items) {
    const key = recentCellGroupKey(item);
    if (!key) continue;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        rowName: item.rowName || rowNameFromRowKey(item.rowKey) || key,
        month: item.month,
        roots: [],
      };
      map.set(key, group);
    }
    if (item.parentCommentId == null) group.roots.push(item);
  }
  return Array.from(map.values())
    .map((group) => ({
      key: group.key,
      rowName: group.rowName,
      month: group.month,
      resolved:
        group.roots.length > 0 &&
        group.roots.every((root) => root.resolvedAt != null),
    }))
    .sort((a, b) => {
      if (a.rowName === b.rowName) return a.month - b.month;
      return a.rowName.localeCompare(b.rowName);
    });
}

function normalizeMemoPage(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function normalizeMemoLimit(value: number): number {
  if (!Number.isInteger(value) || value <= 0) return 50;
  return Math.min(Math.max(value, 1), 100);
}

export function parseMonthlyBalances(
  value: Prisma.JsonValue | unknown,
): Record<number, number> {
  if (value == null || typeof value !== 'object' || Array.isArray(value))
    return {};
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const month = parseInt(k, 10);
    if (!Number.isFinite(month) || month < 1 || month > 12) continue;
    if (typeof v === 'number') out[month] = v;
  }
  return out;
}

/**
 * 期首月から MF 推移表の column 順 (例: 期首4月 → [4,5,6,...,3]) を再生成する。
 * snapshot には monthOrder を保存していないため、読み取り時に期首月から推論する。
 */
export function computeMonthOrderFromFyStart(fyStartMonth: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 12; i++) {
    out.push(((fyStartMonth - 1 + i) % 12) + 1);
  }
  return out;
}

/**
 * 保存済 row に対して再度異常検知を走らせる。
 * Phase 1 ではルール定義が変わらない前提で「保存時と同じ判定」が読み取り時にも返る。
 *
 * builder 内部の純関数 (checkAging3M / checkZeroViolation) と同じロジック。
 * builder からの export を増やすと public 表面が広がるので意図的に重複定義 (≤30行で許容)。
 */
export function computeAnomaliesFromSaved(input: {
  monthlyBalances: Record<number, number>;
  expectedRule: ChoshoExpectedRuleValue;
  expectedValue: number | null;
  agingCheckEnabled: boolean;
  selectedMonth: number;
  /** 直近3ヶ月の借方/貸方発生額。null/undefined なら抑制なし。 */
  recentActivity?: { debit: number; credit: number } | null;
}): ChoshoAnomaly[] {
  const {
    monthlyBalances,
    expectedRule,
    expectedValue,
    agingCheckEnabled,
    selectedMonth,
  } = input;
  const recentActivity = input.recentActivity ?? null;
  const out: ChoshoAnomaly[] = [];

  // EXPECTED_VALUE_VIOLATION
  if (expectedRule === 'EXPECTED_VALUE' && expectedValue !== null) {
    const v = monthlyBalances[selectedMonth];
    if (typeof v === 'number' && v !== expectedValue) {
      out.push({
        type: 'EXPECTED_VALUE_VIOLATION',
        month: selectedMonth,
        message: `期待残高 ¥${Math.round(expectedValue).toLocaleString()} と一致しません (実残高 ¥${Math.round(v).toLocaleString()})`,
        detail: { actualAmount: v, expectedValue },
      });
    }
  }

  // AGING_3M (期首月から推論した monthOrder で 3 ヶ月遡って同額判定)
  if (agingCheckEnabled || expectedRule === 'AGING_3M') {
    // 期首月不明な状態だと monthOrder が組めないが、selectedMonth から逆算で
    // 「直近3ヶ月の自然な月配列」を作る (12月→11→10 のように)。
    const m2 = selectedMonth;
    const m1 = m2 === 1 ? 12 : m2 - 1;
    const m0 = m1 === 1 ? 12 : m1 - 1;
    const v0 = monthlyBalances[m0];
    const v1 = monthlyBalances[m1];
    const v2 = monthlyBalances[m2];
    if (
      typeof v0 === 'number' &&
      typeof v1 === 'number' &&
      typeof v2 === 'number'
    ) {
      if (v2 !== 0 && v0 === v1 && v1 === v2) {
        // activity 抑制: 直近3ヶ月で debit > 0 OR credit > 0 なら「動きあり」 → 滞留扱いしない
        const hasActivity =
          recentActivity != null &&
          (recentActivity.debit > 0 || recentActivity.credit > 0);
        if (!hasActivity) {
          out.push({
            type: 'AGING_3M',
            month: selectedMonth,
            message: `直近3ヶ月 (${m0}/${m1}/${m2}月) の残高が ¥${Math.round(v2).toLocaleString()} で動いていません`,
            detail: { sameAmount: v2, monthsChecked: [m0, m1, m2] },
          });
        }
      }
    }
  }

  return out;
}
