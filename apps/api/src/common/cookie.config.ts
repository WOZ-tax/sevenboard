import { CookieOptions } from 'express';

const isProd = process.env.NODE_ENV === 'production';

export const JWT_COOKIE_NAME = 'sb_token';
export const CSRF_COOKIE_NAME = 'sb_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

export const jwtCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'strict' : 'lax',
  path: '/',
  maxAge: 24 * 60 * 60 * 1000, // 24h
};

export const csrfCookieOptions: CookieOptions = {
  httpOnly: false, // フロントから読み取れるようにする
  secure: isProd,
  sameSite: isProd ? 'strict' : 'lax',
  path: '/',
  maxAge: 24 * 60 * 60 * 1000,
};
