import { CookieOptions } from 'express';

const isProd = process.env.NODE_ENV === 'production';

export const JWT_COOKIE_NAME = 'sb_token';
export const CSRF_COOKIE_NAME = 'sb_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

export const jwtCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax', // Cross-origin (Vercel↔Cloud Run) requires 'none'
  path: '/',
  // 24h: auth.module.ts の JwtModule signOptions.expiresIn(既定 '24h' / JWT_EXPIRES_IN) と整合させること。
  // Cookie の生存期間と署名トークン自体の有効期限を概ね一致させ、ログアウト後にトークンが残り続けないようにする。
  maxAge: 24 * 60 * 60 * 1000, // 24h
};

export const csrfCookieOptions: CookieOptions = {
  httpOnly: false, // フロントから読み取れるようにする
  secure: isProd, // SameSite=None requires Secure
  sameSite: isProd ? 'none' : 'lax',
  path: '/',
  maxAge: 24 * 60 * 60 * 1000,
};
