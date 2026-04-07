import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { PrismaService } from '../prisma/prisma.service';

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

    // ADVISORロール: AdvisorAssignmentで確認
    if (user.role === 'ADVISOR') {
      const assignment = await this.prisma.advisorAssignment.findUnique({
        where: { userId_orgId: { userId: user.id, orgId } },
      });
      if (!assignment)
        throw new ForbiddenException(
          'この顧問先へのアクセス権限がありません',
        );
      return true;
    }

    // 一般ユーザー: 自分の組織のみ
    if (user.orgId !== orgId) {
      throw new ForbiddenException('この組織へのアクセス権限がありません');
    }
    return true;
  }
}
