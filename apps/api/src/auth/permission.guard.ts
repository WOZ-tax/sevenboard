import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from './authorization.service';
import { PERMISSIONS_KEY } from './require-permission.decorator';
import { Permission } from './permissions';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authorization: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permissions || permissions.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;

    for (const permission of permissions) {
      if (permission.startsWith('org:')) {
        const orgId = request.params?.orgId;
        if (!orgId) {
          throw new ForbiddenException('組織IDが指定されていません');
        }
        await this.authorization.assertOrgPermission(
          user,
          orgId,
          permission,
        );
      } else if (permission.startsWith('tenant:')) {
        await this.authorization.assertTenantPermission(
          user,
          permission,
          request.params?.tenantId,
        );
      }
    }

    return true;
  }
}
