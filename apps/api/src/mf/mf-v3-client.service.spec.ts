import { of, throwError } from 'rxjs';
import { MfV3ClientService, MfV3HttpError } from './mf-v3-client.service';

function createClient() {
  const request = jest.fn();
  const httpService = { request } as any;
  const client = new MfV3ClientService(httpService);
  return { client, request };
}

function okResponse(data: unknown) {
  return of({ data, status: 200, headers: {}, config: {} } as any);
}

describe('MfV3ClientService URL / query encoding', () => {
  it('does not re-encode pre-encoded MF ids, but encodes plain values', async () => {
    const { client, request } = createClient();
    request.mockReturnValue(okResponse({ journals: [], metadata: { total_count: 0, total_pages: 1 } }));

    await client.getJournals(
      { token: 't' },
      { account_id: 'Bow%2BX%3D%3D', start_date: '2024-04-01', per_page: 10 },
    );

    const url: string = request.mock.calls[0][0].url;
    // pre-encoded id echoed verbatim (no double-encoding of % → %25)
    expect(url).toContain('account_id=Bow%2BX%3D%3D');
    expect(url).not.toContain('%25');
    expect(url).toContain('start_date=2024-04-01');
    expect(url).toContain('per_page=10');
  });

  it('interpolates a pre-encoded journal id into the path without re-encoding', async () => {
    const { client, request } = createClient();
    request.mockReturnValue(okResponse({ journal: { id: 'x' } }));

    await client.getJournalById({ token: 't' }, 'tfAQ%2BSnC9%2FN1L');

    const url: string = request.mock.calls[0][0].url;
    expect(url).toContain('/api/v3/journals/tfAQ%2BSnC9%2FN1L');
    expect(url).not.toContain('%25');
  });

  it('sends the Bearer token and honours MF_V3_BASE_URL', async () => {
    const prev = process.env.MF_V3_BASE_URL;
    process.env.MF_V3_BASE_URL = 'https://example.test';
    try {
      const { client, request } = createClient();
      request.mockReturnValue(okResponse({ accounts: [] }));
      await client.getAccounts({ token: 'abc' });
      const config = request.mock.calls[0][0];
      expect(config.url).toBe('https://example.test/api/v3/accounts');
      expect(config.headers.Authorization).toBe('Bearer abc');
    } finally {
      if (prev === undefined) delete process.env.MF_V3_BASE_URL;
      else process.env.MF_V3_BASE_URL = prev;
    }
  });
});

describe('MfV3ClientService error handling', () => {
  it('surfaces a 403 as MfV3HttpError with status (no retry)', async () => {
    const { client, request } = createClient();
    request.mockReturnValue(
      throwError(() => ({
        response: { status: 403, data: { errors: [{ code: 'forbidden', message: 'nope' }] } },
      })),
    );

    await expect(client.getSubAccounts({ token: 't' })).rejects.toMatchObject({
      name: 'MfV3HttpError',
      status: 403,
      code: 'forbidden',
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('retries a 429 then throws MfV3HttpError when it persists', async () => {
    jest.useFakeTimers();
    try {
      const { client, request } = createClient();
      request.mockReturnValue(
        throwError(() => ({ response: { status: 429, data: {} } })),
      );

      const p = client.getTaxes({ token: 't' });
      const assertion = expect(p).rejects.toBeInstanceOf(MfV3HttpError);
      // drain the 3 backoff waits (3s/6s/12s)
      await jest.advanceTimersByTimeAsync(3000 + 6000 + 12000 + 10);
      await assertion;
      // initial attempt + 3 retries = 4 calls
      expect(request).toHaveBeenCalledTimes(4);
    } finally {
      jest.useRealTimers();
    }
  });

  it('paginates journals across pages using metadata.total_pages', async () => {
    const { client, request } = createClient();
    request
      .mockReturnValueOnce(
        okResponse({ journals: [{ id: 'a' }, { id: 'b' }], metadata: { total_count: 3, total_pages: 2 } }),
      )
      .mockReturnValueOnce(
        okResponse({ journals: [{ id: 'c' }], metadata: { total_count: 3, total_pages: 2 } }),
      );

    const res = await client.getAllJournals({ token: 't' }, { per_page: 2 });
    expect(res.truncated).toBe(false);
    expect(res.journals.map((j) => j.id)).toEqual(['a', 'b', 'c']);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
