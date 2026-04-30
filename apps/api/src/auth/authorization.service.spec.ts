import { ForbiddenException } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';

describe('AuthorizationService', () => {
  let prisma: any;
  let service: AuthorizationService;

  beforeEach(() => {
    prisma = {
      organization: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      tenant: {
        findUnique: jest.fn(),
      },
      tenantMembership: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      organizationMembership: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };
    service = new AuthorizationService(prisma);
  });

  it('allows firm_owner to manage organizations inside their tenant', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      tenantId: 'tenant-1',
    });
    prisma.tenantMembership.findUnique.mockResolvedValue({
      role: 'firm_owner',
      status: 'active',
    });

    await expect(
      service.assertOrgPermission(
        { id: 'user-1', role: 'owner', orgId: null },
        'org-1',
        'org:organizations:delete',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });
  });

  it('does not let platform_owner read tenant business data without tenant or org membership', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      tenantId: 'tenant-1',
    });
    prisma.tenantMembership.findUnique.mockResolvedValue(null);
    prisma.organizationMembership.findUnique.mockResolvedValue(null);

    await expect(
      service.assertOrgPermission(
        { id: 'platform-1', role: 'owner', orgId: null },
        'org-1',
        'org:reports:read',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows client_admin to read but not update their organization', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      tenantId: 'tenant-1',
    });
    prisma.tenantMembership.findUnique.mockResolvedValue(null);
    prisma.organizationMembership.findUnique.mockResolvedValue({
      role: 'admin',
      side: 'client',
    });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'admin', orgId: 'org-1' },
        'org-1',
        'org:organizations:read',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'admin', orgId: 'org-1' },
        'org-1',
        'org:organizations:update',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows client users to read masters but not update them', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      tenantId: 'tenant-1',
    });
    prisma.tenantMembership.findUnique.mockResolvedValue(null);
    prisma.organizationMembership.findUnique.mockResolvedValue({
      role: 'viewer',
      side: 'client',
    });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:masters:read',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:masters:update',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows assigned advisor-side memberships to update masters and manage client users', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      tenantId: 'tenant-1',
    });
    prisma.tenantMembership.findUnique.mockResolvedValue({
      role: 'firm_advisor',
      status: 'active',
    });
    prisma.organizationMembership.findUnique.mockResolvedValue({
      role: 'advisor',
      side: 'advisor',
    });

    await expect(
      service.assertOrgPermission(
        { id: 'advisor-1', role: 'advisor', orgId: null },
        'org-1',
        'org:masters:update',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'advisor-1', role: 'advisor', orgId: null },
        'org-1',
        'org:users:manage',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });
  });

  it('allows assigned advisor-side memberships to manage integrations', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      tenantId: 'tenant-1',
    });
    prisma.tenantMembership.findUnique.mockResolvedValue({
      role: 'firm_advisor',
      status: 'active',
    });
    prisma.organizationMembership.findUnique.mockResolvedValue({
      role: 'advisor',
      side: 'advisor',
    });

    await expect(
      service.assertOrgPermission(
        { id: 'advisor-1', role: 'advisor', orgId: null },
        'org-1',
        'org:integrations:manage',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'advisor-1', role: 'advisor', orgId: null },
        'org-1',
        'org:integrations:sync',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });
  });

  it('allows client users to read integrations but not manage them', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      tenantId: 'tenant-1',
    });
    prisma.tenantMembership.findUnique.mockResolvedValue(null);
    prisma.organizationMembership.findUnique.mockResolvedValue({
      role: 'viewer',
      side: 'client',
    });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:integrations:read',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:integrations:manage',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows clients to read sync status but not run sync or read agent runs', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      tenantId: 'tenant-1',
    });
    prisma.tenantMembership.findUnique.mockResolvedValue(null);
    prisma.organizationMembership.findUnique.mockResolvedValue({
      role: 'viewer',
      side: 'client',
    });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:sync:read',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:sync:run',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:agent_runs:read',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows assigned advisor-side memberships to run sync and read agent runs', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      tenantId: 'tenant-1',
    });
    prisma.tenantMembership.findUnique.mockResolvedValue({
      role: 'firm_advisor',
      status: 'active',
    });
    prisma.organizationMembership.findUnique.mockResolvedValue({
      role: 'advisor',
      side: 'advisor',
    });

    await expect(
      service.assertOrgPermission(
        { id: 'advisor-1', role: 'advisor', orgId: null },
        'org-1',
        'org:sync:run',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'advisor-1', role: 'advisor', orgId: null },
        'org-1',
        'org:agent_runs:read',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });
  });

  it('allows clients to read business data but not mutate it', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      tenantId: 'tenant-1',
    });
    prisma.tenantMembership.findUnique.mockResolvedValue(null);
    prisma.organizationMembership.findUnique.mockResolvedValue({
      role: 'viewer',
      side: 'client',
    });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:budgets:read',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:actuals:read',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:cashflow:read',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:reports:read',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:comments:read',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:budgets:update',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:actuals:import',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:cashflow:manage',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:comments:manage',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows assigned advisor-side memberships to mutate business data', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      tenantId: 'tenant-1',
    });
    prisma.tenantMembership.findUnique.mockResolvedValue({
      role: 'firm_advisor',
      status: 'active',
    });
    prisma.organizationMembership.findUnique.mockResolvedValue({
      role: 'advisor',
      side: 'advisor',
    });

    await expect(
      service.assertOrgPermission(
        { id: 'advisor-1', role: 'advisor', orgId: null },
        'org-1',
        'org:budgets:update',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'advisor-1', role: 'advisor', orgId: null },
        'org-1',
        'org:actuals:import',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'advisor-1', role: 'advisor', orgId: null },
        'org-1',
        'org:cashflow:manage',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'advisor-1', role: 'advisor', orgId: null },
        'org-1',
        'org:comments:manage',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });
  });

  it('allows firm_viewer tenant-wide read access to business data only', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      tenantId: 'tenant-1',
    });
    prisma.tenantMembership.findUnique.mockResolvedValue({
      role: 'firm_viewer',
      status: 'active',
    });
    prisma.organizationMembership.findUnique.mockResolvedValue(null);

    await expect(
      service.assertOrgPermission(
        { id: 'viewer-1', role: 'viewer', orgId: null },
        'org-1',
        'org:reports:read',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'viewer-1', role: 'viewer', orgId: null },
        'org-1',
        'org:comments:manage',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows clients to read workflow data but not manage it', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      tenantId: 'tenant-1',
    });
    prisma.tenantMembership.findUnique.mockResolvedValue(null);
    prisma.organizationMembership.findUnique.mockResolvedValue({
      role: 'viewer',
      side: 'client',
    });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:actions:read',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:monthly_review:read',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:actions:manage',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:monthly_review:manage',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows assigned advisor-side memberships to manage workflow data', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      tenantId: 'tenant-1',
    });
    prisma.tenantMembership.findUnique.mockResolvedValue({
      role: 'firm_advisor',
      status: 'active',
    });
    prisma.organizationMembership.findUnique.mockResolvedValue({
      role: 'advisor',
      side: 'advisor',
    });

    await expect(
      service.assertOrgPermission(
        { id: 'advisor-1', role: 'advisor', orgId: null },
        'org-1',
        'org:actions:manage',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'advisor-1', role: 'advisor', orgId: null },
        'org-1',
        'org:business_events:manage',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'advisor-1', role: 'advisor', orgId: null },
        'org-1',
        'org:calendar:manage',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'advisor-1', role: 'advisor', orgId: null },
        'org-1',
        'org:monthly_close:manage',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'advisor-1', role: 'advisor', orgId: null },
        'org-1',
        'org:monthly_review:manage',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'advisor-1', role: 'advisor', orgId: null },
        'org-1',
        'org:cashflow_certainty:manage',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });
  });

  it('allows clients to read auxiliary data but not trigger AI or onboarding mutations', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      tenantId: 'tenant-1',
    });
    prisma.tenantMembership.findUnique.mockResolvedValue(null);
    prisma.organizationMembership.findUnique.mockResolvedValue({
      role: 'viewer',
      side: 'client',
    });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:insights:read',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:notifications:read',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:mf:read',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:simulation:read',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:ai:run',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.assertOrgPermission(
        { id: 'client-1', role: 'viewer', orgId: 'org-1' },
        'org-1',
        'org:onboarding:manage',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows assigned advisor-side memberships to trigger AI and onboarding flows', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      tenantId: 'tenant-1',
    });
    prisma.tenantMembership.findUnique.mockResolvedValue({
      role: 'firm_advisor',
      status: 'active',
    });
    prisma.organizationMembership.findUnique.mockResolvedValue({
      role: 'advisor',
      side: 'advisor',
    });

    await expect(
      service.assertOrgPermission(
        { id: 'advisor-1', role: 'advisor', orgId: null },
        'org-1',
        'org:ai:run',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'advisor-1', role: 'advisor', orgId: null },
        'org-1',
        'org:briefing:manage',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });

    await expect(
      service.assertOrgPermission(
        { id: 'advisor-1', role: 'advisor', orgId: null },
        'org-1',
        'org:onboarding:manage',
      ),
    ).resolves.toEqual({ id: 'org-1', tenantId: 'tenant-1' });
  });

  it('rejects firm_advisor updates for unassigned organizations', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-2',
      tenantId: 'tenant-1',
    });
    prisma.tenantMembership.findUnique.mockResolvedValue({
      role: 'firm_advisor',
      status: 'active',
    });
    prisma.organizationMembership.findUnique.mockResolvedValue(null);

    await expect(
      service.assertOrgPermission(
        { id: 'advisor-1', role: 'advisor', orgId: null },
        'org-2',
        'org:organizations:update',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows firm_advisor to create a new organization in their tenant', async () => {
    prisma.tenantMembership.findFirst.mockResolvedValue({
      tenantId: 'tenant-1',
    });
    prisma.tenantMembership.findUnique.mockResolvedValue({
      role: 'firm_advisor',
      status: 'active',
    });

    await expect(
      service.assertTenantPermission(
        { id: 'advisor-1', role: 'advisor', orgId: null },
        'tenant:organizations:create',
      ),
    ).resolves.toEqual({ tenantId: 'tenant-1' });
  });

  it('returns tenant-wide organizations plus explicitly assigned organizations', async () => {
    prisma.tenantMembership.findMany.mockResolvedValue([
      { tenantId: 'tenant-1', role: 'firm_viewer' },
    ]);
    prisma.organization.findMany.mockResolvedValue([
      { id: 'org-1', name: 'A社' },
    ]);
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        role: 'advisor',
        side: 'advisor',
        organization: { id: 'org-2', name: 'B社' },
      },
    ]);

    await expect(
      service.findAccessibleOrganizations({
        id: 'user-1',
        role: 'advisor',
        orgId: null,
      }),
    ).resolves.toEqual([
      { id: 'org-1', name: 'A社' },
      { id: 'org-2', name: 'B社' },
    ]);
  });
});
