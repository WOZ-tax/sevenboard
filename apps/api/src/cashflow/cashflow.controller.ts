import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CashflowService } from './cashflow.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateCashflowCategoryDto } from './dto/create-cashflow-category.dto';

@Controller('organizations/:orgId/cashflow')
@UseGuards(JwtAuthGuard, OrgAccessGuard)
export class CashflowController {
  constructor(private cashflowService: CashflowService) {}

  @Get('actual')
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
  async getRunway(@Param('orgId') orgId: string) {
    return this.cashflowService.getRunway(orgId);
  }

  @Get('categories')
  async getCategories(@Param('orgId') orgId: string) {
    return this.cashflowService.getCategories(orgId);
  }

  @Post('categories')
  @Roles('ADMIN', 'CFO')
  @UseGuards(RolesGuard)
  async createCategory(
    @Param('orgId') orgId: string,
    @Body() dto: CreateCashflowCategoryDto,
  ) {
    return this.cashflowService.createCategory(orgId, dto);
  }
}
