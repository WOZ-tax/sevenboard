import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { MastersService } from './masters.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { BulkUpdateVariableCostFlagsDto } from './dto/bulk-update-variable-cost-flags.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/**
 * 顧問先 (organization) のマスタ管理。
 *
 * G-1 ロール設計：
 * - 読み取り (GET) は OrgAccessGuard でアクセス制御。CL 側ユーザーも自社のマスタは閲覧可能
 * - 書き込み (POST/PUT/DELETE) は **内部スタッフ (owner / advisor) のみ**
 *   - org-aware RolesGuard により、advisor は OrganizationMembership を持つ顧問先のみで write 可
 *   - CL 側 admin / member / viewer は write 不可（masters は事務所主体で管理する設計）
 * - CL ユーザー作成は CreateUserDto / service で role='viewer' 固定
 */
@Controller('organizations/:orgId/masters')
@UseGuards(JwtAuthGuard, OrgAccessGuard)
export class MastersController {
  constructor(private mastersService: MastersService) {}

  // --- 勘定科目 ---

  @Get('accounts')
  async getAccounts(@Param('orgId') orgId: string) {
    return this.mastersService.getAccounts(orgId);
  }

  @Post('accounts')
  @Roles('owner', 'advisor')
  @UseGuards(RolesGuard)
  async createAccount(
    @Param('orgId') orgId: string,
    @Body() dto: CreateAccountDto,
  ) {
    return this.mastersService.createAccount(orgId, dto);
  }

  @Put('accounts/:accountId')
  @Roles('owner', 'advisor')
  @UseGuards(RolesGuard)
  async updateAccount(
    @Param('orgId') orgId: string,
    @Param('accountId') accountId: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.mastersService.updateAccount(orgId, accountId, dto);
  }

  @Delete('accounts/:accountId')
  @Roles('owner', 'advisor')
  @UseGuards(RolesGuard)
  async deleteAccount(
    @Param('orgId') orgId: string,
    @Param('accountId') accountId: string,
  ) {
    return this.mastersService.deleteAccount(orgId, accountId);
  }

  /**
   * 勘定科目の固定/変動フラグをまとめて保存（変動損益分析画面用）。
   * ADMIN/ADVISOR 限定（同じ事務所のユーザーのみ分類を調整できる）。
   * EXECUTIVE(顧客側) からは AccountMaster を書き換えられないように制限。
   */
  @Put('accounts/variable-cost-flags')
  @Roles('owner', 'advisor')
  @UseGuards(RolesGuard)
  async bulkUpdateVariableCostFlags(
    @Param('orgId') orgId: string,
    @Body() body: BulkUpdateVariableCostFlagsDto,
  ) {
    return this.mastersService.bulkUpdateVariableCostFlags(
      orgId,
      body.updates,
    );
  }

  // --- 部門 ---

  @Get('departments')
  async getDepartments(@Param('orgId') orgId: string) {
    return this.mastersService.getDepartments(orgId);
  }

  @Post('departments')
  @Roles('owner', 'advisor')
  @UseGuards(RolesGuard)
  async createDepartment(
    @Param('orgId') orgId: string,
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.mastersService.createDepartment(orgId, dto);
  }

  @Put('departments/:deptId')
  @Roles('owner', 'advisor')
  @UseGuards(RolesGuard)
  async updateDepartment(
    @Param('orgId') orgId: string,
    @Param('deptId') deptId: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.mastersService.updateDepartment(orgId, deptId, dto);
  }

  @Delete('departments/:deptId')
  @Roles('owner', 'advisor')
  @UseGuards(RolesGuard)
  async deleteDepartment(
    @Param('orgId') orgId: string,
    @Param('deptId') deptId: string,
  ) {
    return this.mastersService.deleteDepartment(orgId, deptId);
  }

  // --- ユーザー ---

  @Get('users')
  async getUsers(@Param('orgId') orgId: string) {
    return this.mastersService.getUsers(orgId);
  }

  @Post('users')
  @Roles('owner', 'advisor')
  @UseGuards(RolesGuard)
  async createUser(
    @Param('orgId') orgId: string,
    @Body() dto: CreateUserDto,
  ) {
    return this.mastersService.createUser(orgId, dto);
  }

  @Put('users/:userId')
  @Roles('owner', 'advisor')
  @UseGuards(RolesGuard)
  async updateUser(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.mastersService.updateUser(orgId, userId, dto);
  }

  @Delete('users/:userId')
  @Roles('owner', 'advisor')
  @UseGuards(RolesGuard)
  async deleteUser(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ) {
    return this.mastersService.deleteUser(orgId, userId, req.user.id);
  }
}
