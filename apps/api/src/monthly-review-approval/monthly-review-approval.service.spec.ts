import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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
    orgScope: jest
      .fn()
      .mockResolvedValue({ tenantId: 'tenant-1', orgId: 'org-1' }),
    monthlyReviewApproval: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
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
        where: {
          tenantId_orgId_fiscalYear_month: {
            tenantId: 'tenant-1',
            orgId: 'org-1',
            fiscalYear: 2026,
            month: 3,
          },
        },
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
        where: { tenantId: 'tenant-1', orgId: 'org-1', fiscalYear: 2026 },
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
      expect(prisma.monthlyReviewApproval.create).not.toHaveBeenCalled();
      expect(prisma.monthlyReviewApproval.updateMany).not.toHaveBeenCalled();
    });

    it('creates a PENDING row when none exists', async () => {
      const prisma = createPrismaMock();
      prisma.monthlyReviewApproval.findUnique.mockResolvedValue(null);
      prisma.monthlyReviewApproval.create.mockResolvedValue(
        makeRow({ status: 'PENDING', comment: 'please review' }),
      );
      const svc = createService(prisma);
      const result = await svc.submit('org-1', 2026, 3, 'please review');
      expect(result.status).toBe('PENDING');
      expect(prisma.monthlyReviewApproval.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING', comment: 'please review' }),
        }),
      );
    });

    it('transitions DRAFT/REJECTED/PENDING → PENDING and clears approval metadata', async () => {
      const prisma = createPrismaMock();
      prisma.monthlyReviewApproval.findUnique
        .mockResolvedValueOnce(makeRow({ status: 'DRAFT' })) // existence check in submit
        .mockResolvedValueOnce(makeRow({ status: 'PENDING', comment: 'please review' })); // get() after update
      prisma.monthlyReviewApproval.updateMany.mockResolvedValue({ count: 1 });
      const svc = createService(prisma);
      const result = await svc.submit('org-1', 2026, 3, 'please review');
      expect(result.status).toBe('PENDING');
      expect(prisma.monthlyReviewApproval.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { in: ['DRAFT', 'PENDING', 'REJECTED'] } }),
          data: expect.objectContaining({ status: 'PENDING', approvedBy: null, approvedAt: null }),
        }),
      );
    });

    it('refuses to downgrade an APPROVED row (must reset first)', async () => {
      const prisma = createPrismaMock();
      prisma.monthlyReviewApproval.findUnique.mockResolvedValue(makeRow({ status: 'APPROVED' }));
      const svc = createService(prisma);
      await expect(svc.submit('org-1', 2026, 3)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.monthlyReviewApproval.create).not.toHaveBeenCalled();
      expect(prisma.monthlyReviewApproval.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('refuses to approve when the row does not exist (submit required first)', async () => {
      const prisma = createPrismaMock();
      prisma.monthlyReviewApproval.findUnique.mockResolvedValue(null);
      const svc = createService(prisma);
      await expect(svc.approve('org-1', 2026, 3, 'user-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.monthlyReviewApproval.updateMany).not.toHaveBeenCalled();
    });

    it('transitions PENDING → APPROVED and preserves prior comment when not provided', async () => {
      const prisma = createPrismaMock();
      prisma.monthlyReviewApproval.findUnique
        .mockResolvedValueOnce(makeRow({ status: 'PENDING', comment: 'prior note' })) // existence check
        .mockResolvedValueOnce(
          makeRow({ status: 'APPROVED', approvedBy: 'user-1', approvedAt: new Date(), comment: 'prior note' }),
        ); // get() after update
      prisma.monthlyReviewApproval.updateMany.mockResolvedValue({ count: 1 });
      const svc = createService(prisma);
      const result = await svc.approve('org-1', 2026, 3, 'user-1');
      expect(result.status).toBe('APPROVED');
      expect(result.comment).toBe('prior note');
      expect(prisma.monthlyReviewApproval.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING' }),
          data: expect.objectContaining({ status: 'APPROVED', approvedBy: 'user-1' }),
        }),
      );
    });

    it('refuses to approve a non-PENDING row (already approved/rejected)', async () => {
      const prisma = createPrismaMock();
      prisma.monthlyReviewApproval.findUnique.mockResolvedValue(makeRow({ status: 'APPROVED' }));
      prisma.monthlyReviewApproval.updateMany.mockResolvedValue({ count: 0 });
      const svc = createService(prisma);
      await expect(svc.approve('org-1', 2026, 3, 'user-1')).rejects.toBeInstanceOf(
        ConflictException,
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

    it('transitions PENDING → REJECTED with reviewer info', async () => {
      const prisma = createPrismaMock();
      prisma.monthlyReviewApproval.findUnique
        .mockResolvedValueOnce(makeRow({ status: 'PENDING' })) // existence check
        .mockResolvedValueOnce(
          makeRow({ status: 'REJECTED', approvedBy: 'user-2', approvedAt: new Date(), comment: 'needs revisions' }),
        ); // get() after update
      prisma.monthlyReviewApproval.updateMany.mockResolvedValue({ count: 1 });
      const svc = createService(prisma);
      const result = await svc.reject('org-1', 2026, 3, 'user-2', 'needs revisions');
      expect(result.status).toBe('REJECTED');
      expect(result.comment).toBe('needs revisions');
      expect(prisma.monthlyReviewApproval.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING' }),
          data: expect.objectContaining({ status: 'REJECTED', approvedBy: 'user-2' }),
        }),
      );
    });

    it('refuses to reject a non-PENDING row', async () => {
      const prisma = createPrismaMock();
      prisma.monthlyReviewApproval.findUnique.mockResolvedValue(makeRow({ status: 'APPROVED' }));
      prisma.monthlyReviewApproval.updateMany.mockResolvedValue({ count: 0 });
      const svc = createService(prisma);
      await expect(svc.reject('org-1', 2026, 3, 'user-2')).rejects.toBeInstanceOf(
        ConflictException,
      );
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
