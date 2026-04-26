import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { AgentRunKey } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AgentRunsService } from './agent-runs.service';

const VALID_KEYS: AgentRunKey[] = ['BRIEF', 'SENTINEL', 'DRAFTER', 'AUDITOR', 'COPILOT'];

function parsePositiveInt(v?: string): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

@Controller('organizations/:orgId/agent-runs')
@UseGuards(JwtAuthGuard, OrgAccessGuard, RolesGuard)
@Roles('owner', 'advisor')
export class AgentRunsController {
  constructor(private readonly agentRuns: AgentRunsService) {}

  @Get()
  async list(
    @Param('orgId') orgId: string,
    @Query('agentKey') agentKey?: string,
    @Query('limit') limit?: string,
    @Query('days') days?: string,
  ) {
    const key = agentKey && VALID_KEYS.includes(agentKey as AgentRunKey)
      ? (agentKey as AgentRunKey)
      : undefined;
    const items = await this.agentRuns.list(orgId, {
      agentKey: key,
      limit: parsePositiveInt(limit),
      days: parsePositiveInt(days),
    });
    return { items };
  }

  @Get(':id')
  async get(@Param('orgId') orgId: string, @Param('id') id: string) {
    const run = await this.agentRuns.get(orgId, id);
    if (!run) throw new NotFoundException();
    return run;
  }
}
