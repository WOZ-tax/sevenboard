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
  orgId: string | null;
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
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      orgId: payload.orgId ?? user.orgId,
    };
  }
}
