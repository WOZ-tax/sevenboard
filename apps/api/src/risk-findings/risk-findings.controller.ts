import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { FindingStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { RiskFindingsService } from './risk-findings.service';
import { UpdateRiskFindingStatusDto } from './dto/update-status.dto';
import { RunRiskScanDto } from './dto/scan.dto';

/**
 * 会計レビュー画面 ② 要確認アイテムの API。
 *
 * GET    一覧
 * PATCH  ステータス更新 (確認済 / 対応不要 / 対応完了)
 * POST   手動スキャン (L1 はコストゼロ、L3 は LLM トークン消費)
 */
@Controller('organizations/:orgId/risk-findings')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class RiskFindingsController {
  constructor(private service: RiskFindingsService) {}

  @Get()
  @RequirePermission('org:risk_findings:read')
  async list(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('fiscalYear', ParseIntPipe) fiscalYear: number,
    @Query('month', ParseIntPipe) month: number,
    @Query('status') status?: string,
  ) {
    const statusFilter = parseStatuses(status);
    return this.service.list(orgId, fiscalYear, month, statusFilter);
  }

  @Patch(':findingId')
  @RequirePermission('org:risk_findings:manage')
  async updateStatus(
    @Request() req,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('findingId', ParseUUIDPipe) findingId: string,
    @Body() dto: UpdateRiskFindingStatusDto,
  ) {
    return this.service.updateStatus(orgId, findingId, dto.status, req.user.id);
  }

  @Post('scan')
  @RequirePermission('org:risk_findings:scan')
  async runScan(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: RunRiskScanDto,
  ) {
    return this.service.runScan(orgId, dto.fiscalYear, dto.month, dto.layer);
  }
}

/**
 * status クエリは複数指定可: "OPEN,CONFIRMED" 等。未指定ならデフォルト (OPEN + CONFIRMED)。
 */
function parseStatuses(raw?: string): FindingStatus[] | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(
      (s): s is FindingStatus =>
        s === 'OPEN' ||
        s === 'CONFIRMED' ||
        s === 'DISMISSED' ||
        s === 'RESOLVED',
    );
  return parts.length > 0 ? parts : undefined;
}
