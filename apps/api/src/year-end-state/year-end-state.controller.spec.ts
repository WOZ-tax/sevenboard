import {
  ForbiddenException,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import { AuthorizationService } from '../auth/authorization.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { PrismaService } from '../prisma/prisma.service';
import { YearEndStateController } from './year-end-state.controller';
import { YearEndStateService } from './year-end-state.service';

describe('nullable year-end state HTTP responses', () => {
  const orgId = '11111111-1111-4111-8111-111111111111';
  const otherOrg = '22222222-2222-4222-8222-222222222222';
  const tenantId = 'tenant-a';
  const organization = { findUniqueOrThrow: jest.fn() };
  const locabenState = { findFirst: jest.fn() };
  const featureState = { findFirst: jest.fn(), upsert: jest.fn() };
  const cases = [
    {
      route: 'locaben',
      table: locabenState,
      permission: 'org:locaben:read',
      where: { orgId, tenantId },
      stored: {
        values: { employeeCount: 0 },
        manualKeys: { employeeCount: true },
      },
    },
    {
      route: 'feature/locaben.source-overrides?scope=2026%3Afull',
      table: featureState,
      permission: 'org:feature_state:read',
      where: {
        orgId,
        tenantId,
        featureKey: 'locaben.source-overrides',
        scope: '2026:full',
      },
      stored: { value: { employeeCount: 0, revenueCurrent: null } },
    },
  ];
  const assertOrgPermission = jest.fn(async (_user, requestedOrg) => {
    if (requestedOrg !== orgId) throw new ForbiddenException();
  });
  let app: INestApplication;
  let origin: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [YearEndStateController],
      providers: [
        YearEndStateService,
        PermissionGuard,
        {
          provide: PrismaService,
          useValue: { organization, locabenState, featureState },
        },
        { provide: HttpService, useValue: {} },
        { provide: AuthorizationService, useValue: { assertOrgPermission } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context) {
          const req = context.switchToHttp().getRequest();
          if (req.headers['x-test-user'] === 'anonymous')
            throw new UnauthorizedException();
          req.user = { id: 'advisor' };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    jest.clearAllMocks();
    organization.findUniqueOrThrow.mockResolvedValue({ tenantId });
    locabenState.findFirst.mockResolvedValue(null);
    featureState.findFirst.mockResolvedValue(null);
  });

  it.each(['application/json', 'application/json, application/json'])(
    'rejects missing JSON value (%s) without reporting a false save',
    async (contentType) => {
      const response = await fetch(
        `${origin}/organizations/${orgId}/year-end-state/feature/budget.workflow`,
        {
          method: 'PUT',
          headers: { 'content-type': contentType },
          body: '{}',
        },
      );
      expect(response.status).toBe(400);
      expect(featureState.upsert).not.toHaveBeenCalled();
    },
  );

  it('persists a valid state including a manual zero', async () => {
    featureState.upsert.mockResolvedValue({
      id: 'saved',
      value: { profit: 0 },
    });
    const response = await fetch(
      `${origin}/organizations/${orgId}/year-end-state/feature/tax?scope=2026`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: { profit: 0 } }),
      },
    );
    expect(response.status).toBe(200);
    expect(featureState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { value: { profit: 0 }, updatedById: 'advisor' },
      }),
    );
  });

  describe.each(cases)(
    '$route',
    ({ route, table, where, stored, permission }) => {
      const url = (org = orgId) =>
        `${origin}/organizations/${org}/year-end-state/${route}`;

      it('returns parseable JSON null for an unsaved state, with no empty HTTP body', async () => {
        const response = await fetch(url());
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('null');
        expect(response.headers.get('content-type')).toContain(
          'application/json',
        );
        expect(table.findFirst).toHaveBeenCalledWith({ where });
        expect(assertOrgPermission).toHaveBeenCalledWith(
          { id: 'advisor' },
          orgId,
          permission,
        );
      });

      it('preserves a stored record, including explicit zero and null inputs', async () => {
        table.findFirst.mockResolvedValue(stored);
        const response = await fetch(url());
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(stored);
      });

      it('rejects an unauthenticated request before reading storage', async () => {
        const response = await fetch(url(), {
          headers: { 'x-test-user': 'anonymous' },
        });
        expect(response.status).toBe(401);
        expect(organization.findUniqueOrThrow).not.toHaveBeenCalled();
      });

      it('rejects another company before reading storage', async () => {
        expect((await fetch(url(otherOrg))).status).toBe(403);
        expect(organization.findUniqueOrThrow).not.toHaveBeenCalled();
      });

      it('does not turn a storage failure into an unsaved state', async () => {
        table.findFirst.mockRejectedValueOnce(new Error('storage unavailable'));
        const response = await fetch(url());
        expect(response.status).toBe(500);
        expect(await response.json()).toHaveProperty('statusCode', 500);
      });
    },
  );
});
