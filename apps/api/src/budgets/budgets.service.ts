import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrgAccessService } from '../auth/org-access.service';
import { UserLike } from '../auth/staff.helpers';
import { CreateBudgetVersionDto } from './dto/create-budget-version.dto';
import { UpdateBudgetEntriesDto } from './dto/update-budget-entries.dto';

/**
 * 予算バージョン / エントリ管理。
 *
 * セキュリティ: route param が orgId を持たないため（fyId / bvId 直指定）、
 * 各メソッドの先頭で親 org を引いて OrgAccessService.assertOrgAccess を呼ぶ。
 *
 * IDOR 対策:
 * - getBudgetVersions / createBudgetVersion: fyId → orgId
 * - getBudgetEntries / updateBudgetEntries: bvId → fy.orgId
 * - updateBudgetEntries の entry.id は同じ bvId に属することを where 句で強制
 */
@Injectable()
export class BudgetsService {
  constructor(
    private prisma: PrismaService,
    private orgAccess: OrgAccessService,
  ) {}

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

  /** fyId から親 org を引いて access 検証。fy 自体も返す */
  private async assertFyAccess(user: UserLike, fyId: string) {
    const fy = await this.prisma.fiscalYear.findUnique({
      where: { id: fyId },
      select: { id: true, orgId: true, year: true },
    });
    if (!fy) {
      throw new NotFoundException(`Fiscal year ${fyId} not found`);
    }
    await this.orgAccess.assertOrgAccess(user, fy.orgId);
    return fy;
  }

  /** bvId から親 fy / org を引いて access 検証。bv も返す */
  private async assertBvAccess(user: UserLike, bvId: string) {
    const bv = await this.prisma.budgetVersion.findUnique({
      where: { id: bvId },
      select: {
        id: true,
        fiscalYearId: true,
        fiscalYear: { select: { orgId: true } },
      },
    });
    if (!bv) {
      throw new NotFoundException(`Budget version ${bvId} not found`);
    }
    await this.orgAccess.assertOrgAccess(user, bv.fiscalYear.orgId);
    return bv;
  }

  async getBudgetVersions(user: UserLike, fiscalYearId: string) {
    await this.assertFyAccess(user, fiscalYearId);

    return this.prisma.budgetVersion.findMany({
      where: { fiscalYearId },
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async createBudgetVersion(
    user: UserLike,
    fiscalYearId: string,
    dto: CreateBudgetVersionDto,
  ) {
    await this.assertFyAccess(user, fiscalYearId);

    return this.prisma.budgetVersion.create({
      data: {
        fiscalYearId,
        name: dto.name,
        scenarioType: dto.scenarioType || 'BASE',
        createdBy: user.id,
      },
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async getBudgetEntries(user: UserLike, budgetVersionId: string) {
    await this.assertBvAccess(user, budgetVersionId);

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
    user: UserLike,
    budgetVersionId: string,
    dto: UpdateBudgetEntriesDto,
  ) {
    await this.assertBvAccess(user, budgetVersionId);

    // 更新対象 entry が指定 bvId に属することを保証するため、
    // updateMany({ where: { id, budgetVersionId } }) で count を取って 0 ならエラー
    const results = await this.prisma.$transaction(
      dto.entries.map((entry) => {
        if (entry.id) {
          return this.prisma.budgetEntry.updateMany({
            where: { id: entry.id, budgetVersionId },
            data: { amount: entry.amount },
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

    // updateMany が count: 0 を返した = 別 bvId の entry id を混ぜた攻撃を検知
    for (const r of results) {
      if (
        typeof r === 'object' &&
        r !== null &&
        'count' in r &&
        (r as { count: number }).count === 0
      ) {
        throw new ForbiddenException(
          '指定された entry はこの budget version に属していません',
        );
      }
    }
    return results;
  }
}
