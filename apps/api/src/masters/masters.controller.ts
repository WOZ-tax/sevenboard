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
  ParseUUIDPipe,
} from '@nestjs/common';
import { MastersService } from './masters.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
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
 * - 読み取り (GET) は org-scoped permission でアクセス制御。CL 側ユーザーも自社のマスタは閲覧可能
 * - 書き込み (POST/PUT/DELETE) は org:masters:update / org:users:manage を要求
 * - CL ユーザー作成は CreateUserDto / service で role='viewer' 固定
 */
@Controller('organizations/:orgId/masters')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class MastersController {
  constructor(private mastersService: MastersService) {}

  // --- 勘定科目 ---

  @Get('accounts')
  @RequirePermission('org:masters:read')
  async getAccounts(@Param('orgId') orgId: string) {
    return this.mastersService.getAccounts(orgId);
  }

  @Post('accounts')
  @RequirePermission('org:masters:update')
  async createAccount(
    @Param('orgId') orgId: string,
    @Body() dto: CreateAccountDto,
  ) {
    return this.mastersService.createAccount(orgId, dto);
  }

  /**
   * 勘定科目の固定/変動フラグをまとめて保存（変動損益分析画面用）。
   * ADMIN/ADVISOR 限定（同じ事務所のユーザーのみ分類を調整できる）。
   * EXECUTIVE(顧客側) からは AccountMaster を書き換えられないように制限。
   */
  // 重要: この route は必ず `@Put('accounts/:accountId')` より **前** に置くこと。
  // Nest の route matcher は登録順なので、:accountId 系より先に static path が来ないと
  // `accountId="variable-cost-flags"` として ParseUUIDPipe を通り、UUID parse 失敗で
  // P2023 を吐く（過去にハマったため記録）。
  @Put('accounts/variable-cost-flags')
  @RequirePermission('org:masters:update')
  async bulkUpdateVariableCostFlags(
    @Param('orgId') orgId: string,
    @Body() body: BulkUpdateVariableCostFlagsDto,
  ) {
    return this.mastersService.bulkUpdateVariableCostFlags(
      orgId,
      body.updates,
    );
  }

  @Put('accounts/:accountId')
  @RequirePermission('org:masters:update')
  async updateAccount(
    @Param('orgId') orgId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.mastersService.updateAccount(orgId, accountId, dto);
  }

  @Delete('accounts/:accountId')
  @RequirePermission('org:masters:update')
  async deleteAccount(
    @Param('orgId') orgId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ) {
    return this.mastersService.deleteAccount(orgId, accountId);
  }

  // --- 部門 ---

  @Get('departments')
  @RequirePermission('org:masters:read')
  async getDepartments(@Param('orgId') orgId: string) {
    return this.mastersService.getDepartments(orgId);
  }

  @Post('departments')
  @RequirePermission('org:masters:update')
  async createDepartment(
    @Param('orgId') orgId: string,
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.mastersService.createDepartment(orgId, dto);
  }

  @Put('departments/:deptId')
  @RequirePermission('org:masters:update')
  async updateDepartment(
    @Param('orgId') orgId: string,
    @Param('deptId') deptId: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.mastersService.updateDepartment(orgId, deptId, dto);
  }

  @Delete('departments/:deptId')
  @RequirePermission('org:masters:update')
  async deleteDepartment(
    @Param('orgId') orgId: string,
    @Param('deptId') deptId: string,
  ) {
    return this.mastersService.deleteDepartment(orgId, deptId);
  }

  // --- ユーザー ---

  @Get('users')
  @RequirePermission('org:users:read')
  async getUsers(@Param('orgId') orgId: string) {
    return this.mastersService.getUsers(orgId);
  }

  @Post('users')
  @RequirePermission('org:users:manage')
  async createUser(
    @Param('orgId') orgId: string,
    @Body() dto: CreateUserDto,
  ) {
    return this.mastersService.createUser(orgId, dto);
  }

  @Put('users/:userId')
  @RequirePermission('org:users:manage')
  async updateUser(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.mastersService.updateUser(orgId, userId, dto);
  }

  @Delete('users/:userId')
  @RequirePermission('org:users:manage')
  async deleteUser(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ) {
    return this.mastersService.deleteUser(orgId, userId, req.user.id);
  }
}
