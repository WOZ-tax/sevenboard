import { ForbiddenException } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';

describe('CSRF authentication source', () => {
  const guard = new CsrfGuard();
  const context = (request: object): any => ({
    switchToHttp: () => ({ getRequest: () => request }),
  });
  it('requires CSRF when Cookie authentication wins over an arbitrary Bearer header', () => {
    expect(() =>
      guard.canActivate(
        context({
          method: 'PUT',
          path: '/organizations/example',
          cookies: { sb_token: 'valid-session' },
          headers: { authorization: 'Bearer anything' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });
  it('permits Bearer-only API clients', () => {
    expect(
      guard.canActivate(
        context({
          method: 'PUT',
          path: '/organizations/example',
          cookies: {},
          headers: { authorization: 'Bearer token' },
        }),
      ),
    ).toBe(true);
  });
  it('permits a matching double-submit token with authentication cookies', () => {
    expect(
      guard.canActivate(
        context({
          method: 'PUT',
          path: '/organizations/example',
          cookies: { sb_token: 'token', sb_csrf: 'csrf' },
          headers: { 'x-csrf-token': 'csrf' },
        }),
      ),
    ).toBe(true);
  });
  it('does not waive external token refresh CSRF', () => {
    expect(() =>
      guard.canActivate(
        context({
          method: 'POST',
          path: '/auth/mf/refresh',
          cookies: { sb_token: 'token' },
          headers: {},
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
