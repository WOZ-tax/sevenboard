import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBudgetVersionDto } from './dto/create-budget-version.dto';
import { UpdateBudgetEntriesDto } from './dto/update-budget-entries.dto';

@Injectable()
export class BudgetsService {
  constructor(private prisma: PrismaService) {}

  async getFiscalYears(orgId: string) {
    return this.prisma.fiscalYear.findMany({
      where: { orgId },
      orderBy: { year: 'desc' },
      include: {
        budgetVersions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async getBudgetVersions(fiscalYearId: string) {
    const fy = await this.prisma.fiscalYear.findUnique({
      where: { id: fiscalYearId },
    });
    if (!fy) {
      throw new NotFoundException(`Fiscal year ${fiscalYearId} not found`);
    }

    return this.prisma.budgetVersion.findMany({
      where: { fiscalYearId },
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async createBudgetVersion(
    fiscalYearId: string,
    dto: CreateBudgetVersionDto,
    userId: string,
  ) {
    const fy = await this.prisma.fiscalYear.findUnique({
      where: { id: fiscalYearId },
    });
    if (!fy) {
      throw new NotFoundException(`Fiscal year ${fiscalYearId} not found`);
    }

    return this.prisma.budgetVersion.create({
      data: {
        fiscalYearId,
        name: dto.name,
        scenarioType: dto.scenarioType || 'BASE',
        createdBy: userId,
      },
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async getBudgetEntries(budgetVersionId: string) {
    const bv = await this.prisma.budgetVersion.findUnique({
      where: { id: budgetVersionId },
    });
    if (!bv) {
      throw new NotFoundException(
        `Budget version ${budgetVersionId} not found`,
      );
    }

    return this.prisma.budgetEntry.findMany({
      where: { budgetVersionId },
      include: {
        account: { select: { id: true, code: true, name: true, category: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: [{ month: 'asc' }, { account: { displayOrder: 'asc' } }],
    });
  }

  async updateBudgetEntries(
    budgetVersionId: string,
    dto: UpdateBudgetEntriesDto,
  ) {
    const bv = await this.prisma.budgetVersion.findUnique({
      where: { id: budgetVersionId },
    });
    if (!bv) {
      throw new NotFoundException(
        `Budget version ${budgetVersionId} not found`,
      );
    }

    // Upsert each entry in a transaction
    const results = await this.prisma.$transaction(
      dto.entries.map((entry) => {
        if (entry.id) {
          return this.prisma.budgetEntry.update({
            where: { id: entry.id },
            data: {
              amount: entry.amount,
            },
          });
        }
        return this.prisma.budgetEntry.create({
          data: {
            budgetVersionId,
            accountId: entry.accountId,
            departmentId: entry.departmentId || null,
            month: new Date(entry.month),
            amount: entry.amount,
          },
        });
      }),
    );

    return results;
  }
}
