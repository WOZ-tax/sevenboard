import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type CertaintyLevel = 'CONFIRMED' | 'PLANNED' | 'ESTIMATED';
export type CertaintyRules = Record<string, CertaintyLevel>;

const ALLOWED: CertaintyLevel[] = ['CONFIRMED', 'PLANNED', 'ESTIMATED'];

function parseRules(raw: unknown): CertaintyRules {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: CertaintyRules = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string') continue;
    const upper = value.toUpperCase() as CertaintyLevel;
    if (!ALLOWED.includes(upper)) continue;
    result[key] = upper;
  }
  return result;
}

@Injectable()
export class CashflowCertaintyService {
  constructor(private prisma: PrismaService) {}

  async get(orgId: string): Promise<CertaintyRules> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { cashflowCertainty: true },
    });
    return parseRules(org?.cashflowCertainty);
  }

  async replace(orgId: string, rules: CertaintyRules): Promise<CertaintyRules> {
    await this.prisma.organization.update({
      where: { id: orgId },
      data: { cashflowCertainty: rules },
    });
    return rules;
  }
}
