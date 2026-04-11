import {
  Controller,
  Get,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KintoneApiService } from './kintone-api.service';

@Controller('kintone')
@UseGuards(JwtAuthGuard)
export class KintoneController {
  constructor(private kintoneApi: KintoneApiService) {}

  /**
   * 月次進捗一覧を取得（顧問先トリアージ画面用）
   */
  @Get('monthly-progress')
  async getMonthlyProgress(
    @Query('fiscalYear') fiscalYear?: string,
    @Query('search') search?: string,
    @Query('assignee') assignee?: string,
  ) {
    const fy = fiscalYear || new Date().getFullYear().toString();
    return this.kintoneApi.getMonthlyProgress(fy, search, assignee);
  }

  /**
   * MF事業者番号で月次進捗を取得（ダッシュボード連携用）
   */
  @Get('monthly-progress/by-mf/:mfCode')
  async getByMfCode(
    @Param('mfCode') mfCode: string,
    @Query('fiscalYear') fiscalYear?: string,
  ) {
    return this.kintoneApi.getByMfOfficeCode(mfCode, fiscalYear);
  }

  /**
   * 月次進捗ステータスを更新
   */
  private static VALID_STATUSES = [
    '0.未作業', '1.資料依頼済', '2.資料回収済', '3.入力済', '4.納品済', '5.実施不要',
  ];

  @Put('monthly-progress/:recordId')
  async updateStatus(
    @Param('recordId') recordId: string,
    @Body() body: { month: number; status: string },
  ) {
    if (!/^\d+$/.test(recordId)) {
      throw new BadRequestException('recordId must be numeric');
    }
    if (!body.month || body.month < 1 || body.month > 12) {
      throw new BadRequestException('month must be 1-12');
    }
    if (!KintoneController.VALID_STATUSES.includes(body.status)) {
      throw new BadRequestException(`Invalid status. Must be one of: ${KintoneController.VALID_STATUSES.join(', ')}`);
    }
    const ok = await this.kintoneApi.updateMonthlyStatus(
      recordId,
      body.month,
      body.status,
    );
    return { success: ok };
  }
}
