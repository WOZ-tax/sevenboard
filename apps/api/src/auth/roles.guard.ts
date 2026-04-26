import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES_KEY } from './roles.decorator';
import { isInternalOwner, isInternalStaff } from './staff.helpers';

/**
 * org-aware Roles ガード。
 *
 * - route param に :orgId がある場合: その org に対する有効ロールを解決して
 *   requiredRoles と比較。優先順:
 *     1. 内部 owner (orgId=NULL & role=owner) → 全 org で 'owner' 扱い
 *     2. 内部 advisor (orgId=NULL & role=advisor) → membership.role 優先、無ければ 'advisor'
 *     3. 顧問先側ユーザー (orgId 持ち) → 自社 org のみ。他 org は拒否。自社 org では user.role を効果的ロールとする
 * - route param に :orgId が無い場合: 従来通り user.role と比較（global role 評価）
 *
 * これにより、顧問先側 owner（CL 管理者）が global role='owner' でも、
 * 他 org の write 系には到達できない。同時に内部スタッフは旧来通り動作する。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as
      | { id: string; role: string; orgId: string | null }
      | undefined;
    if (!user) return false;

    const orgId: string | undefined = request.params?.orgId;

    // route に :orgId が無いエンドポイントは従来通り global role で判定
    if (!orgId) {
      return requiredRoles.includes(user.role);
    }

    // 内部 owner: 全 org で owner
    if (isInternalOwner(user)) {
      return requiredRoles.includes('owner');
    }

    // 内部 advisor: 担当先かを確認 + membership.role を解決
    if (isInternalStaff(user)) {
      const m = await this.prisma.organizationMembership.findUnique({
        where: { userId_orgId: { userId: user.id, orgId } },
        select: { role: true },
      });
      if (!m) return false;
      const effective = m.role || 'advisor';
      return requiredRoles.includes(effective);
    }

    // 顧問先側ユーザー: 自社 org のみ。他 org は拒否
    if (user.orgId !== orgId) return false;
    return requiredRoles.includes(user.role);
  }
}
