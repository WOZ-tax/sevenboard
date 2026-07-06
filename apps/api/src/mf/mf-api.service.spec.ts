import { InternalServerErrorException } from '@nestjs/common';
import { MfApiService } from './mf-api.service';

describe('MfApiService.getJournals', () => {
  function createService() {
    return new MfApiService(
      {} as any,
      {} as any,
      { get: jest.fn(), set: jest.fn() } as any,
      { record: jest.fn() } as any,
    );
  }

  it('treats an out-of-range next page as the end of MF journal pagination', async () => {
    const service = createService();
    const pageOverflow = new InternalServerErrorException(
      'MF MCP tool error: API request failed: client error: {"errors":[{"code":"invalid_query_parameter_value","message":"The page parameter must not exceed the total_pages"}]}',
    );
    const mcpRequest = jest
      .fn()
      .mockResolvedValueOnce({ journals: [{ id: 'journal-1' }] })
      .mockRejectedValueOnce(pageOverflow);

    (service as any).mcpRequest = mcpRequest;

    await expect(
      service.getJournals('org-1', {
        startDate: '2025-06-01',
        endDate: '2025-06-30',
      }),
    ).resolves.toEqual({
      journals: [{ id: 'journal-1' }],
      truncated: false,
    });

    expect(mcpRequest).toHaveBeenNthCalledWith(
      1,
      'org-1',
      'mfc_ca_getJournals',
      {
        per_page: 500,
        start_date: '2025-06-01',
        end_date: '2025-06-30',
      },
    );
    expect(mcpRequest).toHaveBeenNthCalledWith(
      2,
      'org-1',
      'mfc_ca_getJournals',
      {
        per_page: 500,
        start_date: '2025-06-01',
        end_date: '2025-06-30',
        page: 2,
      },
    );
  });

  it('still throws the same MF pagination error on the first page', async () => {
    const service = createService();
    const pageOverflow = new InternalServerErrorException(
      'MF MCP tool error: API request failed: client error: {"errors":[{"code":"invalid_query_parameter_value","message":"The page parameter must not exceed the total_pages"}]}',
    );

    (service as any).mcpRequest = jest.fn().mockRejectedValueOnce(pageOverflow);

    await expect(service.getJournals('org-1')).rejects.toBe(pageOverflow);
  });
});

describe('MfApiService 401 token refresh single-flight', () => {
  function unauthorized() {
    const err: any = new Error('unauthorized');
    err.response = { status: 401, headers: {}, data: { error: 'invalid_token' } };
    return err;
  }

  function createService(prisma: any) {
    return new MfApiService(
      {} as any,
      prisma,
      { get: jest.fn().mockReturnValue(undefined), set: jest.fn() } as any,
      { record: jest.fn().mockResolvedValue(undefined) } as any,
    );
  }

  it('collapses concurrent 401s into a single refresh and lets both calls succeed', async () => {
    const prisma = {
      orgScope: jest.fn().mockResolvedValue({ tenantId: 't1' }),
      integration: {
        findUnique: jest.fn().mockResolvedValue({
          accessToken: 'stale-token',
          refreshToken: 'refresh-token',
          tokenExpiry: new Date(Date.now() + 3_600_000),
        }),
      },
    };
    const service = createService(prisma);

    // getAccessToken は失効トークンを返す（キャッシュ済みトークンが実は失効しているケース）
    (service as any).getAccessToken = jest.fn().mockResolvedValue('stale-token');
    (service as any).initSession = jest.fn().mockResolvedValue('sess');
    // 失効トークンでの呼び出しは 401、新トークンなら成功
    (service as any).callTool = jest
      .fn()
      .mockImplementation(async (token: string) => {
        if (token === 'stale-token') throw unauthorized();
        return { ok: true, token };
      });
    // 実 refresh は 1 回だけ走ることを検証するためカウントする
    const refreshSpy = jest.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 'new-token';
    });
    (service as any).refreshToken = refreshSpy;

    // 別ツール = 別 cacheKey なので requestInFlight で dedupe されず、2 本が並列に 401 を受ける
    const [a, b] = await Promise.all([
      (service as any).mcpRequest('org-1', 'toolA'),
      (service as any).mcpRequest('org-1', 'toolB'),
    ]);

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ ok: true, token: 'new-token' });
    expect(b).toEqual({ ok: true, token: 'new-token' });
    // single-flight エントリが後片付けされていること
    expect((service as any).tokenInFlight.size).toBe(0);
  });

  it('reuses an already-refreshed newer token from the DB without refreshing again', async () => {
    const prisma = {
      orgScope: jest.fn().mockResolvedValue({ tenantId: 't1' }),
      integration: {
        // 別リクエストが先に refresh 済み: DB のトークンは失効トークンより新しい
        findUnique: jest.fn().mockResolvedValue({
          accessToken: 'fresh-token',
          refreshToken: 'refresh-token',
          tokenExpiry: new Date(Date.now() + 3_600_000),
        }),
      },
    };
    const service = createService(prisma);
    const refreshSpy = jest.fn().mockResolvedValue('should-not-be-called');
    (service as any).refreshToken = refreshSpy;

    const token = await (service as any).refreshTokenOnAuthFailure(
      'org-1',
      'stale-token',
    );

    expect(token).toBe('fresh-token');
    expect(refreshSpy).not.toHaveBeenCalled();
  });
});
