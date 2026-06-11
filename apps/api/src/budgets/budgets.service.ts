import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../auth/authorization.service';
import { Permission } from '../auth/permissions';
import { UserLike } from '../auth/staff.helpers';
import { CreateBudgetVersionDto } from './dto/create-budget-version.dto';
import { UpdateBudgetEntriesDto } from './dto/update-budget-entries.dto';

/**
 * "2026-04-01" / "2026-04-15" 等を月初 (UTC) の Date に正規化する。
 * new Date(str) のタイムゾーン依存・日付ずれで月キーが分裂するのを防ぐ。
 */
function normalizeMonth(month: string): Date {
  const d = new Date(month);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

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
    private authorization: AuthorizationService,
  ) {}

  async getFiscalYears(orgId: string) {
    const { tenantId } = await this.prisma.orgScope(orgId);
    return this.prisma.fiscalYear.findMany({
      where: { tenantId, orgId },
      orderBy: { year: 'desc' },
      include: {
        budgetVersions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  /** fyId から親 org を引いて access 検証。fy 自体も返す */
  private async assertFyAccess(
    user: UserLike,
    fyId: string,
    permission: Permission,
  ) {
    const fy = await this.prisma.fiscalYear.findUnique({
      where: { id: fyId },
      select: { id: true, tenantId: true, orgId: true, year: true },
    });
    if (!fy) {
      throw new NotFoundException(`Fiscal year ${fyId} not found`);
    }
    const orgContext = await this.authorization.assertOrgPermission(
      user,
      fy.orgId,
      permission,
    );
    if (orgContext.tenantId !== fy.tenantId) {
      throw new ForbiddenException('Fiscal year tenant mismatch');
    }
    return fy;
  }

  /** bvId から親 fy / org を引いて access 検証。bv も返す */
  private async assertBvAccess(
    user: UserLike,
    bvId: string,
    permission: Permission,
  ) {
    const bv = await this.prisma.budgetVersion.findUnique({
      where: { id: bvId },
      select: {
        id: true,
        fiscalYearId: true,
        fiscalYear: { select: { tenantId: true, orgId: true } },
      },
    });
    if (!bv) {
      throw new NotFoundException(`Budget version ${bvId} not found`);
    }
    const orgContext = await this.authorization.assertOrgPermission(
      user,
      bv.fiscalYear.orgId,
      permission,
    );
    if (orgContext.tenantId !== bv.fiscalYear.tenantId) {
      throw new ForbiddenException('Budget version tenant mismatch');
    }
    return bv;
  }

  async getBudgetVersions(user: UserLike, fiscalYearId: string) {
    await this.assertFyAccess(user, fiscalYearId, 'org:budgets:read');

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
    await this.assertFyAccess(user, fiscalYearId, 'org:budgets:update');

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
    await this.assertBvAccess(user, budgetVersionId, 'org:budgets:read');

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
    const bv = await this.assertBvAccess(
      user,
      budgetVersionId,
      'org:budgets:update',
    );
    const { tenantId, orgId } = bv.fiscalYear;

    // create 経路で参照する accountId / departmentId が同一 tenant/org のマスタに
    // 属することを事前検証（IDOR で他社マスタを参照・読取されるのを防ぐ）。
    const createEntries = dto.entries.filter((e) => !e.id);
    const accountIds = [
      ...new Set(createEntries.map((e) => e.accountId).filter(Boolean)),
    ];
    const departmentIds = [
      ...new Set(
        createEntries
          .map((e) => e.departmentId)
          .filter((d): d is string => !!d),
      ),
    ];
    if (accountIds.length > 0) {
      const found = await this.prisma.accountMaster.findMany({
        where: { tenantId, orgId, id: { in: accountIds } },
        select: { id: true },
      });
      if (found.length !== accountIds.length) {
        throw new ForbiddenException(
          '指定された account はこの組織に属していません',
        );
      }
    }
    if (departmentIds.length > 0) {
      const found = await this.prisma.department.findMany({
        where: { tenantId, orgId, id: { in: departmentIds } },
        select: { id: true },
      });
      if (found.length !== departmentIds.length) {
        throw new ForbiddenException(
          '指定された department はこの組織に属していません',
        );
      }
    }

    // 部分書込み防止: interactive transaction 内で count===0 を検知したら throw し、
    // トランザクション全体をロールバックする（配列 $transaction はコミット後に
    // throw しても巻き戻せないため interactive 版へ移行）。
    return this.prisma.$transaction(async (tx) => {
      const results: Array<{ count: number } | { id: string }> = [];
      for (const entry of dto.entries) {
        if (entry.id) {
          // 更新対象 entry が指定 bvId に属することを where 句で強制。
          const r = await tx.budgetEntry.updateMany({
            where: { id: entry.id, budgetVersionId },
            data: { amount: entry.amount },
          });
          if (r.count === 0) {
            // 別 bvId の entry id を混ぜた攻撃 or 存在しない id。
            throw new ForbiddenException(
              '指定された entry はこの budget version に属していません',
            );
          }
          results.push(r);
        } else {
          const created = await tx.budgetEntry.create({
            data: {
              budgetVersionId,
              accountId: entry.accountId,
              departmentId: entry.departmentId || null,
              // 月初(UTC)に正規化して "2026-04-15" 等でも月キーがぶれないようにする。
              month: normalizeMonth(entry.month),
              amount: entry.amount,
            },
          });
          results.push(created);
        }
      }
      return results;
    });
  }
}
