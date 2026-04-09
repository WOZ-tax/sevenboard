import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../common/cookie.config';

/**
 * Double Submit Cookie パターンのCSRFガード。
 * Cookie内のCSRFトークンとヘッダーの値を比較する。
 *
 * GET/HEAD/OPTIONSは対象外（冪等なため）。
 * Bearer認証のみのリクエスト（Cookie未使用）も対象外。
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const method = req.method.toUpperCase();

    // 冪等メソッドはCSRF不要
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true;
    }

    // 認証エンドポイントはCSRF除外（まだトークンがない）
    const path = req.path || req.url || '';
    if (path.startsWith('/auth/login') || path.startsWith('/auth/mf/')) {
      return true;
    }

    // Bearer認証を使っている場合はCSRFリスクなし（トークンは自動送信されない）
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ')) {
      return true;
    }

    // Cookie認証を使っていない場合もスキップ
    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    if (!cookieToken) {
      return true;
    }

    // Double Submit Cookie: ヘッダーとCookieの値を比較
    const headerToken = req.headers[CSRF_HEADER_NAME];
    if (!headerToken || headerToken !== cookieToken) {
      throw new ForbiddenException('CSRF token mismatch');
    }

    return true;
  }
}
