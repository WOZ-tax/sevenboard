import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MonthlyReviewApprovalService } from './monthly-review-approval.service';

type ApprovalRow = {
  id: string;
  orgId: string;
  fiscalYear: number;
  month: number;
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedBy: string | null;
  approvedAt: Date | null;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function makeRow(overrides: Partial<ApprovalRow> = {}): ApprovalRow {
  const now = new Date('2026-04-21T12:00:00Z');
  return {
    id: 'row-1',
    orgId: 'org-1',
    fiscalYear: 2026,
    month: 3,
    status: 'DRAFT',
    approvedBy: null,
    approvedAt: null,
    comment: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createPrismaMock() {
  return {
    monthlyReviewApproval: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new MonthlyReviewApprovalService(prisma as unknown as never);
}

describe('MonthlyReviewApprovalService', () => {
  describe('get', () => {
    it('returns null when no row exists', async () => {
      const prisma = createPrismaMock();
      prisma.monthlyReviewApproval.findUnique.mockResolvedValue(null);
      const svc = createService(prisma);
      const result = await svc.get('org-1', 2026, 3);
      expect(result).toBeNull();
      expect(prisma.monthlyReviewApproval.findUnique).toHaveBeenCalledWith({
        where: { orgId_fiscalYear_month: { orgId: 'org-1', fiscalYear: 2026, month: 3 } },
      });
    });

    it('serializes dates as ISO strings', async () => {
      const prisma = createPrismaMock();
      const approvedAt = new Date('2026-04-22T09:00:00Z');
      prisma.monthlyReviewApproval.findUnique.mockResolvedValue(
        makeRow({ status: 'APPROVED', approvedBy: 'user-9', approvedAt, comment: 'ok' }),
      );
      const svc = createService(prisma);
      const result = await svc.get('org-1', 2026, 3);
      expect(result?.status).toBe('APPROVED');
      expect(result?.approvedBy).toBe('user-9');
      expect(result?.approvedAt).toBe(approvedAt.toISOString());
      expect(result?.comment).toBe('ok');
    });
  });

  describe('list', () => {
    it('orders by month ascending', async () => {
      const prisma = createPrismaMock();
      prisma.monthlyReviewApproval.findMany.mockResolvedValue([makeRow({ month: 1 }), makeRow({ month: 2 })]);
      const svc = createService(prisma);
      await svc.list('org-1', 2026);
      expect(prisma.monthlyReviewApproval.findMany).toHaveBeenCalledWith({
        where: { orgId: 'org-1', fiscalYear: 2026 },
        orderBy: { month: 'asc' },
      });
    });
  });

  describe('submit', () => {
    it('rejects months outside 1-12', async () => {
      const prisma = createPrismaMock();
      const svc = createService(prisma);
      await expect(svc.submit('org-1', 2026, 0)).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.submit('org-1', 2026, 13)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.monthlyReviewApproval.upsert).not.toHaveBeenCalled();
    });

    it('upserts with PENDING status and clears approvedBy/approvedAt', async () => {
      const prisma = createPrismaMock();
      prisma.monthlyReviewApproval.upsert.mockResolvedValue(
        makeRow({ status: 'PENDING', comment: 'please review' }),
      );
      const svc = createService(prisma);
      const result = await svc.submit('org-1', 2026, 3, 'please review');
      expect(result.status).toBe('PENDING');
      expect(prisma.monthlyReviewApproval.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ status: 'PENDING', approvedBy: null, approvedAt: null }),
          create: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
    });
  });

  describe('approve', () => {
    it('creates a new approval row when none exists', async () => {
      const prisma = createPrismaMock();
      prisma.monthlyReviewApproval.findUnique.mockResolvedValue(null);
      prisma.monthlyReviewApproval.create.mockResolvedValue(
        makeRow({ status: 'APPROVED', approvedBy: 'user-1', approvedAt: new Date() }),
      );
      const svc = createService(prisma);
      const result = await svc.approve('org-1', 2026, 3, 'user-1');
      expect(result.status).toBe('APPROVED');
      expect(prisma.monthlyReviewApproval.create).toHaveBeenCalled();
      expect(prisma.monthlyReviewApproval.update).not.toHaveBeenCalled();
    });

    it('updates existing row, preserves prior comment when not provided', async () => {
      const prisma = createPrismaMock();
      prisma.monthlyReviewApproval.findUnique.mockResolvedValue(
        makeRow({ status: 'PENDING', comment: 'prior note' }),
      );
      prisma.monthlyReviewApproval.update.mockResolvedValue(
        makeRow({ status: 'APPROVED', approvedBy: 'user-1', approvedAt: new Date(), comment: 'prior note' }),
      );
      const svc = createService(prisma);
      const result = await svc.approve('org-1', 2026, 3, 'user-1');
      expect(result.status).toBe('APPROVED');
      expect(result.comment).toBe('prior note');
      expect(prisma.monthlyReviewApproval.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'APPROVED', approvedBy: 'user-1', comment: 'prior note' }),
        }),
      );
    });
  });

  describe('reject', () => {
    it('throws when no row exists', async () => {
      const prisma = createPrismaMock();
      prisma.monthlyReviewApproval.findUnique.mockResolvedValue(null);
      const svc = createService(prisma);
      await expect(svc.reject('org-1', 2026, 3, 'user-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates to REJECTED with reviewer info', async () => {
      const prisma = createPrismaMock();
      prisma.monthlyReviewApproval.findUnique.mockResolvedValue(makeRow({ status: 'PENDING' }));
      prisma.monthlyReviewApproval.update.mockResolvedValue(
        makeRow({ status: 'REJECTED', approvedBy: 'user-2', approvedAt: new Date(), comment: 'needs revisions' }),
      );
      const svc = createService(prisma);
      const result = await svc.reject('org-1', 2026, 3, 'user-2', 'needs revisions');
      expect(result.status).toBe('REJECTED');
      expect(result.comment).toBe('needs revisions');
    });
  });

  describe('reset', () => {
    it('returns null when no row exists (idempotent)', async () => {
      const prisma = createPrismaMock();
      prisma.monthlyReviewApproval.findUnique.mockResolvedValue(null);
      const svc = createService(prisma);
      const result = await svc.reset('org-1', 2026, 3);
      expect(result).toBeNull();
      expect(prisma.monthlyReviewApproval.update).not.toHaveBeenCalled();
    });

    it('clears approval metadata back to DRAFT', async () => {
      const prisma = createPrismaMock();
      prisma.monthlyReviewApproval.findUnique.mockResolvedValue(
        makeRow({ status: 'APPROVED', approvedBy: 'user-1', approvedAt: new Date() }),
      );
      prisma.monthlyReviewApproval.update.mockResolvedValue(makeRow({ status: 'DRAFT' }));
      const svc = createService(prisma);
      const result = await svc.reset('org-1', 2026, 3);
      expect(result?.status).toBe('DRAFT');
      expect(prisma.monthlyReviewApproval.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'DRAFT', approvedBy: null, approvedAt: null },
        }),
      );
    });
  });
});
