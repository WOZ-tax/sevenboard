import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { isInternalAdvisor, isInternalOwner } from './staff.helpers';

/**
 * 顧問先 org への アクセス制御。
 *
 * 重要: `user.role === 'owner'` だけで全 org アクセスを許すと、顧問先側 owner
 * （CL 管理者）も全顧問先に到達できる。必ず内部スタッフ条件
 * (`user.orgId === null`) と併用すること。
 *
 * ロール体系:
 * - 内部 owner (orgId=NULL, role=owner): 全顧問先アクセス
 * - 内部 advisor (orgId=NULL, role=advisor): OrganizationMembership で紐付いた先のみ
 * - 顧問先側ユーザー (orgId!=NULL, 任意 role): 自社 org のみ
 */
@Injectable()
export class OrgAccessGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const orgId = request.params.orgId;

    // orgIdパラメータがないエンドポイント（/advisor, /auth, /health等）はスキップ
    // ただしルート定義に:orgIdがある場合、空文字やundefinedは拒否
    if (!orgId) {
      const routePath = Reflect.getMetadata(PATH_METADATA, context.getHandler()) || '';
      const controllerPath = Reflect.getMetadata(PATH_METADATA, context.getClass()) || '';
      const fullPath = `${controllerPath}/${routePath}`;
      if (fullPath.includes(':orgId')) {
        throw new ForbiddenException('組織IDが指定されていません');
      }
      return true;
    }

    // 内部 owner: 全顧問先アクセス可
    if (isInternalOwner(user)) {
      return true;
    }

    // 内部 advisor: OrganizationMembership で紐付いた顧問先のみ
    if (isInternalAdvisor(user)) {
      const assignment = await this.prisma.organizationMembership.findUnique({
        where: { userId_orgId: { userId: user.id, orgId } },
      });
      if (!assignment)
        throw new ForbiddenException(
          'この顧問先へのアクセス権限がありません',
        );
      return true;
    }

    // 顧問先側ユーザー (orgId 持ち。role に関わらず): 自社のみ
    if (user.orgId !== orgId) {
      throw new ForbiddenException('この組織へのアクセス権限がありません');
    }
    return true;
  }
}
