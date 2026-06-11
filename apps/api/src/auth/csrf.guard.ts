import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  JWT_COOKIE_NAME,
} from '../common/cookie.config';

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

    // 認証エンドポイントはCSRF除外（まだトークンがない）。
    // 除外は「まだ認証Cookieが存在しないログイン」と「ブラウザリダイレクトで戻る
    // GET の OAuth callback」だけに限定する。
    // 注意: /auth/mf/ を前方一致で丸ごと除外すると、副作用のある状態変更POST
    // /auth/mf/refresh まで免除され、本番Cookie(sameSite:'none')下でCSRFを許してしまう。
    // callback は冪等GETなので冒頭のメソッド判定でも素通りするが、意図を明示するため列挙する。
    const path = req.path || req.url || '';
    if (path.startsWith('/auth/login') || path.startsWith('/auth/mf/callback')) {
      return true;
    }

    // Bearer認証を使っている場合はCSRFリスクなし（トークンは自動送信されない）
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ')) {
      return true;
    }

    // Cookie認証(sb_token)を使っていない場合はCSRFリスクなし
    // 判定基準はCSRF Cookieの有無ではなく認証Cookieの有無
    if (!req.cookies?.[JWT_COOKIE_NAME]) {
      return true;
    }

    // 認証Cookieがある場合はDouble Submit Cookieを必須とする
    // (sb_csrf Cookieの欠落・ヘッダー欠落・不一致はすべて403)
    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = req.headers[CSRF_HEADER_NAME];
    if (!cookieToken || !headerToken || headerToken !== cookieToken) {
      throw new ForbiddenException('CSRF token mismatch');
    }

    return true;
  }
}
