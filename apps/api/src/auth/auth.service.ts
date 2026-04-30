import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtPayload } from './jwt.strategy';
import { AuthorizationService } from './authorization.service';
import { roleHasPermission } from './permissions';

type LegacyMembershipRole = 'owner' | 'admin' | 'member' | 'viewer' | 'advisor';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private authorization: AuthorizationService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return null;
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }
    return user;
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.validateUser(dto.email, dto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      orgId: user.orgId,
      currentOrgId: user.orgId,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        orgId: user.orgId,
      },
    };
  }

  async refresh(userId: string): Promise<{ accessToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      orgId: user.orgId,
      currentOrgId: user.orgId,
    };

    return {
      accessToken: this.jwtService.sign(payload),
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        orgId: true,
        avatarUrl: true,
      },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  async getUserMemberships(userId: string, _role: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, orgId: true },
    });
    if (!user) return [];

    const byOrgId = new Map<string, any>();

    const tenantMemberships = await this.prisma.tenantMembership.findMany({
      where: { userId, status: 'active' },
      include: {
        tenant: {
          include: {
            organizations: {
              select: {
                id: true,
                tenantId: true,
                name: true,
                code: true,
                industry: true,
                fiscalMonthEnd: true,
              },
              orderBy: { name: 'asc' },
            },
          },
        },
      },
    });

    for (const membership of tenantMemberships) {
      if (!roleHasPermission(membership.role, 'org:organizations:read')) {
        continue;
      }
      for (const org of membership.tenant.organizations) {
        byOrgId.set(org.id, {
          tenantId: org.tenantId,
          orgId: org.id,
          role: this.mapTenantRoleToMembershipRole(membership.role),
          tenantRole: membership.role,
          orgName: org.name,
          orgCode: org.code,
          industry: org.industry,
          fiscalMonthEnd: org.fiscalMonthEnd,
        });
      }
    }

    const orgMemberships = await this.prisma.organizationMembership.findMany({
      where: { userId },
      include: {
        organization: {
          select: {
            id: true,
            tenantId: true,
            name: true,
            code: true,
            industry: true,
            fiscalMonthEnd: true,
          },
        },
      },
    });

    for (const membership of orgMemberships) {
      byOrgId.set(membership.organization.id, {
        tenantId: membership.organization.tenantId,
        orgId: membership.organization.id,
        role: membership.role as LegacyMembershipRole,
        orgRole: membership.role,
        side: membership.side,
        orgName: membership.organization.name,
        orgCode: membership.organization.code,
        industry: membership.organization.industry,
        fiscalMonthEnd: membership.organization.fiscalMonthEnd,
      });
    }

    if (byOrgId.size === 0 && user.orgId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: user.orgId },
        select: {
          id: true,
          tenantId: true,
          name: true,
          code: true,
          industry: true,
          fiscalMonthEnd: true,
        },
      });
      if (org) {
        byOrgId.set(org.id, {
          tenantId: org.tenantId,
          orgId: org.id,
          role: user.role as LegacyMembershipRole,
          orgName: org.name,
          orgCode: org.code,
          industry: org.industry,
          fiscalMonthEnd: org.fiscalMonthEnd,
        });
      }
    }

    return Array.from(byOrgId.values()).sort((a, b) =>
      a.orgName.localeCompare(b.orgName),
    );
  }

  async getUserOrganizations(userId: string, _role: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, orgId: true },
    });
    if (!user) return [];

    return this.authorization.findAccessibleOrganizations(user);
  }

  async switchOrg(userId: string, orgId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    try {
      await this.authorization.assertOrgPermission(
        user,
        orgId,
        'org:organizations:read',
      );
    } catch {
      throw new UnauthorizedException('Cannot switch to this organization');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      orgId: user.orgId,
      currentOrgId: orgId,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        orgId: user.orgId,
      },
    };
  }

  private mapTenantRoleToMembershipRole(role: string): LegacyMembershipRole {
    const map: Record<string, LegacyMembershipRole> = {
      firm_owner: 'owner',
      firm_admin: 'admin',
      firm_manager: 'member',
      firm_advisor: 'advisor',
      firm_viewer: 'viewer',
    };
    return map[role] ?? 'viewer';
  }
}
