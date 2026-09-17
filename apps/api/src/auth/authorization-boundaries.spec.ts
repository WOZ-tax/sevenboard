import { ForbiddenException } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
import type { Permission } from './permissions';
import { AuthService } from './auth.service';
import {
  DEMO_ORG_ID,
  DEMO_TENANT_ID,
  DEMO_USER_ID,
  DEMO_RESTRICTED_PERMISSIONS,
} from '../demo/demo.constants';

describe('advisor assignment boundaries', () => {
  const permissions: Permission[] = [
    'org:risk_findings:read',
    'org:chosho:manage',
    'org:withholding_tax:read',
    'org:loans:manage',
    'org:locaben:manage',
    'org:feature_state:write',
  ];
  const user = { id: 'advisor', role: 'advisor', orgId: null };
  const org = { id: 'org-a', tenantId: 'tenant-a' };
  let prisma: any;
  let service: AuthorizationService;
  beforeEach(() => {
    prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue(org) },
      tenantMembership: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ role: 'firm_advisor', status: 'active' }),
      },
      organizationMembership: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    service = new AuthorizationService(prisma);
  });

  it.each(permissions)(
    'rejects %s for an unassigned company in the same firm',
    async (permission) => {
      await expect(
        service.assertOrgPermission(user, org.id, permission),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it.each(permissions)(
    'allows %s for an explicitly assigned company',
    async (permission) => {
      prisma.organizationMembership.findUnique.mockResolvedValue({
        role: 'advisor',
        side: 'advisor',
      });
      await expect(
        service.assertOrgPermission(user, org.id, permission),
      ).resolves.toEqual(org);
    },
  );

  it('does not revive a suspended staff membership through an old company assignment', async () => {
    prisma.tenantMembership.findUnique.mockResolvedValue({
      role: 'firm_advisor',
      status: 'suspended',
    });
    prisma.organizationMembership.findUnique.mockResolvedValue({
      role: 'advisor',
      side: 'advisor',
    });
    await expect(
      service.assertOrgPermission(user, org.id, 'org:reports:read'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an assigned user of a suspended firm', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      ...org,
      tenant: { status: 'suspended' },
    });
    prisma.organizationMembership.findUnique.mockResolvedValue({
      role: 'advisor',
      side: 'advisor',
    });
    await expect(
      service.assertOrgPermission(user, org.id, 'org:reports:read'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows shared demo business edits while denying another company and external administration', async () => {
    const demoUser = { ...user, id: DEMO_USER_ID };
    prisma.organization.findUnique.mockResolvedValue({
      id: DEMO_ORG_ID,
      tenantId: DEMO_TENANT_ID,
      tenant: { status: 'active' },
    });
    prisma.organizationMembership.findUnique.mockResolvedValue({
      role: 'advisor',
      side: 'advisor',
    });
    await expect(
      service.assertOrgPermission(demoUser, DEMO_ORG_ID, 'org:budgets:update'),
    ).resolves.toMatchObject({ id: DEMO_ORG_ID });
    await expect(
      service.assertOrgPermission(demoUser, org.id, 'org:reports:read'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    for (const permission of DEMO_RESTRICTED_PERMISSIONS) {
      if (permission.startsWith('org:'))
        await expect(
          service.assertOrgPermission(
            demoUser,
            DEMO_ORG_ID,
            permission as Permission,
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('hides old assignments for suspended staff from both organization lists', async () => {
    prisma.user = { findUnique: jest.fn().mockResolvedValue(user) };
    prisma.tenantMembership.findMany = jest.fn().mockResolvedValue([
      {
        tenantId: org.tenantId,
        role: 'firm_advisor',
        status: 'suspended',
        tenant: { organizations: [] },
      },
    ]);
    prisma.organizationMembership.findMany = jest.fn().mockResolvedValue([
      {
        role: 'advisor',
        side: 'advisor',
        organization: { ...org, name: 'A社' },
      },
    ]);
    await expect(service.findAccessibleOrganizations(user)).resolves.toEqual(
      [],
    );
    const auth = new AuthService(prisma, {} as any, service);
    await expect(auth.getUserMemberships(user.id, user.role)).resolves.toEqual(
      [],
    );
  });

  it('does not display a revoked assignment from legacy user.orgId', async () => {
    prisma.user = {
      findUnique: jest.fn().mockResolvedValue({ ...user, orgId: org.id }),
    };
    prisma.tenantMembership.findMany = jest.fn().mockResolvedValue([]);
    prisma.organizationMembership.findMany = jest.fn().mockResolvedValue([]);
    const auth = new AuthService(prisma, {} as any, service);
    await expect(auth.getUserMemberships(user.id, user.role)).resolves.toEqual(
      [],
    );
  });
});
