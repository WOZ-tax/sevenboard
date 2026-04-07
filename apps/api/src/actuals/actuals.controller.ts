import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ActualsService } from './actuals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('organizations/:orgId/actuals')
@UseGuards(JwtAuthGuard, OrgAccessGuard)
export class ActualsController {
  constructor(private actualsService: ActualsService) {}

  @Get()
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
  @Roles('ADMIN', 'CFO')
  @UseGuards(RolesGuard)
  async importCsv(
    @Param('orgId') orgId: string,
    @Body('csv') csv: string,
  ) {
    return this.actualsService.importCsv(orgId, csv);
  }
}
