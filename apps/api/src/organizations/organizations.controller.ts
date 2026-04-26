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
import { OrgAccessGuard } from '../auth/org-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private organizationsService: OrganizationsService) {}

  @Get()
  async findAll(@Request() req) {
    return this.organizationsService.findAll(req.user);
  }

  @Get(':orgId')
  @UseGuards(OrgAccessGuard)
  async findOne(@Param('orgId') orgId: string) {
    return this.organizationsService.findOne(orgId);
  }

  /**
   * 新規顧問先を作成。内部スタッフ (orgId=NULL かつ role=owner/advisor) のみ。
   * service 層で isInternalStaff チェック。controller の @Roles は global role の
   * 一次フィルタ（顧問先側の owner/admin で role が同名でも service で弾く）。
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles('owner', 'advisor')
  async create(@Request() req, @Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(req.user, dto);
  }

  /**
   * 顧問先情報を更新。内部 owner=全件、内部 advisor=担当先のみ。
   * 顧問先側 owner（CL 管理者）は service 層で弾かれる。
   */
  @Put(':orgId')
  @UseGuards(OrgAccessGuard, RolesGuard)
  @Roles('owner', 'advisor')
  async update(
    @Request() req,
    @Param('orgId') orgId: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.update(req.user, orgId, dto);
  }

  /**
   * 顧問先を削除。内部 owner のみ。
   * 顧問先側 owner（CL 管理者）が「自社を削除」できない設計。
   */
  @Delete(':orgId')
  @UseGuards(OrgAccessGuard, RolesGuard)
  @Roles('owner')
  async remove(@Request() req, @Param('orgId') orgId: string) {
    return this.organizationsService.remove(req.user, orgId);
  }
}
