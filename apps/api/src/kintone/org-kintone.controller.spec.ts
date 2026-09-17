import {
  ForbiddenException,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { AuthorizationService } from '../auth/authorization.service';
import { InternalStaffGuard } from '../auth/internal-staff.guard';
import { MfApiService } from '../mf/mf-api.service';
import { KintoneApiService } from './kintone-api.service';
import { DataHealthService } from '../data-health/data-health.service';
import { OrgKintoneController } from './org-kintone.controller';
import { DemoService } from '../demo/demo.service';

describe('organization-scoped kintone authorization', () => {
  const orgId = '11111111-1111-4111-8111-111111111111';
  const otherOrg = '22222222-2222-4222-8222-222222222222';
  const getOffice = jest.fn();
  const getByMfOfficeCode = jest.fn();
  const getRecordMfCode = jest.fn();
  const updateMonthlyStatus = jest.fn();
  const record = jest.fn();
  const assertOrgPermission = jest.fn(
    async (user, requestedOrg, permission) => {
      if (
        requestedOrg !== orgId ||
        (user.id === 'read-only' && permission === 'org:monthly_close:manage')
      )
        throw new ForbiddenException();
    },
  );
  let app: INestApplication;
  let origin: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [OrgKintoneController],
      providers: [
        { provide: DemoService, useValue: {} },
        PermissionGuard,
        InternalStaffGuard,
        { provide: MfApiService, useValue: { getOffice } },
        {
          provide: KintoneApiService,
          useValue: { getByMfOfficeCode, getRecordMfCode, updateMonthlyStatus },
        },
        { provide: DataHealthService, useValue: { record } },
        { provide: AuthorizationService, useValue: { assertOrgPermission } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context) {
          const req = context.switchToHttp().getRequest();
          const identity = req.headers['x-test-user'];
          if (identity === 'anonymous') throw new UnauthorizedException();
          req.user = {
            id: identity ?? 'advisor',
            role: identity === 'client' ? 'owner' : 'advisor',
            orgId: identity === 'client' ? orgId : null,
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    getOffice.mockResolvedValue({ code: '1234-5678' });
    getByMfOfficeCode.mockResolvedValue({
      recordId: '123',
      mfOfficeCode: '1234-5678',
    });
    getRecordMfCode.mockResolvedValue('1234-5678');
    updateMonthlyStatus.mockResolvedValue(true);
    record.mockResolvedValue(undefined);
  });
  const endpoint = (org = orgId) =>
    `${origin}/organizations/${org}/kintone/monthly-progress`;
  const put = (
    options: { org?: string; identity?: string; month?: number } = {},
  ) =>
    fetch(`${endpoint(options.org)}/123`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-test-user': options.identity ?? 'advisor',
      },
      body: JSON.stringify({ month: options.month ?? 8, status: '3.入力済' }),
    });

  it('authorizes the company and resolves the connected MF office without Organization.code', async () => {
    const response = await fetch(
      `${endpoint()}?fiscalYear=2026&mfCode=9999-9999`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      record: { recordId: '123', mfOfficeCode: '1234-5678' },
    });
    expect(assertOrgPermission).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'advisor' }),
      orgId,
      'org:mf:read',
    );
    expect(getOffice).toHaveBeenCalledWith(orgId);
    expect(getByMfOfficeCode).toHaveBeenCalledWith('1234-5678', '2026');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ orgId, source: 'KINTONE', status: 'SUCCESS' }),
    );
  });
  it('rejects another company before either external API is called', async () => {
    expect((await fetch(endpoint(otherOrg))).status).toBe(403);
    expect(getOffice).not.toHaveBeenCalled();
    expect(getByMfOfficeCode).not.toHaveBeenCalled();
  });
  it('rejects an unauthenticated caller before MF lookup', async () => {
    expect(
      (await fetch(endpoint(), { headers: { 'x-test-user': 'anonymous' } }))
        .status,
    ).toBe(401);
    expect(getOffice).not.toHaveBeenCalled();
  });
  it('returns a JSON envelope for a company without a progress record', async () => {
    getByMfOfficeCode.mockResolvedValue(null);
    const response = await fetch(endpoint());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ record: null });
  });
  it('does not fall back to arbitrary or client-supplied MF codes when disconnected', async () => {
    getOffice.mockResolvedValue({ code: null });
    expect((await fetch(`${endpoint()}?mfCode=9999-9999`)).status).toBe(503);
    expect(getByMfOfficeCode).not.toHaveBeenCalled();
  });
  it('rejects an invalid fiscal year before lookup', async () => {
    expect((await fetch(`${endpoint()}?fiscalYear=2026abc`)).status).toBe(400);
    expect(getOffice).not.toHaveBeenCalled();
  });
  it('updates only a record belonging to the authorized company and checks manage permission', async () => {
    expect((await put()).status).toBe(200);
    expect(assertOrgPermission).toHaveBeenCalledWith(
      expect.anything(),
      orgId,
      'org:monthly_close:manage',
    );
    expect(updateMonthlyStatus).toHaveBeenCalledWith('123', 8, '3.入力済');
  });
  it('rejects a record from another MF office', async () => {
    getRecordMfCode.mockResolvedValue('9999-9999');
    expect((await put()).status).toBe(403);
    expect(updateMonthlyStatus).not.toHaveBeenCalled();
  });
  it('rejects another organization before any update lookup', async () => {
    expect((await put({ org: otherOrg })).status).toBe(403);
    expect(getOffice).not.toHaveBeenCalled();
    expect(getRecordMfCode).not.toHaveBeenCalled();
    expect(updateMonthlyStatus).not.toHaveBeenCalled();
  });
  it('keeps client owners and read-only staff from editing kintone', async () => {
    expect((await put({ identity: 'client' })).status).toBe(403);
    expect((await put({ identity: 'read-only' })).status).toBe(403);
    expect(updateMonthlyStatus).not.toHaveBeenCalled();
  });
  it('rejects fractional months before calling kintone', async () => {
    expect((await put({ month: 1.5 })).status).toBe(400);
    expect(getOffice).not.toHaveBeenCalled();
    expect(updateMonthlyStatus).not.toHaveBeenCalled();
  });
});
