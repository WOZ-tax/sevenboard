import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Budget 系 route（fyId / bvId 直指定）の params に親 orgId を解決して挿入するガード。
 *
 * 後段の RolesGuard 等が `request.params.orgId` を見て org-aware に動くため、
 * これを `@UseGuards(JwtAuthGuard, ResolveOrgFromBudgetParam, RolesGuard)` の順で
 * 並べることで、fyId/bvId 直指定 route でも membership role 解決を効かせる。
 *
 * NestJS の評価順序: Guard → Interceptor → Pipe → Handler。
 * Guard 同士は @UseGuards に渡した順に実行されるため、本ガードを RolesGuard の前に
 * 置くことで意図通りの挙動になる。
 */
@Injectable()
export class ResolveOrgFromBudgetParam implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const params = request.params || {};

    if (params.orgId) {
      return true;
    }

    if (params.fyId) {
      const fy = await this.prisma.fiscalYear.findUnique({
        where: { id: params.fyId },
        select: { orgId: true },
      });
      if (!fy) throw new NotFoundException('Fiscal year not found');
      request.params = { ...params, orgId: fy.orgId };
    } else if (params.bvId) {
      const bv = await this.prisma.budgetVersion.findUnique({
        where: { id: params.bvId },
        select: { fiscalYear: { select: { orgId: true } } },
      });
      if (!bv) throw new NotFoundException('Budget version not found');
      request.params = { ...params, orgId: bv.fiscalYear.orgId };
    }

    return true;
  }
}
