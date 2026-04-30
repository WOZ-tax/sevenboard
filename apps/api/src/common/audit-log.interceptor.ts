import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    const method: string = req.method;
    const observable = next.handle();

    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return observable;
    }

    const user = req.user as { id?: string } | undefined;
    const orgId: string | undefined = req.params?.orgId;
    const path: string = req.path;

    if (!user?.id || !orgId) {
      return observable;
    }

    const actionMap: Record<string, string> = {
      POST: 'CREATE',
      PUT: 'UPDATE',
      PATCH: 'UPDATE',
      DELETE: 'DELETE',
    };

    const action = actionMap[method] || method;
    const segments = path.split('/').filter(Boolean);
    const orgIdIndex = segments.indexOf(orgId);
    const resource = segments[orgIdIndex + 1] || 'unknown';
    const resourceId = segments[orgIdIndex + 2] || null;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { tap } = require('rxjs');

    return observable.pipe(
      tap(() => {
        this.prisma
          .orgScope(orgId)
          .then(({ tenantId }) =>
            this.prisma.auditLog.create({
              data: {
                tenantId,
                orgId,
                userId: user.id,
                action,
                resource,
                resourceId,
                ipAddress: req.ip || req.connection?.remoteAddress || null,
              },
            }),
          )
          .catch((err: any) => {
            console.error('AuditLog write failed:', err.message);
          });
      }),
    );
  }
}
