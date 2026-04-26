import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtPayload } from './jwt.strategy';
import { isInternalAdvisor, isInternalOwner } from './staff.helpers';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
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

    // 初回ログイン時: currentOrgId は user.orgId（CL は自社、内部は null）。
    // 内部スタッフは login 後に switchOrg で「いま見る顧問先」を選ぶ運用。
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
      select: { id: true, email: true, name: true, role: true, orgId: true, avatarUrl: true },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  /**
   * factory-hybrid と整合する membership 形式でアクセス可能 org を返す。
   * 各エントリは `{ orgId, role, orgName, orgCode }`。
   *
   * - 内部 owner (orgId=NULL, role=owner): 全 Organization を 'owner' として返す
   * - 内部 advisor (orgId=NULL, role=advisor): OrganizationMembership ごとに membership.role を返す
   *   （advisor が org X で 'admin' membership を持つ場合は 'admin' が返る）
   * - 顧問先側ユーザー (orgId 持ち、role 任意): 自分の orgId と自分の user.role
   *
   * 重要: 内部 advisor の effective role は OrganizationMembership.role が真の値。
   * 旧実装は user.role 'advisor' を全 org に固定していたが、RolesGuard の org-aware 判定
   * （membership.role を見る）と乖離するため、ここでも membership.role を反映する。
   */
  async getUserMemberships(userId: string, role: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, orgId: true },
    });
    if (!user) return [];

    // 内部 advisor: membership ごとに role を返す
    if (isInternalAdvisor(user)) {
      const ms = await this.prisma.organizationMembership.findMany({
        where: { userId },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              code: true,
              industry: true,
              fiscalMonthEnd: true,
            },
          },
        },
      });
      return ms.map((m) => ({
        orgId: m.organization.id,
        role: m.role as 'owner' | 'admin' | 'member' | 'viewer' | 'advisor',
        orgName: m.organization.name,
        orgCode: m.organization.code,
        industry: m.organization.industry,
        fiscalMonthEnd: m.organization.fiscalMonthEnd,
      }));
    }

    // 内部 owner: 全 org を 'owner' として返す
    // 顧問先側ユーザー: 自社 org を user.role として返す
    const orgs = await this.getUserOrganizations(userId, role);
    return orgs.map((org) => ({
      orgId: org.id,
      role: user.role as 'owner' | 'admin' | 'member' | 'viewer' | 'advisor',
      orgName: org.name,
      orgCode: org.code,
      industry: org.industry,
      fiscalMonthEnd: org.fiscalMonthEnd,
    }));
  }

  async getUserOrganizations(userId: string, role: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, orgId: true },
    });
    if (!user) return [];

    // 内部 owner: 事務所オーナー想定で全 Organization を列挙（クロステナント）
    if (isInternalOwner(user)) {
      return this.prisma.organization.findMany({
        select: {
          id: true,
          name: true,
          code: true,
          industry: true,
          fiscalMonthEnd: true,
        },
        orderBy: { name: 'asc' },
      });
    }

    // 内部 advisor: OrganizationMembership で紐付いた先のみ
    if (isInternalAdvisor(user)) {
      const assignments = await this.prisma.organizationMembership.findMany({
        where: { userId },
        include: {
          organization: {
            select: { id: true, name: true, code: true, industry: true, fiscalMonthEnd: true },
          },
        },
      });
      return assignments.map((a) => a.organization);
    }

    // 顧問先側ユーザー（orgId 持ち、role 任意）: 自社のみ
    if (!user.orgId) return [];
    const userWithOrg = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: {
          select: { id: true, name: true, code: true, industry: true, fiscalMonthEnd: true },
        },
      },
    });
    return userWithOrg?.organization ? [userWithOrg.organization] : [];
  }

  async switchOrg(userId: string, orgId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    // 権限チェック
    // - 内部 owner (orgId=NULL, role=owner): 全顧問先へ切替可能
    // - 内部 advisor (orgId=NULL, role=advisor): OrganizationMembership で紐付いた先のみ
    // - 顧問先側ユーザー (orgId 持ち): 自社のみ
    if (isInternalOwner(user)) {
      // 全orgへ切替可能。orgIdが実在するかは念のため確認
      const target = await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { id: true },
      });
      if (!target) {
        throw new UnauthorizedException('Organization not found');
      }
    } else if (isInternalAdvisor(user)) {
      const assignment = await this.prisma.organizationMembership.findUnique({
        where: { userId_orgId: { userId, orgId } },
      });
      if (!assignment) {
        throw new UnauthorizedException('Not assigned to this organization');
      }
    } else if (user.orgId !== orgId) {
      // 顧問先側ユーザー（CL の owner/admin/member/viewer 含む）は自社以外不可
      throw new UnauthorizedException('Cannot switch to this organization');
    }

    // 重要: switchOrg は「DB-bound orgId」を変えてはいけない。
    // 内部 owner が orgId=NULL のまま顧問先 X を選んだ状態は、
    //   { role: 'owner', orgId: NULL, currentOrgId: X }
    // と表現する。orgId を X にすると DB 制約 (user_role_orgid_partition) と
    // 矛盾し、isInternalOwner / RolesGuard が CL owner 扱いに転落する。
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      orgId: user.orgId, // DB 値を維持
      currentOrgId: orgId, // 選択中 org は別フィールド
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        orgId: user.orgId, // フロントの auth store にも DB 値を渡す
      },
    };
  }
}
