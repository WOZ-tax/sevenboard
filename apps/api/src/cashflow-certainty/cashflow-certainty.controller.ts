import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsObject, ValidateNested } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import {
  CashflowCertaintyService,
  CertaintyLevel,
} from './cashflow-certainty.service';

const CERTAINTY_LEVELS: CertaintyLevel[] = ['CONFIRMED', 'PLANNED', 'ESTIMATED'];

class UpdateCertaintyDto {
  @IsObject()
  @ValidateNested()
  @Type(() => Object)
  rules!: Record<string, string>;
}

@Controller('organizations/:orgId/cashflow-certainty')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CashflowCertaintyController {
  constructor(private service: CashflowCertaintyService) {}

  @Get()
  @RequirePermission('org:cashflow_certainty:read')
  async get(@Param('orgId') orgId: string) {
    const rules = await this.service.get(orgId);
    return { rules };
  }

  @Put()
  @RequirePermission('org:cashflow_certainty:manage')
  async update(
    @Param('orgId') orgId: string,
    @Body() dto: UpdateCertaintyDto,
  ) {
    const sanitized: Record<string, CertaintyLevel> = {};
    for (const [category, level] of Object.entries(dto.rules)) {
      const trimmed = category.trim();
      if (!trimmed) continue;
      const upper = level.toUpperCase() as CertaintyLevel;
      if (!CERTAINTY_LEVELS.includes(upper)) continue;
      sanitized[trimmed] = upper;
    }
    const rules = await this.service.replace(orgId, sanitized);
    return { rules };
  }
}
