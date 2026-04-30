import {
  Controller,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { SimulationService } from './simulation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { LoanSimulationDto } from './dto/loan-simulation.dto';
import { LinkedStatementsDto } from './dto/linked-statements.dto';
import { WhatIfDto } from './dto/what-if.dto';

@Controller('organizations/:orgId/simulation')
@RequirePermission('org:simulation:read')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SimulationController {
  constructor(private simulationService: SimulationService) {}

  @Post('loan')
  async loanSimulation(
    @Param('orgId') orgId: string,
    @Body() dto: LoanSimulationDto,
  ) {
    return this.simulationService.loanSimulation(orgId, dto);
  }

  @Post('linked-statements')
  async linkedStatements(
    @Param('orgId') orgId: string,
    @Body() dto: LinkedStatementsDto,
  ) {
    return this.simulationService.linkedStatements(orgId, dto);
  }

  @Post('what-if')
  async whatIf(
    @Param('orgId') orgId: string,
    @Body() dto: WhatIfDto,
    @Query('fiscalYear') fy?: string,
  ) {
    let fiscalYear: number | undefined;
    if (fy) {
      fiscalYear = parseInt(fy, 10);
      if (isNaN(fiscalYear) || fiscalYear < 1900 || fiscalYear > 2100) {
        throw new BadRequestException('Invalid fiscal year');
      }
    }
    return this.simulationService.whatIf(orgId, dto, fiscalYear);
  }
}
