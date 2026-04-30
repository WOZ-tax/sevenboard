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

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private organizationsService: OrganizationsService) {}

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
