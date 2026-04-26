import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  isInternalAdvisor,
  isInternalOwner,
  isInternalStaff,
  UserLike,
} from '../auth/staff.helpers';

export interface OrgListItem {
  id: string;
  name: string;
  code: string | null;
  industry: string | null;
  fiscalMonthEnd: number;
  planType: string;
  employeeCount: number | null;
  updatedAt: string;
}

export interface PaginatedOrgs {
  data: OrgListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdvisorSummary {
  totalOrgs: number;
  activeOrgs: number;
  alertCount: number;
  pendingComments: number;
}

@Injectable()
export class AdvisorService {
  constructor(private prisma: PrismaService) {}

  /**
   * 内部 advisor 以上を要求（owner/advisor で orgId=NULL）。
   * controller 側 InternalStaffGuard と二重防御で、tenant owner / advisor が漏れないようにする。
   */
  private assertInternalStaff(user: UserLike) {
    if (!isInternalStaff(user)) {
      throw new ForbiddenException('事務所スタッフのみアクセス可能です');
    }
  }

  async listOrganizations(
    user: UserLike,
    params: {
      page: number;
      limit: number;
      search?: string;
      industry?: string;
      sortBy?: string;
      order?: string;
    },
  ): Promise<PaginatedOrgs> {
    this.assertInternalStaff(user);
    const userId = user.id;

    const { page, limit, search, industry, sortBy, order } = params;
    const skip = (page - 1) * limit;

    const orgWhere: Prisma.OrganizationWhereInput = {};
    if (search) {
      orgWhere.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (industry) {
      orgWhere.industry = industry;
    }

    const allowedSortFields: Record<string, string> = {
      name: 'name',
      code: 'code',
      updatedAt: 'updatedAt',
      industry: 'industry',
      planType: 'planType',
    };
    const sortField = allowedSortFields[sortBy || 'name'] || 'name';
    const sortOrder = order === 'desc' ? 'desc' : 'asc';

    // 内部 owner: 全 Organization、内部 advisor: 自分の OrganizationMembership 経由
    if (isInternalOwner(user)) {
      const [orgs, total] = await Promise.all([
        this.prisma.organization.findMany({
          where: orgWhere,
          select: {
            id: true,
            name: true,
            code: true,
            industry: true,
            fiscalMonthEnd: true,
            planType: true,
            employeeCount: true,
            updatedAt: true,
          },
          orderBy: { [sortField]: sortOrder },
          skip,
          take: limit,
        }),
        this.prisma.organization.count({ where: orgWhere }),
      ]);
      const data: OrgListItem[] = orgs.map((o) => ({
        id: o.id,
        name: o.name,
        code: o.code,
        industry: o.industry,
        fiscalMonthEnd: o.fiscalMonthEnd,
        planType: o.planType,
        employeeCount: o.employeeCount,
        updatedAt: o.updatedAt.toISOString(),
      }));
      return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    // ADVISOR
    const assignmentWhere: Prisma.OrganizationMembershipWhereInput = {
      userId,
      organization: orgWhere,
    };

    const [assignments, total] = await Promise.all([
      this.prisma.organizationMembership.findMany({
        where: assignmentWhere,
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              code: true,
              industry: true,
              fiscalMonthEnd: true,
              planType: true,
              employeeCount: true,
              updatedAt: true,
            },
          },
        },
        orderBy: {
          organization: { [sortField]: sortOrder },
        },
        skip,
        take: limit,
      }),
      this.prisma.organizationMembership.count({ where: assignmentWhere }),
    ]);

    const data: OrgListItem[] = assignments.map((a) => ({
      id: a.organization.id,
      name: a.organization.name,
      code: a.organization.code,
      industry: a.organization.industry,
      fiscalMonthEnd: a.organization.fiscalMonthEnd,
      planType: a.organization.planType,
      employeeCount: a.organization.employeeCount,
      updatedAt: a.organization.updatedAt.toISOString(),
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getSummary(user: UserLike): Promise<AdvisorSummary> {
    this.assertInternalStaff(user);
    const userId = user.id;

    // 内部 owner は全 org を集計対象に、内部 advisor は担当先のみ
    const orgIds = isInternalOwner(user)
      ? (
          await this.prisma.organization.findMany({ select: { id: true } })
        ).map((o) => o.id)
      : (
          await this.prisma.organizationMembership.findMany({
            where: { userId },
            select: { orgId: true },
          })
        ).map((a) => a.orgId);
    const totalOrgs = orgIds.length;

    // Active = organizations with AuditLog activity in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let activeOrgs = 0;
    let alertCount = 0;
    let pendingComments = 0;

    if (orgIds.length > 0) {
      // Active orgs: had an audit log entry in last 30 days
      const activeOrgResults = await this.prisma.auditLog.groupBy({
        by: ['orgId'],
        where: {
          orgId: { in: orgIds },
          createdAt: { gte: thirtyDaysAgo },
        },
      });
      activeOrgs = activeOrgResults.length;

      // Alert count: RunwaySnapshots with WARNING or CRITICAL
      alertCount = await this.prisma.runwaySnapshot.count({
        where: {
          orgId: { in: orgIds },
          alertLevel: { in: ['WARNING', 'CRITICAL'] },
        },
      });

      // Pending comments
      pendingComments = await this.prisma.aiComment.count({
        where: {
          status: 'PENDING',
          report: {
            orgId: { in: orgIds },
          },
        },
      });
    }

    return {
      totalOrgs,
      activeOrgs,
      alertCount,
      pendingComments,
    };
  }

  async getRecentOrgs(user: UserLike): Promise<OrgListItem[]> {
    this.assertInternalStaff(user);
    const userId = user.id;

    // Get org IDs from recent audit logs (where user accessed)
    const recentLogs = await this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      distinct: ['orgId'],
      take: 10,
      select: { orgId: true },
    });

    if (recentLogs.length > 0) {
      const orgIds = recentLogs.map((l) => l.orgId);

      // 内部 owner は全 org 許可、内部 advisor は membership で絞る
      const assignments = isInternalOwner(user)
        ? await this.prisma.organization
            .findMany({
              where: { id: { in: orgIds } },
              select: {
                id: true,
                name: true,
                code: true,
                industry: true,
                fiscalMonthEnd: true,
                planType: true,
                employeeCount: true,
                updatedAt: true,
              },
            })
            .then((orgs) => orgs.map((o) => ({ orgId: o.id, organization: o })))
        : await this.prisma.organizationMembership.findMany({
        where: {
          userId,
          orgId: { in: orgIds },
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              code: true,
              industry: true,
              fiscalMonthEnd: true,
              planType: true,
              employeeCount: true,
              updatedAt: true,
            },
          },
        },
      });

      // Maintain the order from audit logs
      const orgMap = new Map(assignments.map((a) => [a.orgId, a.organization]));
      return orgIds
        .filter((id) => orgMap.has(id))
        .map((id) => {
          const org = orgMap.get(id)!;
          return {
            id: org.id,
            name: org.name,
            code: org.code,
            industry: org.industry,
            fiscalMonthEnd: org.fiscalMonthEnd,
            planType: org.planType,
            employeeCount: org.employeeCount,
            updatedAt: org.updatedAt.toISOString(),
          };
        });
    }

    // Fallback: 内部 owner は最近更新された org トップ10、内部 advisor は最近アサインされた担当先トップ10
    if (isInternalOwner(user)) {
      const orgs = await this.prisma.organization.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          name: true,
          code: true,
          industry: true,
          fiscalMonthEnd: true,
          planType: true,
          employeeCount: true,
          updatedAt: true,
        },
      });
      return orgs.map((org) => ({
        id: org.id,
        name: org.name,
        code: org.code,
        industry: org.industry,
        fiscalMonthEnd: org.fiscalMonthEnd,
        planType: org.planType,
        employeeCount: org.employeeCount,
        updatedAt: org.updatedAt.toISOString(),
      }));
    }

    const recentAssignments = await this.prisma.organizationMembership.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            code: true,
            industry: true,
            fiscalMonthEnd: true,
            planType: true,
            employeeCount: true,
            updatedAt: true,
          },
        },
      },
    });

    return recentAssignments.map((a) => ({
      id: a.organization.id,
      name: a.organization.name,
      code: a.organization.code,
      industry: a.organization.industry,
      fiscalMonthEnd: a.organization.fiscalMonthEnd,
      planType: a.organization.planType,
      employeeCount: a.organization.employeeCount,
      updatedAt: a.organization.updatedAt.toISOString(),
    }));
  }
}
