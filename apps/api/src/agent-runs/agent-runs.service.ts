import { Injectable, Logger } from '@nestjs/common';
import { Prisma, AgentRunKey, AgentRunMode, AgentRunStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface LogRunInput {
  orgId: string;
  agentKey: AgentRunKey;
  mode?: AgentRunMode | null;
  fiscalYear?: number | null;
  endMonth?: number | null;
  userId?: string | null;
  input?: unknown;
  output?: unknown;
  toolCalls?: unknown;
  status?: AgentRunStatus;
  errorMessage?: string | null;
  durationMs?: number | null;
}

export interface ListRunsOptions {
  agentKey?: AgentRunKey;
  limit?: number;
  days?: number;
}

@Injectable()
export class AgentRunsService {
  private readonly logger = new Logger(AgentRunsService.name);

  constructor(private prisma: PrismaService) {}

  async logRun(data: LogRunInput) {
    try {
      return await this.prisma.agentRun.create({
        data: {
          orgId: data.orgId,
          agentKey: data.agentKey,
          mode: data.mode ?? null,
          fiscalYear: data.fiscalYear ?? null,
          endMonth: data.endMonth ?? null,
          userId: data.userId ?? null,
          input: (data.input ?? {}) as Prisma.InputJsonValue,
          output: (data.output ?? {}) as Prisma.InputJsonValue,
          toolCalls: (data.toolCalls ?? []) as Prisma.InputJsonValue,
          status: data.status ?? 'SUCCESS',
          errorMessage: data.errorMessage ?? null,
          durationMs: data.durationMs ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `agent_runs insert failed (agentKey=${data.agentKey}): ${(err as Error).message}`,
      );
      return null;
    }
  }

  async list(orgId: string, options: ListRunsOptions = {}) {
    const limit = Math.min(options.limit ?? 50, 200);
    const days = options.days ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: Prisma.AgentRunWhereInput = {
      orgId,
      generatedAt: { gte: since },
    };
    if (options.agentKey) where.agentKey = options.agentKey;

    return this.prisma.agentRun.findMany({
      where,
      orderBy: { generatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        agentKey: true,
        mode: true,
        generatedAt: true,
        fiscalYear: true,
        endMonth: true,
        status: true,
        errorMessage: true,
        durationMs: true,
        toolCalls: true,
      },
    });
  }

  async get(orgId: string, id: string) {
    return this.prisma.agentRun.findFirst({
      where: { id, orgId },
    });
  }
}
