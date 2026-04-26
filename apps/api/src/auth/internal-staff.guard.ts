import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isInternalOwner, isInternalStaff } from './staff.helpers';

/**
 * /internal/* 等の事務所内部 API 専用ガード。
 *
 * 必ず JwtAuthGuard の後で評価すること。
 *
 * 既定: 内部スタッフ (orgId=NULL かつ role∈owner/advisor) を要求。
 * `@InternalRoles('owner')` で更に owner だけに絞れる。
 *
 * @Roles('owner') を併用すると顧問先側 owner（orgId 持ち）に通ってしまうため、
 * 内部 API では必ずこのガードを使うこと。
 */
export const INTERNAL_ROLES_KEY = 'internalRoles';
export const InternalRoles = (...roles: ('owner' | 'advisor')[]) =>
  SetMetadata(INTERNAL_ROLES_KEY, roles);

@Injectable()
export class InternalStaffGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('認証が必要です');
    }

    if (!isInternalStaff(user)) {
      throw new ForbiddenException(
        '事務所スタッフのみアクセス可能です',
      );
    }

    const required = this.reflector.getAllAndOverride<
      ('owner' | 'advisor')[] | undefined
    >(INTERNAL_ROLES_KEY, [context.getHandler(), context.getClass()]);

    if (!required || required.length === 0) {
      // 既定: owner/advisor どちらでも可
      return true;
    }

    if (required.includes('owner') && isInternalOwner(user)) return true;
    if (required.includes('advisor') && user.role === 'advisor') return true;

    throw new ForbiddenException('この操作を実行する権限がありません');
  }
}
