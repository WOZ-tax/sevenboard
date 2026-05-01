import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { AddAdvisorsDto } from './dto/add-advisors.dto';
import { PrismaService } from '../prisma/prisma.service';
import { KintoneApiService } from '../kintone/kintone-api.service';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(
    private organizationsService: OrganizationsService,
    private prisma: PrismaService,
    private kintone: KintoneApiService,
  ) {}

  @Get()
  async findAll(@Request() req) {
    return this.organizationsService.findAll(req.user);
  }

  @Get(':orgId')
  @UseGuards(PermissionGuard)
  @RequirePermission('org:organizations:read')
  async findOne(@Request() req, @Param('orgId') orgId: string) {
    return this.organizationsService.findOne(req.user, orgId);
  }

  /**
   * 新規顧問先を作成。
   * AuthorizationService が tenant-scoped membership を見て許可する。
   */
  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('tenant:organizations:create')
  async create(@Request() req, @Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(req.user, dto);
  }

  /**
   * 顧問先情報を更新。tenant / organization membership の permission で判定する。
   */
  @Put(':orgId')
  @UseGuards(PermissionGuard)
  @RequirePermission('org:organizations:update')
  async update(
    @Request() req,
    @Param('orgId') orgId: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.update(req.user, orgId, dto);
  }

  /**
   * 顧問先を削除。tenant owner 相当の強い permission のみ許可する。
   */
  @Delete(':orgId')
  @UseGuards(PermissionGuard)
  @RequirePermission('org:organizations:delete')
  async remove(@Request() req, @Param('orgId') orgId: string) {
    return this.organizationsService.remove(req.user, orgId);
  }

  /**
   * 担当アサイン (advisor 側スタッフ) の一覧。
   */
  @Get(':orgId/advisors')
  @UseGuards(PermissionGuard)
  @RequirePermission('org:users:read')
  async listAdvisors(@Request() req, @Param('orgId') orgId: string) {
    return this.organizationsService.listAdvisors(req.user, orgId);
  }

  /**
   * 既存スタッフをこの顧問先の担当として一括追加。
   */
  @Post(':orgId/advisors')
  @UseGuards(PermissionGuard)
  @RequirePermission('org:users:manage')
  async addAdvisors(
    @Request() req,
    @Param('orgId') orgId: string,
    @Body() dto: AddAdvisorsDto,
  ) {
    return this.organizationsService.addAdvisors(req.user, orgId, dto.userIds);
  }

  /**
   * kintone 顧客基本情報 (appId 16) から industry / websiteUrl を prefill。
   * 既存値があれば上書きする。MF 事業者番号 (organization.code) を kintone 検索キーに使う。
   *
   * 戻り値:
   *   { ok: true, applied: { industry, websiteUrl }, skipped: [...] }
   *   ok: false の場合は kintone でレコードが見つからなかった等の理由を message で返す。
   */
  @Post(':orgId/kintone-import')
  @UseGuards(PermissionGuard)
  @RequirePermission('org:organizations:update')
  async kintoneImport(@Request() req, @Param('orgId') orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { code: true, industry: true, websiteUrl: true },
    });
    if (!org) {
      return { ok: false, message: 'Organization が見つかりません' };
    }
    if (!org.code) {
      return {
        ok: false,
        message:
          'MF 事業者番号 (organization.code) が未設定のため kintone 検索ができません',
      };
    }

    const customer = await this.kintone.getCustomerBasicByMfCode(org.code);
    if (!customer) {
      return {
        ok: false,
        message: `kintone に MF 事業者番号 ${org.code} の顧客基本情報が見つかりません`,
      };
    }

    const updated = await this.organizationsService.kintoneImport(
      req.user,
      orgId,
      {
        industry: customer.industry ?? null,
        websiteUrl: customer.websiteUrl ?? null,
      },
    );

    const applied: Record<string, string> = {};
    const skipped: string[] = [];
    if (customer.industry) applied.industry = customer.industry;
    else skipped.push('industry (kintone 側に値なし)');
    if (customer.websiteUrl) applied.websiteUrl = customer.websiteUrl;
    else skipped.push('websiteUrl (kintone 側に値なし)');

    return {
      ok: true,
      applied,
      skipped,
      kintoneSyncedAt: updated.kintoneSyncedAt,
      clientName: customer.clientName,
    };
  }

  /**
   * 担当アサインを解除。
   */
  @Delete(':orgId/advisors/:userId')
  @UseGuards(PermissionGuard)
  @RequirePermission('org:users:manage')
  async removeAdvisor(
    @Request() req,
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
  ) {
    return this.organizationsService.removeAdvisor(req.user, orgId, userId);
  }
}
