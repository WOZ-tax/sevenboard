/**
 * 決算検討 / ロカベン / 汎用 feature-state の DB 永続化 API。
 *
 * すべて顧問先 (orgId) スコープで PermissionGuard により越境を防止する。
 *
 * Endpoint:
 *   /tax-saving    — 04 節税策チェック
 *   /bs-cleanup    — 06 BS整理タスク
 *   /schedule      — 07 決算スケジュール item state
 *   /locaben       — ロカベン状態 (顧問先全体で 1 レコード)
 *   /feature/:key  — 汎用 KV (上記以外のセクション用)
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { YearEndStateService } from './year-end-state.service';

@Controller('organizations/:orgId/year-end-state')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class YearEndStateController {
  constructor(private readonly svc: YearEndStateService) {}

  // ============================================================
  // tax-saving (04)
  // ============================================================
  @Get('tax-saving')
  @RequirePermission('org:year_end_review:read')
  async listTaxSaving(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('fiscalYear', ParseIntPipe) fiscalYear: number,
  ) {
    return this.svc.listTaxSavingDone(orgId, fiscalYear);
  }

  @Put('tax-saving/:itemId')
  @RequirePermission('org:year_end_review:manage')
  async upsertTaxSaving(
    @Request() req: { user: { id: string } },
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('itemId') itemId: string,
    @Body() body: { fiscalYear: number; isDone: boolean },
  ) {
    return this.svc.upsertTaxSavingDone(
      orgId,
      body.fiscalYear,
      itemId,
      body.isDone,
      req.user.id,
    );
  }

  // ============================================================
  // bs-cleanup (06)
  // ============================================================
  @Get('bs-cleanup')
  @RequirePermission('org:year_end_review:read')
  async listBsCleanup(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('fiscalYear', ParseIntPipe) fiscalYear: number,
  ) {
    return this.svc.listBsCleanupTasks(orgId, fiscalYear);
  }

  @Post('bs-cleanup')
  @RequirePermission('org:year_end_review:manage')
  async createBsCleanup(
    @Request() req: { user: { id: string } },
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body()
    body: {
      fiscalYear: number;
      templateKey?: string | null;
      category: string;
      label: string;
      amount?: number;
      hint?: string;
      memo?: string;
      done?: boolean;
    },
  ) {
    return this.svc.createBsCleanupTask(
      orgId,
      body.fiscalYear,
      {
        templateKey: body.templateKey,
        category: body.category,
        label: body.label,
        amount: body.amount,
        hint: body.hint,
        memo: body.memo,
        done: body.done,
      },
      req.user.id,
    );
  }

  @Patch('bs-cleanup/:id')
  @RequirePermission('org:year_end_review:manage')
  async updateBsCleanup(
    @Request() req: { user: { id: string } },
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      done?: boolean;
      memo?: string;
      label?: string;
      amount?: number;
      hint?: string;
    },
  ) {
    return this.svc.updateBsCleanupTask(id, orgId, body, req.user.id);
  }

  @Delete('bs-cleanup/:id')
  @RequirePermission('org:year_end_review:manage')
  async deleteBsCleanup(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.deleteBsCleanupTask(id, orgId);
  }

  // ============================================================
  // schedule (07)
  // ============================================================
  @Get('schedule')
  @RequirePermission('org:year_end_review:read')
  async listSchedule(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('fiscalYear', ParseIntPipe) fiscalYear: number,
  ) {
    return this.svc.listScheduleItemStates(orgId, fiscalYear);
  }

  @Put('schedule/:itemId')
  @RequirePermission('org:year_end_review:manage')
  async upsertSchedule(
    @Request() req: { user: { id: string } },
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('itemId') itemId: string,
    @Body()
    body: { fiscalYear: number; isDone?: boolean; customDate?: string | null },
  ) {
    return this.svc.upsertScheduleItemState(
      orgId,
      body.fiscalYear,
      itemId,
      { isDone: body.isDone, customDate: body.customDate },
      req.user.id,
    );
  }

  /** 決算スケジュールを設定画面登録済の brief webhook に送信
   *  注: global ValidationPipe({ whitelist: true }) が DTO class なしの
   *  body を strip するため、@Body('text') で直接フィールドを取り出す */
  @Post('schedule/slack-notify')
  @RequirePermission('org:year_end_review:manage')
  async slackNotify(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body('text') text: string,
  ) {
    return this.svc.sendScheduleToSlack(orgId, text ?? '');
  }

  // ============================================================
  // locaben
  // ============================================================
  @Get('locaben')
  @RequirePermission('org:locaben:read')
  async getLocaben(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.svc.getLocabenState(orgId);
  }

  @Put('locaben')
  @RequirePermission('org:locaben:manage')
  async upsertLocaben(
    @Request() req: { user: { id: string } },
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body()
    body: {
      industryOverride?: string | null;
      values?: Prisma.InputJsonValue;
      nonFinancial?: Prisma.InputJsonValue;
      manualKeys?: Prisma.InputJsonValue;
    },
  ) {
    return this.svc.upsertLocabenState(
      orgId,
      {
        industryOverride: body.industryOverride,
        values: body.values,
        nonFinancial: body.nonFinancial,
        manualKeys: body.manualKeys,
      },
      req.user.id,
    );
  }

  // ============================================================
  // 汎用 feature-state KV
  // ============================================================
  @Get('feature/:featureKey')
  @RequirePermission('org:feature_state:read')
  async getFeature(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('featureKey') featureKey: string,
    @Query('scope') scope?: string,
  ) {
    return this.svc.getFeatureState(orgId, featureKey, scope ?? '');
  }

  @Put('feature/:featureKey')
  @RequirePermission('org:feature_state:write')
  async upsertFeature(
    @Request() req: { user: { id: string } },
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('featureKey') featureKey: string,
    @Query('scope') scope: string | undefined,
    @Body() body: { value: Prisma.InputJsonValue },
  ) {
    return this.svc.upsertFeatureState(
      orgId,
      featureKey,
      scope ?? '',
      body.value,
      req.user.id,
    );
  }
}
