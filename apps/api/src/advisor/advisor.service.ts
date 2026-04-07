import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

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

  private assertAdvisor(role: string) {
    if (role !== 'ADVISOR') {
      throw new ForbiddenException('ADVISOR role required');
    }
  }

  async listOrganizations(
    userId: string,
    role: string,
    params: {
      page: number;
      limit: number;
      search?: string;
      industry?: string;
      sortBy?: string;
      order?: string;
    },
  ): Promise<PaginatedOrgs> {
    this.assertAdvisor(role);

    const { page, limit, search, industry, sortBy, order } = params;
    const skip = (page - 1) * limit;

    // Build WHERE filter for organizations through AdvisorAssignment
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

    // Determine sort
    const allowedSortFields: Record<string, string> = {
      name: 'name',
      code: 'code',
      updatedAt: 'updatedAt',
      industry: 'industry',
      planType: 'planType',
    };
    const sortField = allowedSortFields[sortBy || 'name'] || 'name';
    const sortOrder = order === 'desc' ? 'desc' : 'asc';

    // Query assignments with nested org filter
    const assignmentWhere: Prisma.AdvisorAssignmentWhereInput = {
      userId,
      organization: orgWhere,
    };

    const [assignments, total] = await Promise.all([
      this.prisma.advisorAssignment.findMany({
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
      this.prisma.advisorAssignment.count({ where: assignmentWhere }),
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

  async getSummary(userId: string, role: string): Promise<AdvisorSummary> {
    this.assertAdvisor(role);

    const totalOrgs = await this.prisma.advisorAssignment.count({
      where: { userId },
    });

    // Active = organizations with AuditLog activity in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const orgIds = (
      await this.prisma.advisorAssignment.findMany({
        where: { userId },
        select: { orgId: true },
      })
    ).map((a) => a.orgId);

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

  async getRecentOrgs(userId: string, role: string): Promise<OrgListItem[]> {
    this.assertAdvisor(role);

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

      // Verify these are assigned to the advisor
      const assignments = await this.prisma.advisorAssignment.findMany({
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

    // Fallback: most recently assigned
    const assignments = await this.prisma.advisorAssignment.findMany({
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

    return assignments.map((a) => ({
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
