import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { AiService } from './ai.service';

@Controller('organizations/:orgId/ai')
@UseGuards(JwtAuthGuard, OrgAccessGuard, RateLimitGuard)
export class AiController {
  constructor(private aiService: AiService) {}

  private parseFy(fiscalYear?: string): number | undefined {
    if (!fiscalYear) return undefined;
    const fy = parseInt(fiscalYear, 10);
    if (isNaN(fy) || fy < 1900 || fy > 2100) {
      throw new BadRequestException('Invalid fiscal year');
    }
    return fy;
  }

  @Get('summary')
  async getSummary(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
  ) {
    return this.aiService.generateMonthlySummary(orgId, this.parseFy(fiscalYear));
  }

  @Get('talk-script')
  async getTalkScript(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
  ) {
    return this.aiService.generateTalkScript(orgId, this.parseFy(fiscalYear));
  }

  @Get('budget-scenarios')
  async getBudgetScenarios(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
  ) {
    return this.aiService.generateBudgetScenarios(orgId, this.parseFy(fiscalYear));
  }

  @Post('budget-scenarios')
  async generateBudgetScenariosWithParams(
    @Param('orgId') orgId: string,
    @Body() body: {
      fiscalYear?: number;
      baseGrowthRate?: number;
      upsideGrowthRate?: number;
      downsideGrowthRate?: number;
      newHires?: number;
      costReductionRate?: number;
      notes?: string;
    },
  ) {
    return this.aiService.generateBudgetScenarios(orgId, body.fiscalYear, body);
  }

  @Get('funding-report')
  async getFundingReport(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
  ) {
    return this.aiService.generateFundingReport(orgId, this.parseFy(fiscalYear));
  }
}
