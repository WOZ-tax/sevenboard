import { BadRequestException } from '@nestjs/common';
import { InternalUsersService } from './internal-users.service';

describe('InternalUsersService', () => {
  let prisma: any;
  let service: InternalUsersService;

  beforeEach(() => {
    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
      },
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      tenantMembership: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      organizationMembership: {
        count: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(async (arg: any) => {
        if (Array.isArray(arg)) return Promise.all(arg);
        return arg(prisma);
      }),
    };
    service = new InternalUsersService(prisma);
  });

  it('invites an existing platform owner into a tenant without changing platform access', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-platform',
      email: 'hiroki@example.com',
      name: 'Hiroki',
      orgId: null,
    });
    prisma.tenantMembership.upsert.mockResolvedValue({
      userId: 'user-platform',
      tenantId: 'tenant-1',
      role: 'firm_owner',
      status: 'active',
      createdAt: new Date('2026-04-30T00:00:00.000Z'),
      updatedAt: new Date('2026-04-30T00:00:00.000Z'),
      user: {
        id: 'user-platform',
        email: 'hiroki@example.com',
        name: 'Hiroki',
        avatarUrl: null,
      },
    });

    await expect(
      service.create('tenant-1', {
        email: 'Hiroki@Example.com',
        role: 'firm_owner',
      }),
    ).resolves.toMatchObject({
      id: 'user-platform',
      email: 'hiroki@example.com',
      role: 'firm_owner',
      status: 'active',
    });

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.tenantMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_tenantId: { userId: 'user-platform', tenantId: 'tenant-1' },
        },
        update: { role: 'firm_owner', status: 'active' },
      }),
    );
  });

  it('requires name and initial password when creating a brand-new staff user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.create('tenant-1', {
        email: 'new@example.com',
        role: 'firm_advisor',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not allow removing the last active firm owner in a tenant', async () => {
    prisma.tenantMembership.findUnique.mockResolvedValue({
      role: 'firm_owner',
      status: 'active',
    });
    prisma.tenantMembership.count.mockResolvedValue(0);

    await expect(
      service.remove('actor-1', 'tenant-1', 'target-owner'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.organizationMembership.deleteMany).not.toHaveBeenCalled();
    expect(prisma.tenantMembership.update).not.toHaveBeenCalled();
  });

  it('revokes tenant membership and tenant-local advisor assignments without deleting the user', async () => {
    prisma.tenantMembership.findUnique.mockResolvedValue({
      role: 'firm_advisor',
      status: 'active',
    });
    prisma.organizationMembership.deleteMany.mockResolvedValue({ count: 2 });
    prisma.tenantMembership.update.mockResolvedValue({
      userId: 'advisor-1',
      tenantId: 'tenant-1',
      status: 'revoked',
    });

    await expect(
      service.remove('actor-1', 'tenant-1', 'advisor-1'),
    ).resolves.toEqual({ success: true });

    expect(prisma.organizationMembership.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', userId: 'advisor-1', side: 'advisor' },
    });
    expect(prisma.tenantMembership.update).toHaveBeenCalledWith({
      where: {
        userId_tenantId: { userId: 'advisor-1', tenantId: 'tenant-1' },
      },
      data: { status: 'revoked' },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
