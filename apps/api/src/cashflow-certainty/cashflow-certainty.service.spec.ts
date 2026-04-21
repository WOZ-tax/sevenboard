import { CashflowCertaintyService } from './cashflow-certainty.service';

function createPrismaMock() {
  return {
    organization: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new CashflowCertaintyService(prisma as unknown as never);
}

describe('CashflowCertaintyService', () => {
  describe('get', () => {
    it('returns empty object when org has no rules', async () => {
      const prisma = createPrismaMock();
      prisma.organization.findUnique.mockResolvedValue({ cashflowCertainty: null });
      const svc = createService(prisma);
      await expect(svc.get('org-1')).resolves.toEqual({});
    });

    it('returns empty object when org is missing', async () => {
      const prisma = createPrismaMock();
      prisma.organization.findUnique.mockResolvedValue(null);
      const svc = createService(prisma);
      await expect(svc.get('org-1')).resolves.toEqual({});
    });

    it('normalizes to upper-case enum values', async () => {
      const prisma = createPrismaMock();
      prisma.organization.findUnique.mockResolvedValue({
        cashflowCertainty: { a: 'confirmed', b: 'Planned', c: 'ESTIMATED' },
      });
      const svc = createService(prisma);
      await expect(svc.get('org-1')).resolves.toEqual({
        a: 'CONFIRMED',
        b: 'PLANNED',
        c: 'ESTIMATED',
      });
    });

    it('drops invalid enum values and non-string entries', async () => {
      const prisma = createPrismaMock();
      prisma.organization.findUnique.mockResolvedValue({
        cashflowCertainty: { valid: 'confirmed', bad: 'unknown', numeric: 42, nested: { x: 1 } },
      });
      const svc = createService(prisma);
      await expect(svc.get('org-1')).resolves.toEqual({ valid: 'CONFIRMED' });
    });

    it('ignores array-shaped rules', async () => {
      const prisma = createPrismaMock();
      prisma.organization.findUnique.mockResolvedValue({ cashflowCertainty: ['CONFIRMED'] });
      const svc = createService(prisma);
      await expect(svc.get('org-1')).resolves.toEqual({});
    });
  });

  describe('replace', () => {
    it('writes rules to the organization row', async () => {
      const prisma = createPrismaMock();
      prisma.organization.update.mockResolvedValue({});
      const svc = createService(prisma);
      const rules = { sales: 'CONFIRMED' as const, rent: 'PLANNED' as const };
      await expect(svc.replace('org-1', rules)).resolves.toEqual(rules);
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { cashflowCertainty: rules },
      });
    });
  });
});
