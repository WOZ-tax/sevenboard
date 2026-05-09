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
import type {
  ChoshoAnomaly,
  ChoshoExpectedRuleValue,
  ChoshoPreviewResult,
  ChoshoPreviewRow,
} from './chosho-preview.types';

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
  ): Promise<ChoshoPreviewResult> {
    const { fyStartMonth } = await this.resolveOrg(orgId);
    const bsTransition = await this.mfApi
      .getTransitionBS(orgId, fiscalYear, selectedMonth, { withSubAccounts: true })
      .catch(() => null);
    const { rows, monthOrder } = buildChoshoPreviewRows({
      bsTransition,
      selectedMonth,
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
      .getTransitionBS(orgId, fiscalYear, selectedMonth, { withSubAccounts: true })
      .catch(() => null);
    const { rows: previewRows, monthOrder } = buildChoshoPreviewRows({
      bsTransition,
      selectedMonth,
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
    const detail = await this.getVersionInternal(orgId, versionId);
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

    // saved row -> ChoshoPreviewRow 互換 shape へ整形。
    // rowKey = id、parentRowKey = parentRowId (UI が preview と同じレンダリング経路で再描画できる)
    const rows: ChoshoPreviewRow[] = version.rows.map((r) => {
      const monthlyBalances = parseMonthlyBalances(r.monthlyBalances);
      // Prisma の Decimal は string で来るので Number 変換。NULL は null 維持。
      const expectedValue =
        r.expectedValue == null ? null : Number(r.expectedValue.toString());
      const anomalies = computeAnomaliesFromSaved({
        monthlyBalances,
        expectedRule: r.expectedRule as ChoshoExpectedRuleValue,
        expectedValue,
        agingCheckEnabled: r.agingCheckEnabled,
        selectedMonth: version.selectedMonth,
      });
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
      };
    });

    // hasChildren を1パスで埋める
    const parentIds = new Set(rows.map((r) => r.parentRowKey).filter((v): v is string => !!v));
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
        expectedRule: rule.expectedRule as 'NONE' | 'EXPECTED_VALUE' | 'AGING_3M',
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

  async listRowComments(orgId: string, versionId: string): Promise<RowCommentRow[]> {
    const { tenantId } = await this.resolveOrg(orgId);
    await this.assertVersionBelongsToOrg(versionId, orgId, tenantId);
    const items = await this.prisma.choshoRowComment.findMany({
      where: { tenantId, orgId, row: { versionId } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        rowId: true,
        body: true,
        urls: true,
        authorId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return items.map((c) => ({
      id: c.id,
      rowId: c.rowId,
      body: c.body,
      urls: parseStringArray(c.urls),
      authorId: c.authorId,
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
    });
    return {
      id: created.id,
      rowId: created.rowId,
      body: created.body,
      urls: parseStringArray(created.urls),
      authorId: created.authorId,
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

  async listCellComments(orgId: string, versionId: string): Promise<CellCommentRow[]> {
    const { tenantId } = await this.resolveOrg(orgId);
    await this.assertVersionBelongsToOrg(versionId, orgId, tenantId);
    const items = await this.prisma.choshoCellComment.findMany({
      where: { tenantId, orgId, row: { versionId } },
      orderBy: [{ rowId: 'asc' }, { month: 'asc' }],
    });
    return items.map((c) => ({
      id: c.id,
      rowId: c.rowId,
      month: c.month,
      body: c.body,
      urls: parseStringArray(c.urls),
      anomalyType: c.anomalyType,
      authorId: c.authorId,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  async upsertCellComment(
    orgId: string,
    versionId: string,
    rowId: string,
    month: number,
    body: string,
    urls: string[],
    anomalyType: ChoshoAnomalyType,
    authorId: string,
  ): Promise<CellCommentRow> {
    const { tenantId } = await this.resolveOrg(orgId);
    await this.assertVersionIsDraft(versionId, orgId, tenantId);
    await this.assertRowBelongsToVersion(rowId, versionId, orgId, tenantId);
    if (month < 1 || month > 12) {
      throw new ForbiddenException('month must be 1..12');
    }
    const upserted = await this.prisma.choshoCellComment.upsert({
      where: { rowId_month: { rowId, month } },
      create: {
        rowId,
        tenantId,
        orgId,
        month,
        body,
        urls: urls as Prisma.InputJsonValue,
        anomalyType,
        authorId,
      },
      update: {
        body,
        urls: urls as Prisma.InputJsonValue,
        anomalyType,
        // authorId は最初の作成者を保持。上書き者は updatedAt で識別。
      },
    });
    return {
      id: upserted.id,
      rowId: upserted.rowId,
      month: upserted.month,
      body: upserted.body,
      urls: parseStringArray(upserted.urls),
      anomalyType: upserted.anomalyType,
      authorId: upserted.authorId,
      createdAt: upserted.createdAt.toISOString(),
      updatedAt: upserted.updatedAt.toISOString(),
    };
  }

  async deleteCellComment(
    orgId: string,
    versionId: string,
    rowId: string,
    month: number,
  ): Promise<void> {
    const { tenantId } = await this.resolveOrg(orgId);
    await this.assertVersionIsDraft(versionId, orgId, tenantId);
    await this.assertRowBelongsToVersion(rowId, versionId, orgId, tenantId);
    // 存在しない (row, month) でも 404 で返す
    const target = await this.prisma.choshoCellComment.findFirst({
      where: { rowId, month, tenantId, orgId },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException('Cell comment not found');
    }
    await this.prisma.choshoCellComment.delete({ where: { id: target.id } });
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

  private async resolveOrg(orgId: string): Promise<{ tenantId: string; fyStartMonth: number }> {
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
  createdAt: string;
  updatedAt: string;
}

/** GET /chosho/versions/:id/cell-comments の戻り値要素 */
export interface CellCommentRow {
  id: string;
  rowId: string;
  month: number;
  body: string;
  urls: string[];
  anomalyType: ChoshoAnomalyType;
  authorId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// pure helpers (test 用に export)
// ============================================================

/** jsonb 列に保存された string[] をパース。string 以外の要素は drop。 */
export function parseStringArray(value: Prisma.JsonValue | unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export function parseMonthlyBalances(value: Prisma.JsonValue | unknown): Record<number, number> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return {};
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
}): ChoshoAnomaly[] {
  const { monthlyBalances, expectedRule, expectedValue, agingCheckEnabled, selectedMonth } = input;
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
    if (typeof v0 === 'number' && typeof v1 === 'number' && typeof v2 === 'number') {
      if (v2 !== 0 && v0 === v1 && v1 === v2) {
        out.push({
          type: 'AGING_3M',
          month: selectedMonth,
          message: `直近3ヶ月 (${m0}/${m1}/${m2}月) の残高が ¥${Math.round(v2).toLocaleString()} で動いていません`,
          detail: { sameAmount: v2, monthsChecked: [m0, m1, m2] },
        });
      }
    }
  }

  return out;
}
