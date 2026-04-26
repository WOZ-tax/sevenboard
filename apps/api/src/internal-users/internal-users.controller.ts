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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  InternalRoles,
  InternalStaffGuard,
} from '../auth/internal-staff.guard';
import { InternalUsersService } from './internal-users.service';
import { CreateInternalUserDto } from './dto/create-internal-user.dto';
import { UpdateInternalUserDto } from './dto/update-internal-user.dto';

/**
 * SEVENRICH 事務所スタッフ管理エンドポイント。
 *
 * - 内部スタッフ (orgId=NULL かつ role=owner) のみアクセス可能
 * - 顧問先側 owner（CL 管理者）は許可しない（InternalStaffGuard で遮断）
 * - CL（顧問先）側ユーザー管理は /organizations/:orgId/masters/users
 *   （そちらは role=viewer 固定で別経路）
 */
@Controller('internal/users')
@UseGuards(JwtAuthGuard, InternalStaffGuard)
@InternalRoles('owner')
export class InternalUsersController {
  constructor(private internalUsers: InternalUsersService) {}

  @Get()
  async list() {
    return this.internalUsers.list();
  }

  @Post()
  async create(@Body() dto: CreateInternalUserDto) {
    return this.internalUsers.create(dto);
  }

  @Put(':userId')
  async update(
    @Param('userId') userId: string,
    @Body() dto: UpdateInternalUserDto,
  ) {
    return this.internalUsers.update(userId, dto);
  }

  @Delete(':userId')
  async remove(@Request() req, @Param('userId') userId: string) {
    return this.internalUsers.remove(req.user.id, userId);
  }
}
