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
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

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
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  async createAccount(
    @Param('orgId') orgId: string,
    @Body() dto: CreateAccountDto,
  ) {
    return this.mastersService.createAccount(orgId, dto);
  }

  @Put('accounts/:accountId')
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  async updateAccount(
    @Param('orgId') orgId: string,
    @Param('accountId') accountId: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.mastersService.updateAccount(orgId, accountId, dto);
  }

  @Delete('accounts/:accountId')
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  async deleteAccount(
    @Param('orgId') orgId: string,
    @Param('accountId') accountId: string,
  ) {
    return this.mastersService.deleteAccount(orgId, accountId);
  }

  // --- 部門 ---

  @Get('departments')
  async getDepartments(@Param('orgId') orgId: string) {
    return this.mastersService.getDepartments(orgId);
  }

  @Post('departments')
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  async createDepartment(
    @Param('orgId') orgId: string,
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.mastersService.createDepartment(orgId, dto);
  }

  @Put('departments/:deptId')
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  async updateDepartment(
    @Param('orgId') orgId: string,
    @Param('deptId') deptId: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.mastersService.updateDepartment(orgId, deptId, dto);
  }

  @Delete('departments/:deptId')
  @Roles('ADMIN')
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
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  async createUser(
    @Param('orgId') orgId: string,
    @Body() dto: CreateUserDto,
  ) {
    return this.mastersService.createUser(orgId, dto);
  }

  @Put('users/:userId')
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  async updateUser(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.mastersService.updateUser(orgId, userId, dto);
  }

  @Delete('users/:userId')
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  async deleteUser(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ) {
    return this.mastersService.deleteUser(orgId, userId, req.user.id);
  }
}
