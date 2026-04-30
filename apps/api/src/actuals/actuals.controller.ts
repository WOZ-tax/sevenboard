import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ActualsService } from './actuals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';

@Controller('organizations/:orgId/actuals')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ActualsController {
  constructor(private actualsService: ActualsService) {}

  @Get()
  @RequirePermission('org:actuals:read')
  async findAll(
    @Param('orgId') orgId: string,
    @Query('month') month?: string,
    @Query('accountId') accountId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.actualsService.findByOrg(orgId, {
      month,
      accountId,
      departmentId,
    });
  }

  @Post('import')
  @RequirePermission('org:actuals:import')
  async importCsv(@Param('orgId') orgId: string, @Body('csv') csv: string) {
    return this.actualsService.importCsv(orgId, csv);
  }
}
