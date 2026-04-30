import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { BriefingService } from './briefing.service';
import { BriefingSchedulerService } from './briefing-scheduler.service';

class UpdatePushConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  hourJst?: number;

  @IsOptional()
  @IsString()
  webhookUrl?: string | null;
}

@Controller('organizations/:orgId/briefing')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class BriefingController {
  constructor(
    private briefing: BriefingService,
    private scheduler: BriefingSchedulerService,
    private prisma: PrismaService,
  ) {}

  @Get('today')
  @RequirePermission('org:ai:run')
  async today(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('endMonth') endMonth?: string,
  ) {
    return this.briefing.today(orgId, {
      fiscalYear: fiscalYear ? Number(fiscalYear) : undefined,
      endMonth: endMonth ? Number(endMonth) : undefined,
    });
  }

  @Get('history')
  @RequirePermission('org:briefing:read')
  async history(
    @Param('orgId') orgId: string,
    @Query('limit') limit?: string,
    @Query('days') days?: string,
  ) {
    return this.briefing.history(orgId, {
      limit: limit ? Number(limit) : undefined,
      days: days ? Number(days) : undefined,
    });
  }

  @Get('push-config')
  @RequirePermission('org:briefing:read')
  async getPushConfig(@Param('orgId') orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        briefPushEnabled: true,
        briefPushHourJst: true,
        briefSlackWebhookUrl: true,
      },
    });
    return {
      enabled: org?.briefPushEnabled ?? false,
      hourJst: org?.briefPushHourJst ?? 8,
      webhookConfigured: !!org?.briefSlackWebhookUrl,
    };
  }

  @Patch('push-config')
  @RequirePermission('org:briefing:manage')
  async updatePushConfig(
    @Param('orgId') orgId: string,
    @Body() dto: UpdatePushConfigDto,
  ) {
    const data: {
      briefPushEnabled?: boolean;
      briefPushHourJst?: number;
      briefSlackWebhookUrl?: string | null;
    } = {};
    if (dto.enabled !== undefined) data.briefPushEnabled = dto.enabled;
    if (dto.hourJst !== undefined) data.briefPushHourJst = dto.hourJst;
    if (dto.webhookUrl !== undefined) {
      data.briefSlackWebhookUrl = dto.webhookUrl || null;
    }
    await this.prisma.organization.update({ where: { id: orgId }, data });
    return this.getPushConfig(orgId);
  }

  @Post('push-test')
  @RequirePermission('org:briefing:manage')
  async pushTest(@Param('orgId') orgId: string) {
    return this.scheduler.dispatchNow(orgId);
  }
}
