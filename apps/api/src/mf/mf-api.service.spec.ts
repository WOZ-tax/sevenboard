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
