import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { JWT_COOKIE_NAME } from '../common/cookie.config';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  /**
   * DB-bound orgId (user.org_id)。NULL なら内部スタッフ。
   * payload に値が入っていても jwt.strategy は無視し、必ず DB から再取得する。
   * 旧コード互換のため optional フィールドとして残す。
   */
  orgId?: string | null;
  /**
   * 選択中（switchOrg で切り替えた）顧問先 id。署名 token のセッション情報。
   * 認可判定には使わない。フロントの「いま見ている org」UI と監査ログ用途。
   */
  currentOrgId?: string | null;
}

// Cookie → Bearer ヘッダーの順にJWTを取得
function extractJwt(req: Request): string | null {
  // 1. Cookie
  const cookieToken = req.cookies?.[JWT_COOKIE_NAME];
  if (cookieToken) return cookieToken;

  // 2. Authorization: Bearer
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: extractJwt,
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET ||
        (() => {
          if (process.env.NODE_ENV === 'production')
            throw new Error('JWT_SECRET is required');
          return 'sevenboard-dev-secret-do-not-use-in-production';
        })(),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, orgId: true },
    });
    if (!user) {
      throw new UnauthorizedException();
    }

    // 重要: orgId は **DB を信頼**する。payload.orgId（旧コードが switchOrg で書き込んでいた値）は
    // 内部スタッフ（user.orgId=NULL）でも値が入る場合があり、信用すると
    // 「内部 owner なのに orgId 付き」という DB 制約上ありえない user 状態が
    // req.user に出現する。これを根絶するため payload.orgId は無視。
    //
    // 「いま選択中の org」が必要な場合は currentOrgId を別フィールドで参照すること。
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      orgId: user.orgId, // 常に DB から
      currentOrgId: payload.currentOrgId ?? user.orgId,
    };
  }
}
