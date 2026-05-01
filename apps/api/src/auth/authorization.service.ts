import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserLike } from './staff.helpers';
import { Permission, roleHasPermission } from './permissions';

export interface AuthorizationUser extends UserLike {
  email?: string;
}

interface OrganizationContext {
  id: string;
  tenantId: string;
}

interface TenantPermissionResult {
  tenantId: string;
}

@Injectable()
export class AuthorizationService {
  constructor(private prisma: PrismaService) {}

  async assertTenantPermission(
    user: AuthorizationUser,
    permission: Permission,
    tenantId?: string,
  ): Promise<TenantPermissionResult> {
    const resolvedTenantId =
      tenantId ?? (await this.resolveCurrentTenantId(user));
    const membership = await this.prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId: resolvedTenantId } },
      select: { role: true, status: true },
    });

    if (
      membership?.status === 'active' &&
      roleHasPermission(membership.role, permission)
    ) {
      return { tenantId: resolvedTenantId };
    }

    throw new ForbiddenException('Permission denied');
  }

  async assertOrgPermission(
    user: AuthorizationUser,
    orgId: string,
    permission: Permission,
  ): Promise<OrganizationContext> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, tenantId: true },
    });
    if (!org) {
      throw new NotFoundException(`Organization ${orgId} not found`);
    }

    const tenantMembership = await this.prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId: org.tenantId } },
      select: { role: true, status: true },
    });
    if (
      tenantMembership?.status === 'active' &&
      roleHasPermission(tenantMembership.role, permission)
    ) {
      return org;
    }

    const orgMembership = await this.prisma.organizationMembership.findUnique({
      where: { userId_orgId: { userId: user.id, orgId } },
      select: { role: true, side: true },
    });
    if (orgMembership && this.orgMembershipAllows(orgMembership, permission)) {
      return org;
    }

    throw new ForbiddenException('Organization permission denied');
  }

  async findAccessibleOrganizations(user: AuthorizationUser) {
    const byId = new Map<string, any>();

    const tenantMemberships = await this.prisma.tenantMembership.findMany({
      where: { userId: user.id, status: 'active' },
      select: { tenantId: true, role: true },
    });

    for (const membership of tenantMemberships) {
      if (roleHasPermission(membership.role, 'org:organizations:read')) {
        const orgs = await this.prisma.organization.findMany({
          where: { tenantId: membership.tenantId },
          orderBy: { name: 'asc' },
        });
        for (const org of orgs) byId.set(org.id, org);
      }
    }

    const orgMemberships = await this.prisma.organizationMembership.findMany({
      where: { userId: user.id },
      include: { organization: true },
    });
    for (const membership of orgMemberships) {
      if (
        this.orgMembershipAllows(
          { role: membership.role, side: membership.side },
          'org:organizations:read',
        )
      ) {
        byId.set(membership.organization.id, membership.organization);
      }
    }

    return Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  private async resolveCurrentTenantId(user: AuthorizationUser): Promise<string> {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { userId: user.id, status: 'active' },
      select: { tenantId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (membership) return membership.tenantId;

    if (user.orgId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: user.orgId },
        select: { tenantId: true },
      });
      if (org) return org.tenantId;
    }

    throw new ForbiddenException('Tenant context is not available');
  }

  private orgMembershipAllows(
    membership: { role: string; side: string },
    permission: Permission,
  ): boolean {
    if (
      permission === 'org:organizations:read' ||
      permission === 'org:masters:read' ||
      permission === 'org:users:read' ||
      permission === 'org:integrations:read' ||
      permission === 'org:sync:read' ||
      permission === 'org:budgets:read' ||
      permission === 'org:actuals:read' ||
      permission === 'org:cashflow:read' ||
      permission === 'org:reports:read' ||
      permission === 'org:comments:read' ||
      permission === 'org:actions:read' ||
      permission === 'org:business_events:read' ||
      permission === 'org:calendar:read' ||
      permission === 'org:monthly_close:read' ||
      permission === 'org:monthly_review:read' ||
      permission === 'org:cashflow_certainty:read' ||
      permission === 'org:insights:read' ||
      permission === 'org:briefing:read' ||
      permission === 'org:notifications:read' ||
      permission === 'org:mf:read' ||
      permission === 'org:simulation:read' ||
      permission === 'org:onboarding:read' ||
      permission === 'org:risk_findings:read'
    ) {
      return true;
    }

    if (membership.side !== 'advisor') return false;

    if (permission === 'org:organizations:update') {
      return ['owner', 'advisor', 'admin', 'member'].includes(membership.role);
    }

    if (
      permission === 'org:masters:update' ||
      permission === 'org:users:manage' ||
      permission === 'org:integrations:manage' ||
      permission === 'org:integrations:sync' ||
      permission === 'org:sync:run' ||
      permission === 'org:agent_runs:read' ||
      permission === 'org:budgets:update' ||
      permission === 'org:actuals:import' ||
      permission === 'org:cashflow:manage' ||
      permission === 'org:comments:manage' ||
      permission === 'org:actions:manage' ||
      permission === 'org:business_events:manage' ||
      permission === 'org:calendar:manage' ||
      permission === 'org:monthly_close:manage' ||
      permission === 'org:monthly_review:manage' ||
      permission === 'org:cashflow_certainty:manage' ||
      permission === 'org:ai:run' ||
      permission === 'org:briefing:manage' ||
      permission === 'org:onboarding:manage' ||
      permission === 'org:risk_findings:manage' ||
      permission === 'org:risk_findings:scan'
    ) {
      return membership.role === 'owner' || membership.role === 'advisor';
    }

    if (permission === 'org:organizations:delete') {
      return membership.role === 'owner';
    }

    return false;
  }
}
