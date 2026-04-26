import {
  Controller,
  Get,
  Put,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  InternalRoles,
  InternalStaffGuard,
} from '../auth/internal-staff.guard';
import { OrgAccessService } from '../auth/org-access.service';
import { KintoneApiService } from './kintone-api.service';
import { DataHealthService } from '../data-health/data-health.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('kintone')
@UseGuards(JwtAuthGuard)
export class KintoneController {
  constructor(
    private kintoneApi: KintoneApiService,
    private dataHealth: DataHealthService,
    private prisma: PrismaService,
    private orgAccess: OrgAccessService,
  ) {}

  /**
   * リクエストの JWT orgId から保有する MF事業者コードを引き、指定 mfCode と一致するか検証する。
   * 一致しなければ他テナントへの越境アクセスとして Forbidden を投げる。
   */
  private async assertMfCodeBelongsToCaller(
    req: Request,
    mfCode: string,
  ): Promise<void> {
    const orgId = (req.user as { orgId?: string } | undefined)?.orgId;
    if (!orgId) {
      throw new ForbiddenException('Authenticated orgId is required');
    }
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { code: true },
    });
    if (!org?.code) {
      throw new ForbiddenException(
        'This organization has no MF office code registered',
      );
    }
    if (org.code !== mfCode) {
      throw new ForbiddenException(
        'mfCode does not belong to your organization',
      );
    }
  }

  /** JWTに載っている orgId を取り出し、kintone 呼び出しの成功/失敗を DataHealth に記録する汎用ラッパー */
  private async withHealthRecord<T>(
    req: Request,
    fn: () => Promise<T>,
  ): Promise<T> {
    const orgId = (req.user as { orgId?: string } | undefined)?.orgId;
    const start = Date.now();
    try {
      const result = await fn();
      if (orgId) {
        await this.dataHealth
          .record({
            orgId,
            source: 'KINTONE',
            status: 'SUCCESS',
            durationMs: Date.now() - start,
          })
          .catch(() => undefined);
      }
      return result;
    } catch (err: any) {
      if (orgId) {
        await this.dataHealth
          .record({
            orgId,
            source: 'KINTONE',
            status: 'FAILED',
            errorMessage: String(err?.message ?? err).substring(0, 500),
            durationMs: Date.now() - start,
          })
          .catch(() => undefined);
      }
      throw err;
    }
  }

  /**
   * 月次進捗一覧を取得（顧問先トリアージ画面用）。
   *
   * 内部スタッフ専用（orgId=NULL かつ role=owner/advisor）。
   * 顧問先側 owner（CL 管理者）は InternalStaffGuard で遮断。
   *
   * 内部 advisor の場合は kintone 全件を返した後に、自分が担当する
   * orgId に紐づく MF事業者番号を持つレコードだけにフィルタする。
   */
  @Get('monthly-progress')
  @UseGuards(InternalStaffGuard)
  async getMonthlyProgress(
    @Req() req: Request,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('search') search?: string,
    @Query('assignee') assignee?: string,
  ) {
    const user = req.user as { id: string; role: string; orgId: string | null };
    const fy = fiscalYear || new Date().getFullYear().toString();
    const records = await this.withHealthRecord(req, () =>
      this.kintoneApi.getMonthlyProgress(fy, search, assignee),
    );

    // 内部 advisor は担当先のみに絞り込み
    const accessible = await this.orgAccess.getAccessibleOrgIds(user);
    if (accessible === 'all') return records;

    const allowedMfCodes = await this.prisma.organization
      .findMany({
        where: { id: { in: accessible } },
        select: { code: true },
      })
      .then((rows) => new Set(rows.map((r) => r.code).filter(Boolean) as string[]));

    return records.filter((r: { mfOfficeCode?: string }) =>
      r.mfOfficeCode ? allowedMfCodes.has(r.mfOfficeCode) : false,
    );
  }

  /**
   * MF事業者番号で月次進捗を取得（ダッシュボード連携用）
   */
  @Get('monthly-progress/by-mf/:mfCode')
  async getByMfCode(
    @Param('mfCode') mfCode: string,
    @Req() req: Request,
    @Query('fiscalYear') fiscalYear?: string,
  ) {
    await this.assertMfCodeBelongsToCaller(req, mfCode);
    return this.withHealthRecord(req, () =>
      this.kintoneApi.getByMfOfficeCode(mfCode, fiscalYear),
    );
  }

  /**
   * 顧客基本情報(appId:16)をMFコードから取得。AI CFOレポートの業種別分析に使う。
   */
  @Get('customer-basic/by-mf/:mfCode')
  async getCustomerBasicByMfCode(
    @Param('mfCode') mfCode: string,
    @Req() req: Request,
  ) {
    await this.assertMfCodeBelongsToCaller(req, mfCode);
    return this.withHealthRecord(req, () =>
      this.kintoneApi.getCustomerBasicByMfCode(mfCode),
    );
  }

  /**
   * 月次進捗ステータスを更新
   */
  private static VALID_STATUSES = [
    '0.未作業', '1.資料依頼済', '2.資料回収済', '3.入力済', '4.納品済', '5.実施不要',
  ];

  /**
   * 月次進捗ステータスを更新。
   *
   * 内部スタッフ専用（orgId=NULL かつ role=owner/advisor）。
   * 内部 advisor の場合は対象レコードの MF事業者番号 → 自分が担当する org に
   * 該当するかを必ず検証してから更新する（IDOR 対策）。
   */
  @Put('monthly-progress/:recordId')
  @UseGuards(InternalStaffGuard)
  async updateStatus(
    @Req() req: Request,
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

    const user = req.user as { id: string; role: string; orgId: string | null };
    const accessible = await this.orgAccess.getAccessibleOrgIds(user);

    // 内部 owner は全件 OK。advisor は record の mfCode から org を引いて access 検証
    if (accessible !== 'all') {
      const mfCode = await this.kintoneApi.getRecordMfCode(recordId);
      if (!mfCode) {
        throw new NotFoundException('対象レコードが存在しないか、MF事業者番号が未設定です');
      }
      const org = await this.prisma.organization.findUnique({
        where: { code: mfCode },
        select: { id: true },
      });
      if (!org || !accessible.includes(org.id)) {
        throw new ForbiddenException('この顧問先の月次進捗を更新する権限がありません');
      }
    }

    const ok = await this.kintoneApi.updateMonthlyStatus(
      recordId,
      body.month,
      body.status,
    );
    return { success: ok };
  }
}
