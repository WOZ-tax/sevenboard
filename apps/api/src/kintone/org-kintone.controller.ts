import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { InternalStaffGuard } from '../auth/internal-staff.guard';
import { MfApiService } from '../mf/mf-api.service';
import { KintoneApiService } from './kintone-api.service';
import { DataHealthService } from '../data-health/data-health.service';
import { DemoService } from '../demo/demo.service';
import { isDemoOrg } from '../demo/demo.constants';

/** Resolve the MF identity only after authorization for the selected organization.
 * Organization.code is an optional internal code, not a reliable MF identity.
 * Registered in MfModule, which already imports KintoneModule, to avoid a module cycle.
 */
@Controller('organizations/:orgId/kintone')
@RequirePermission('org:mf:read')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class OrgKintoneController {
  constructor(
    private readonly mfApi: MfApiService,
    private readonly kintoneApi: KintoneApiService,
    private readonly dataHealth: DataHealthService,
    private readonly demo: DemoService,
  ) {}

  private async getMfCode(orgId: string): Promise<string> {
    const office = await this.mfApi.getOffice(orgId);
    const code = office.code?.trim();
    if (!code) {
      throw new ServiceUnavailableException(
        'MF接続先の事業者番号を取得できませんでした',
      );
    }
    return code;
  }

  private async withHealth<T>(
    orgId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await task();
      await this.dataHealth
        .record({
          orgId,
          source: 'KINTONE',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
        })
        .catch(() => undefined);
      return result;
    } catch (error: unknown) {
      await this.dataHealth
        .record({
          orgId,
          source: 'KINTONE',
          status: 'FAILED',
          errorMessage:
            error instanceof Error
              ? error.message.slice(0, 500)
              : 'kintone lookup failed',
          durationMs: Date.now() - start,
        })
        .catch(() => undefined);
      throw error;
    }
  }

  @Get('monthly-progress')
  async getMonthlyProgress(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
  ) {
    if (
      fiscalYear !== undefined &&
      (!/^\d{4}$/.test(fiscalYear) ||
        Number(fiscalYear) < 1900 ||
        Number(fiscalYear) > 2100)
    ) {
      throw new BadRequestException('Invalid fiscal year');
    }
    if (isDemoOrg(orgId))
      return { record: await this.demo.monthlyProgress(fiscalYear) };
    const mfCode = await this.getMfCode(orgId);
    const record = await this.withHealth(orgId, () =>
      this.kintoneApi.getByMfOfficeCode(mfCode, fiscalYear),
    );
    return { record };
  }

  @Put('monthly-progress/:recordId')
  @RequirePermission('org:mf:read', 'org:monthly_close:manage')
  @UseGuards(InternalStaffGuard)
  async updateStatus(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('recordId') recordId: string,
    @Body() body: { month: number; status: string },
  ) {
    if (!/^\d+$/.test(recordId))
      throw new BadRequestException('recordId must be numeric');
    if (!Number.isInteger(body.month) || body.month < 1 || body.month > 12)
      throw new BadRequestException('month must be 1-12');
    if (
      ![
        '0.未作業',
        '1.資料依頼済',
        '2.資料回収済',
        '3.入力済',
        '4.納品済',
        '5.実施不要',
      ].includes(body.status)
    )
      throw new BadRequestException('Invalid status');
    if (isDemoOrg(orgId))
      return this.demo.updateMonthlyProgress(recordId, body.month, body.status);
    const mfCode = await this.getMfCode(orgId);
    const recordCode = await this.kintoneApi.getRecordMfCode(recordId);
    if (!recordCode)
      throw new NotFoundException(
        '対象レコードが存在しないか、MF事業者番号が未設定です',
      );
    if (recordCode.trim() !== mfCode)
      throw new ForbiddenException(
        'この顧問先の月次進捗を更新する権限がありません',
      );
    return this.withHealth(orgId, async () => ({
      success: await this.kintoneApi.updateMonthlyStatus(
        recordId,
        body.month,
        body.status,
      ),
    }));
  }
}
