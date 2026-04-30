import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthorizationService } from '../auth/authorization.service';
import { UserLike } from '../auth/staff.helpers';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(
    private prisma: PrismaService,
    private authorization: AuthorizationService,
  ) {}

  private async getAccessibleOrgIds(user: UserLike): Promise<string[]> {
    const orgs = await this.authorization.findAccessibleOrganizations(user);
    const orgIds = orgs.map((org) => org.id);
    if (orgIds.length === 0) {
      throw new ForbiddenException('No accessible organizations');
    }
    return orgIds;
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
    const orgIds = await this.getAccessibleOrgIds(user);
    const { page, limit, search, industry, sortBy, order } = params;
    const skip = (page - 1) * limit;

    const orgWhere: Prisma.OrganizationWhereInput = {
      id: { in: orgIds },
    };
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

    const data: OrgListItem[] = orgs.map((org) => ({
      id: org.id,
      name: org.name,
      code: org.code,
      industry: org.industry,
      fiscalMonthEnd: org.fiscalMonthEnd,
      planType: org.planType,
      employeeCount: org.employeeCount,
      updatedAt: org.updatedAt.toISOString(),
    }));

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getSummary(user: UserLike): Promise<AdvisorSummary> {
    const orgIds = await this.getAccessibleOrgIds(user);
    const totalOrgs = orgIds.length;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activeOrgResults = await this.prisma.auditLog.groupBy({
      by: ['orgId'],
      where: {
        orgId: { in: orgIds },
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    const alertCount = await this.prisma.runwaySnapshot.count({
      where: {
        orgId: { in: orgIds },
        alertLevel: { in: ['WARNING', 'CRITICAL'] },
      },
    });

    const pendingComments = await this.prisma.aiComment.count({
      where: {
        status: 'PENDING',
        report: {
          orgId: { in: orgIds },
        },
      },
    });

    return {
      totalOrgs,
      activeOrgs: activeOrgResults.length,
      alertCount,
      pendingComments,
    };
  }

  async getRecentOrgs(user: UserLike): Promise<OrgListItem[]> {
    const orgIds = await this.getAccessibleOrgIds(user);

    const recentLogs = await this.prisma.auditLog.findMany({
      where: { userId: user.id, orgId: { in: orgIds } },
      orderBy: { createdAt: 'desc' },
      distinct: ['orgId'],
      take: 10,
      select: { orgId: true },
    });

    const recentOrgIds =
      recentLogs.length > 0 ? recentLogs.map((log) => log.orgId) : orgIds;

    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: recentOrgIds } },
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

    const orgMap = new Map(orgs.map((org) => [org.id, org]));
    return recentOrgIds
      .filter((id) => orgMap.has(id))
      .slice(0, 10)
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
}
