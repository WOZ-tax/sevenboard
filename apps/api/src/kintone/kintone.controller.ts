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
  ) {
    const fy = fiscalYear || new Date().getFullYear().toString();
    return this.kintoneApi.getMonthlyProgress(fy, search);
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
  @Put('monthly-progress/:recordId')
  async updateStatus(
    @Param('recordId') recordId: string,
    @Body() body: { month: number; status: string },
  ) {
    if (!body.month || body.month < 1 || body.month > 12) {
      throw new BadRequestException('month must be 1-12');
    }
    const ok = await this.kintoneApi.updateMonthlyStatus(
      recordId,
      body.month,
      body.status,
    );
    return { success: ok };
  }
}
