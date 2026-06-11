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
  // メモリリーク対策: 期限切れ(resetAt 経過)エントリを定期スイープして
  // Map の単調増加を防ぐ。canActivate 呼び出しごとにカウンタで間引き、
  // かつ最終スイープから一定間隔経過時のみ全走査する。
  private requestsSinceSweep = 0;
  private lastSweepAt = Date.now();
  private readonly sweepEveryRequests = 100; // この回数ごとにスイープ判定
  private readonly sweepIntervalMs = 5 * 60 * 1000; // 少なくとも 5 分間隔

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const orgId: string | undefined = req.params?.orgId;

    if (!orgId) {
      return true; // orgId が無いルートでは制限しない
    }

    const now = Date.now();

    // 期限切れエントリの間引きスイープ。リクエスト数または経過時間の
    // いずれかが閾値を超えたら一度だけ全走査して expired を削除する。
    this.requestsSinceSweep += 1;
    if (
      this.requestsSinceSweep >= this.sweepEveryRequests ||
      now - this.lastSweepAt >= this.sweepIntervalMs
    ) {
      this.sweepExpired(now);
    }

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

  /**
   * 期限切れ(resetAt <= now)エントリを Map から削除する。
   * 未アクセスのまま放置された org のエントリも回収され、Map サイズが
   * アクティブな org 数に収束する。
   */
  private sweepExpired(now: number): void {
    for (const [orgId, entry] of this.limits) {
      if (now >= entry.resetAt) {
        this.limits.delete(orgId);
      }
    }
    this.requestsSinceSweep = 0;
    this.lastSweepAt = now;
  }
}
