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
  Header,
  HttpCode,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionGuard } from "../auth/permission.guard";
import { RequirePermission } from "../auth/require-permission.decorator";
import { InternalUsersService } from "./internal-users.service";
import { CreateInternalUserDto } from "./dto/create-internal-user.dto";
import { UpdateInternalUserDto } from "./dto/update-internal-user.dto";
import { BulkStaffDto, BulkAssignmentsDto } from "./dto/bulk-staff.dto";
import { BulkStaffService } from "./bulk-staff.service";

/**
 * Tenant-scoped accounting firm staff management.
 * Platform owners do not get tenant staff access unless that tenant explicitly
 * invites them through this API.
 */
@Controller("tenants/:tenantId/staff")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class InternalUsersController {
  constructor(
    private internalUsers: InternalUsersService,
    private bulk: BulkStaffService,
  ) {}

  @Post("bulk/preview")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @RequirePermission("tenant:staff:manage")
  previewBulk(
    @Request() req,
    @Param("tenantId") tenantId: string,
    @Body() dto: BulkStaffDto,
  ) {
    return this.bulk.previewStaff(req.user, tenantId, dto);
  }

  @Post("bulk")
  @Header("Cache-Control", "no-store")
  @RequirePermission("tenant:staff:manage")
  createBulk(
    @Request() req,
    @Param("tenantId") tenantId: string,
    @Body() dto: BulkStaffDto,
  ) {
    return this.bulk.createStaff(req.user, tenantId, dto);
  }

  @Post("assignments/preview")
  @HttpCode(200)
  @RequirePermission("tenant:staff:manage")
  previewAssignments(
    @Request() req,
    @Param("tenantId") tenantId: string,
    @Body() dto: BulkAssignmentsDto,
  ) {
    return this.bulk.previewAssignments(req.user, tenantId, dto);
  }

  @Post("assignments/bulk")
  @RequirePermission("tenant:staff:manage")
  assignBulk(
    @Request() req,
    @Param("tenantId") tenantId: string,
    @Body() dto: BulkAssignmentsDto,
  ) {
    return this.bulk.assign(req.user, tenantId, dto);
  }

  @Get()
  @RequirePermission("tenant:staff:read")
  async list(@Param("tenantId") tenantId: string) {
    return this.internalUsers.list(tenantId);
  }

  @Post()
  @RequirePermission("tenant:staff:manage")
  async create(
    @Param("tenantId") tenantId: string,
    @Body() dto: CreateInternalUserDto,
  ) {
    return this.internalUsers.create(tenantId, dto);
  }

  @Put(":userId")
  @RequirePermission("tenant:staff:manage")
  async update(
    @Param("tenantId") tenantId: string,
    @Param("userId") userId: string,
    @Body() dto: UpdateInternalUserDto,
  ) {
    return this.internalUsers.update(tenantId, userId, dto);
  }

  @Delete(":userId")
  @RequirePermission("tenant:staff:manage")
  async remove(
    @Request() req,
    @Param("tenantId") tenantId: string,
    @Param("userId") userId: string,
  ) {
    return this.internalUsers.remove(req.user.id, tenantId, userId);
  }
}
