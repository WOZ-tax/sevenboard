import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

interface RateLimitEntry {
  count: number;
  resetAt: number; // epoch ms
}

/**
 * org 単位で 1 時間あたり 20 回の AI リクエスト制限。
 * インメモリ管理（Map）。超過時は 429 TooManyRequests を返す。
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly limits = new Map<string, RateLimitEntry>();
  private readonly maxRequests = 20;
  private readonly windowMs = 60 * 60 * 1000; // 1 hour

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const orgId: string | undefined = req.params?.orgId;

    if (!orgId) {
      return true; // orgId が無いルートでは制限しない
    }

    const now = Date.now();
    const entry = this.limits.get(orgId);

    if (!entry || now >= entry.resetAt) {
      // ウィンドウ期限切れまたは初回 → 新規エントリ
      this.limits.set(orgId, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (entry.count >= this.maxRequests) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `AI rate limit exceeded for organization. Retry after ${retryAfterSec}s.`,
          retryAfter: retryAfterSec,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count += 1;
    return true;
  }
}
