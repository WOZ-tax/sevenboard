import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CashflowService } from './cashflow.service';
import { CreateCashflowCategoryDto } from './dto/create-cashflow-category.dto';

@Controller('organizations/:orgId/cashflow')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CashflowController {
  constructor(private cashflowService: CashflowService) {}

  @Get('actual')
  @RequirePermission('org:cashflow:read')
  async getActual(
    @Param('orgId') orgId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.cashflowService.getActualCashflow(orgId, {
      startDate,
      endDate,
    });
  }

  @Get('runway')
  @RequirePermission('org:cashflow:read')
  async getRunway(@Param('orgId') orgId: string) {
    return this.cashflowService.getRunway(orgId);
  }

  @Get('categories')
  @RequirePermission('org:cashflow:read')
  async getCategories(@Param('orgId') orgId: string) {
    return this.cashflowService.getCategories(orgId);
  }

  @Post('categories')
  @RequirePermission('org:cashflow:manage')
  async createCategory(
    @Param('orgId') orgId: string,
    @Body() dto: CreateCashflowCategoryDto,
  ) {
    return this.cashflowService.createCategory(orgId, dto);
  }
}
