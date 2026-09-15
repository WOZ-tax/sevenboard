import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { AuthorizationService } from '../auth/authorization.service';
import { WithholdingTaxController } from './withholding-tax.controller';
import { WithholdingTaxService } from './withholding-tax.service';

describe('withholding review HTTP authorization', () => {
  const allowedOrg = '11111111-1111-4111-8111-111111111111';
  const otherOrg = '22222222-2222-4222-8222-222222222222';
  const review = jest.fn().mockResolvedValue({ status: 'NO_DATA' });
  const assertOrgPermission = jest.fn(async (_user, orgId, permission) => {
    if (orgId !== allowedOrg || permission !== 'org:withholding_tax:read')
      throw new ForbiddenException();
  });
  let app: INestApplication;
  let origin: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [WithholdingTaxController],
      providers: [
        PermissionGuard,
        { provide: WithholdingTaxService, useValue: { review } },
        { provide: AuthorizationService, useValue: { assertOrgPermission } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context) {
          context.switchToHttp().getRequest().user = { id: 'advisor' };
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
  });

  it('uses the existing organization read permission and passes the scoped org to the service', async () => {
    const response = await fetch(
      `${origin}/organizations/${allowedOrg}/withholding-tax/review?year=2026&half=1&checkDate=2026-07-10`,
    );
    expect(response.status).toBe(200);
    expect(assertOrgPermission).toHaveBeenCalledWith(
      { id: 'advisor' },
      allowedOrg,
      'org:withholding_tax:read',
    );
    expect(review).toHaveBeenCalledWith(allowedOrg, {
      year: 2026,
      half: 1,
      checkDate: '2026-07-10',
    });
  });

  it('rejects another organization before any MF review runs', async () => {
    const response = await fetch(
      `${origin}/organizations/${otherOrg}/withholding-tax/review?year=2026&half=1`,
    );
    expect(response.status).toBe(403);
    expect(review).not.toHaveBeenCalled();
  });
});
