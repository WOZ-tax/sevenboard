import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { MonthlyReviewApprovalService } from './monthly-review-approval.service';

class SubmitDto {
  @IsInt()
  fiscalYear!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

class DecisionDto {
  @IsInt()
  fiscalYear!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

@Controller('organizations/:orgId/monthly-review-approvals')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class MonthlyReviewApprovalController {
  constructor(private service: MonthlyReviewApprovalService) {}

  @Get()
  @RequirePermission('org:monthly_review:read')
  async list(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear?: string,
  ) {
    const fy = parseFy(fiscalYear);
    if (!fy) throw new BadRequestException('fiscalYear is required');
    const records = await this.service.list(orgId, fy);
    return { records };
  }

  @Get('current')
  @RequirePermission('org:monthly_review:read')
  async current(
    @Param('orgId') orgId: string,
    @Query('fiscalYear') fiscalYear: string,
    @Query('month') month: string,
  ) {
    const fy = parseFy(fiscalYear);
    const m = parseMonth(month);
    if (!fy || !m) throw new BadRequestException('fiscalYear and month are required');
    const record = await this.service.get(orgId, fy, m);
    return { record };
  }

  @Post('submit')
  @RequirePermission('org:monthly_review:manage')
  async submit(@Param('orgId') orgId: string, @Body() dto: SubmitDto) {
    const record = await this.service.submit(
      orgId,
      dto.fiscalYear,
      dto.month,
      dto.comment,
    );
    return { record };
  }

  @Post('approve')
  @RequirePermission('org:monthly_review:manage')
  async approve(
    @Param('orgId') orgId: string,
    @Body() dto: DecisionDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('user not identified');
    const record = await this.service.approve(
      orgId,
      dto.fiscalYear,
      dto.month,
      userId,
      dto.comment,
    );
    return { record };
  }

  @Post('reject')
  @RequirePermission('org:monthly_review:manage')
  async reject(
    @Param('orgId') orgId: string,
    @Body() dto: DecisionDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('user not identified');
    const record = await this.service.reject(
      orgId,
      dto.fiscalYear,
      dto.month,
      userId,
      dto.comment,
    );
    return { record };
  }

  @Post('reset')
  @RequirePermission('org:monthly_review:manage')
  async reset(@Param('orgId') orgId: string, @Body() dto: DecisionDto) {
    const record = await this.service.reset(orgId, dto.fiscalYear, dto.month);
    return { record };
  }
}

function parseFy(value?: string): number | null {
  if (!value) return null;
  const n = parseInt(value, 10);
  if (!Number.isInteger(n) || n < 1900 || n > 2100) return null;
  return n;
}

function parseMonth(value?: string): number | null {
  if (!value) return null;
  const n = parseInt(value, 10);
  if (!Number.isInteger(n) || n < 1 || n > 12) return null;
  return n;
}
