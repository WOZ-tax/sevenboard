import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * POST/PUT/PATCH/DELETE リクエストを AuditLog テーブルに記録する。
 * GET（読み取り）はスキップ。
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    const method: string = req.method;

    const observable = next.handle();

    // GET / HEAD / OPTIONS はスキップ
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return observable;
    }

    const user = req.user as { id?: string } | undefined;
    const orgId: string | undefined = req.params?.orgId;
    const path: string = req.path;

    // ユーザーまたは orgId が無い場合はスキップ（未認証リクエスト等）
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
    // パスからリソース名を推定: /organizations/:orgId/budgets -> budgets
    const segments = path.split('/').filter(Boolean);
    const orgIdIndex = segments.indexOf(orgId);
    const resource = segments[orgIdIndex + 1] || 'unknown';
    const resourceId = segments[orgIdIndex + 2] || null;

    // rxjs の tap を require で取得し、TS のバージョン不整合を回避
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { tap } = require('rxjs');

    return observable.pipe(
      tap(() => {
        // 非同期で記録（レスポンスを遅らせない）
        this.prisma.auditLog
          .create({
            data: {
              orgId,
              userId: user.id,
              action,
              resource,
              resourceId,
              ipAddress: req.ip || req.connection?.remoteAddress || null,
            },
          })
          .catch((err: any) => {
            // 記録失敗は本体処理を妨げない
            console.error('AuditLog write failed:', err.message);
          });
      }),
    );
  }
}
