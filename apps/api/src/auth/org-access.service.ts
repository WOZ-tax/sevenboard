import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  isInternalAdvisor,
  isInternalOwner,
  UserLike,
} from './staff.helpers';

/**
 * 任意の service / controller から org access を検証するための共有 service。
 * OrgAccessGuard と同じロジックを露出する（route param に :orgId が無い
 * エンドポイント内部でも使えるように）。
 *
 * 使用例:
 * - budgets.service: fyId / bvId から親 org を引いて access 検証
 * - kintone.service: 月次進捗の record が属する org を検証
 */
@Injectable()
export class OrgAccessService {
  constructor(private prisma: PrismaService) {}

  /** orgId への access を持つかをチェック。失敗時 ForbiddenException */
  async assertOrgAccess(user: UserLike, orgId: string): Promise<void> {
    if (isInternalOwner(user)) return;
    if (isInternalAdvisor(user)) {
      const m = await this.prisma.organizationMembership.findUnique({
        where: { userId_orgId: { userId: user.id, orgId } },
        select: { id: true },
      });
      if (!m) {
        throw new ForbiddenException('この顧問先への access 権限がありません');
      }
      return;
    }
    if (user.orgId !== orgId) {
      throw new ForbiddenException('この組織への access 権限がありません');
    }
  }

  /** access できる orgId 集合を返す（内部 owner はワイルドカードで null）。 */
  async getAccessibleOrgIds(user: UserLike): Promise<string[] | 'all'> {
    if (isInternalOwner(user)) return 'all';
    if (isInternalAdvisor(user)) {
      const ms = await this.prisma.organizationMembership.findMany({
        where: { userId: user.id },
        select: { orgId: true },
      });
      return ms.map((m) => m.orgId);
    }
    return user.orgId ? [user.orgId] : [];
  }
}
