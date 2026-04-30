import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInternalUserDto,
  TenantStaffRole,
} from './dto/create-internal-user.dto';
import { UpdateInternalUserDto } from './dto/update-internal-user.dto';

/**
 * Tenant-scoped accounting firm staff management.
 *
 * User.role is kept only for legacy JWT/UI compatibility. TenantMembership is
 * the source of truth for firm staff authorization.
 */
@Injectable()
export class InternalUsersService {
  constructor(private prisma: PrismaService) {}

  async list(tenantId: string) {
    await this.assertTenantExists(tenantId);

    const memberships = await this.prisma.tenantMembership.findMany({
      where: {
        tenantId,
        status: 'active',
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });

    return Promise.all(
      memberships.map(async (membership) => {
        const assignmentCount = await this.prisma.organizationMembership.count({
          where: {
            tenantId,
            userId: membership.userId,
            side: 'advisor',
          },
        });

        return {
          id: membership.user.id,
          email: membership.user.email,
          name: membership.user.name,
          role: membership.role,
          status: membership.status,
          avatarUrl: membership.user.avatarUrl,
          createdAt: membership.createdAt,
          updatedAt: membership.updatedAt,
          _count: { memberships: assignmentCount },
        };
      }),
    );
  }

  async create(tenantId: string, dto: CreateInternalUserDto) {
    await this.assertTenantExists(tenantId);

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, orgId: true },
    });

    if (!existing && !dto.name?.trim()) {
      throw new BadRequestException('新規ユーザーには名前が必要です');
    }
    if (!existing && !dto.password) {
      throw new BadRequestException('新規ユーザーには初期パスワードが必要です');
    }

    const hashed = dto.password ? await bcrypt.hash(dto.password, 12) : null;

    const result = await this.prisma.$transaction(async (tx) => {
      const user =
        existing ??
        (await tx.user.create({
          data: {
            email,
            name: dto.name!.trim(),
            password: hashed!,
            role: this.legacyUserRoleForTenantRole(dto.role),
            orgId: null,
          },
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
          },
        }));

      if (existing && dto.name?.trim() && existing.name !== dto.name.trim()) {
        await tx.user.update({
          where: { id: existing.id },
          data: { name: dto.name.trim() },
        });
      }

      const membership = await tx.tenantMembership.upsert({
        where: { userId_tenantId: { userId: user.id, tenantId } },
        create: {
          userId: user.id,
          tenantId,
          role: dto.role,
          status: 'active',
        },
        update: {
          role: dto.role,
          status: 'active',
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
      });

      return membership;
    });

    return {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.role,
      status: result.status,
      avatarUrl: result.user.avatarUrl,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      _count: { memberships: 0 },
    };
  }

  async update(tenantId: string, userId: string, dto: UpdateInternalUserDto) {
    const membership = await this.prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            orgId: true,
            avatarUrl: true,
          },
        },
      },
    });
    if (!membership || membership.status !== 'active') {
      throw new NotFoundException('スタッフが見つかりません');
    }

    if (membership.role === 'firm_owner' && dto.role && dto.role !== 'firm_owner') {
      await this.assertAnotherActiveFirmOwner(tenantId, userId);
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('名前は空にできません');
      data.name = name;
    }
    if (dto.password !== undefined) {
      if (membership.user.orgId !== null) {
        throw new ForbiddenException(
          '顧問先所属ユーザーのパスワードはこの画面から変更できません',
        );
      }
      data.password = await bcrypt.hash(dto.password, 12);
    }
    if (dto.role !== undefined && membership.user.orgId === null) {
      data.role = this.legacyUserRoleForTenantRole(dto.role);
    }

    const [updatedMembership, updatedUser] = await this.prisma.$transaction([
      this.prisma.tenantMembership.update({
        where: { userId_tenantId: { userId, tenantId } },
        data: dto.role ? { role: dto.role } : {},
      }),
      Object.keys(data).length > 0
        ? this.prisma.user.update({
            where: { id: userId },
            data,
            select: {
              id: true,
              email: true,
              name: true,
              avatarUrl: true,
            },
          })
        : this.prisma.user.findUniqueOrThrow({
            where: { id: userId },
            select: {
              id: true,
              email: true,
              name: true,
              avatarUrl: true,
            },
          }),
    ]);

    const assignmentCount = await this.prisma.organizationMembership.count({
      where: { tenantId, userId, side: 'advisor' },
    });

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      role: updatedMembership.role,
      status: updatedMembership.status,
      avatarUrl: updatedUser.avatarUrl,
      updatedAt: updatedMembership.updatedAt,
      _count: { memberships: assignmentCount },
    };
  }

  async remove(actorUserId: string, tenantId: string, userId: string) {
    if (actorUserId === userId) {
      throw new BadRequestException('自分自身のスタッフ権限は削除できません');
    }

    const membership = await this.prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { role: true, status: true },
    });
    if (!membership || membership.status !== 'active') {
      throw new NotFoundException('スタッフが見つかりません');
    }

    if (membership.role === 'firm_owner') {
      await this.assertAnotherActiveFirmOwner(tenantId, userId);
    }

    await this.prisma.$transaction([
      this.prisma.organizationMembership.deleteMany({
        where: {
          tenantId,
          userId,
          side: 'advisor',
        },
      }),
      this.prisma.tenantMembership.update({
        where: { userId_tenantId: { userId, tenantId } },
        data: { status: 'revoked' },
      }),
    ]);

    return { success: true };
  }

  private async assertTenantExists(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('テナントが見つかりません');
  }

  private async assertAnotherActiveFirmOwner(tenantId: string, userId: string) {
    const ownerCount = await this.prisma.tenantMembership.count({
      where: {
        tenantId,
        role: 'firm_owner',
        status: 'active',
        userId: { not: userId },
      },
    });
    if (ownerCount < 1) {
      throw new BadRequestException('最後の事務所オーナーは削除・降格できません');
    }
  }

  private legacyUserRoleForTenantRole(role: TenantStaffRole): 'owner' | 'advisor' {
    return role === 'firm_owner' ? 'owner' : 'advisor';
  }
}
