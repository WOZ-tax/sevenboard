/**
 * 決算検討 (year-end-review) + ロカベン + 汎用 KV の共有データ管理サービス。
 *
 * Phase 1 (DB 化) で導入された 5 テーブル (TaxSavingDoneItem / BsCleanupTask /
 * YearEndScheduleItemState / LocabenState / FeatureState) のすべてを束ねる。
 *
 * テナント越境チェック:
 *   呼出側 (controller) は PermissionGuard で同じ org に対するアクセス権を確認している。
 *   サービスは orgId から tenantId を resolveOrg で引いてきて、where に必ず含める。
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

@Injectable()
export class YearEndStateService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveTenantId(orgId: string): Promise<string> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { tenantId: true },
    });
    return org.tenantId;
  }

  /**
   * 設定画面で登録済の brief webhook URL に決算スケジュールを送信。
   * 既存の briefSlackWebhookUrl を流用するため、フロントは URL 入力不要。
   */
  async sendScheduleToSlack(
    orgId: string,
    text: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { briefSlackWebhookUrl: true },
    });
    const webhookUrl = org?.briefSlackWebhookUrl;
    if (!webhookUrl) {
      return {
        ok: false,
        reason: '設定画面で Slack Webhook が未登録です',
      };
    }
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return {
          ok: false,
          reason: `Slack 送信失敗: HTTP ${res.status} ${body}`.trim(),
        };
      }
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ============================================================
  // 04 tax_saving_done_items
  // ============================================================
  async listTaxSavingDone(orgId: string, fiscalYear: number) {
    const tenantId = await this.resolveTenantId(orgId);
    return this.prisma.taxSavingDoneItem.findMany({
      where: { orgId, tenantId, fiscalYear },
    });
  }

  async upsertTaxSavingDone(
    orgId: string,
    fiscalYear: number,
    itemId: string,
    isDone: boolean,
    userId?: string,
  ) {
    const tenantId = await this.resolveTenantId(orgId);
    return this.prisma.taxSavingDoneItem.upsert({
      where: {
        orgId_fiscalYear_itemId: { orgId, fiscalYear, itemId },
      },
      create: {
        orgId,
        tenantId,
        fiscalYear,
        itemId,
        isDone,
        doneAt: isDone ? new Date() : null,
        updatedById: userId,
      },
      update: {
        isDone,
        doneAt: isDone ? new Date() : null,
        updatedById: userId,
      },
    });
  }

  // ============================================================
  // 06 bs_cleanup_tasks
  // ============================================================
  async listBsCleanupTasks(orgId: string, fiscalYear: number) {
    const tenantId = await this.resolveTenantId(orgId);
    return this.prisma.bsCleanupTask.findMany({
      where: { orgId, tenantId, fiscalYear },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createBsCleanupTask(
    orgId: string,
    fiscalYear: number,
    input: {
      templateKey?: string | null;
      category: string;
      label: string;
      amount?: number;
      hint?: string;
      memo?: string;
      done?: boolean;
    },
    userId?: string,
  ) {
    const tenantId = await this.resolveTenantId(orgId);
    return this.prisma.bsCleanupTask.create({
      data: {
        orgId,
        tenantId,
        fiscalYear,
        templateKey: input.templateKey ?? null,
        category: input.category,
        label: input.label,
        amount: input.amount ?? 0,
        hint: input.hint ?? '',
        memo: input.memo ?? '',
        done: input.done ?? false,
        updatedById: userId,
      },
    });
  }

  async updateBsCleanupTask(
    id: string,
    orgId: string,
    patch: {
      done?: boolean;
      memo?: string;
      label?: string;
      amount?: number;
      hint?: string;
    },
    userId?: string,
  ) {
    const tenantId = await this.resolveTenantId(orgId);
    const res = await this.prisma.bsCleanupTask.updateMany({
      where: { id, orgId, tenantId },
      data: { ...patch, updatedById: userId ?? null },
    });
    return { updated: res.count };
  }

  async deleteBsCleanupTask(id: string, orgId: string) {
    const tenantId = await this.resolveTenantId(orgId);
    const res = await this.prisma.bsCleanupTask.deleteMany({
      where: { id, orgId, tenantId },
    });
    return { deleted: res.count };
  }

  // ============================================================
  // 07 year_end_schedule_item_states
  // ============================================================
  async listScheduleItemStates(orgId: string, fiscalYear: number) {
    const tenantId = await this.resolveTenantId(orgId);
    return this.prisma.yearEndScheduleItemState.findMany({
      where: { orgId, tenantId, fiscalYear },
    });
  }

  async upsertScheduleItemState(
    orgId: string,
    fiscalYear: number,
    itemId: string,
    patch: { isDone?: boolean; customDate?: string | null },
    userId?: string,
  ) {
    const tenantId = await this.resolveTenantId(orgId);
    return this.prisma.yearEndScheduleItemState.upsert({
      where: {
        orgId_fiscalYear_itemId: { orgId, fiscalYear, itemId },
      },
      create: {
        orgId,
        tenantId,
        fiscalYear,
        itemId,
        isDone: patch.isDone ?? false,
        customDate: patch.customDate ?? null,
        updatedById: userId,
      },
      update: {
        ...(patch.isDone !== undefined ? { isDone: patch.isDone } : {}),
        ...(patch.customDate !== undefined
          ? { customDate: patch.customDate }
          : {}),
        updatedById: userId,
      },
    });
  }

  // ============================================================
  // locaben_states
  // ============================================================
  async getLocabenState(orgId: string) {
    const tenantId = await this.resolveTenantId(orgId);
    return this.prisma.locabenState.findFirst({
      where: { orgId, tenantId },
    });
  }

  async upsertLocabenState(
    orgId: string,
    patch: {
      industryOverride?: string | null;
      values?: Prisma.InputJsonValue;
      nonFinancial?: Prisma.InputJsonValue;
      manualKeys?: Prisma.InputJsonValue;
    },
    userId?: string,
  ) {
    const tenantId = await this.resolveTenantId(orgId);
    return this.prisma.locabenState.upsert({
      where: { orgId },
      create: {
        orgId,
        tenantId,
        industryOverride: patch.industryOverride ?? null,
        values: patch.values ?? {},
        nonFinancial: patch.nonFinancial ?? {},
        manualKeys: patch.manualKeys ?? {},
        updatedById: userId,
      },
      update: {
        ...(patch.industryOverride !== undefined
          ? { industryOverride: patch.industryOverride }
          : {}),
        ...(patch.values !== undefined ? { values: patch.values } : {}),
        ...(patch.nonFinancial !== undefined
          ? { nonFinancial: patch.nonFinancial }
          : {}),
        ...(patch.manualKeys !== undefined
          ? { manualKeys: patch.manualKeys }
          : {}),
        updatedById: userId,
      },
    });
  }

  // ============================================================
  // feature_states (汎用 KV)
  // ============================================================
  async getFeatureState(orgId: string, featureKey: string, scope: string) {
    const tenantId = await this.resolveTenantId(orgId);
    return this.prisma.featureState.findFirst({
      where: { orgId, tenantId, featureKey, scope },
    });
  }

  async upsertFeatureState(
    orgId: string,
    featureKey: string,
    scope: string,
    value: Prisma.InputJsonValue,
    userId?: string,
  ) {
    const tenantId = await this.resolveTenantId(orgId);
    return this.prisma.featureState.upsert({
      where: {
        orgId_featureKey_scope: { orgId, featureKey, scope },
      },
      create: { orgId, tenantId, featureKey, scope, value, updatedById: userId },
      update: { value, updatedById: userId },
    });
  }
}
