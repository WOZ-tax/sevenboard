import {
  monthWindow,
  deriveCurrentBalance,
  deriveNextPayment,
  deriveCurrentRate,
  deriveTotals,
  DerivableLoan,
  DerivableEntry,
} from './loan-derive';

function e(
  seq: number,
  dueDate: string,
  principalAmount: number,
  interestAmount: number,
  balanceAfter: number,
  interestRate: number | null = null,
): DerivableEntry {
  return {
    seq,
    dueDate: new Date(`${dueDate}T00:00:00.000Z`),
    principalAmount,
    interestAmount,
    totalAmount: principalAmount + interestAmount,
    balanceAfter,
    interestRate,
  };
}

// 基準日: 2025-06-15 → 当月 = 2025-06
const NOW = new Date('2025-06-15T00:00:00.000Z');

describe('monthWindow', () => {
  it('computes month start/end and 12-month-ahead end in UTC', () => {
    const w = monthWindow(NOW);
    expect(w.monthStart.toISOString().slice(0, 10)).toBe('2025-06-01');
    expect(w.monthEnd.toISOString().slice(0, 10)).toBe('2025-06-30');
    expect(w.yearAheadEnd.toISOString().slice(0, 10)).toBe('2026-06-30');
  });
});

describe('deriveCurrentBalance', () => {
  const loan: DerivableLoan = {
    principal: 1_200_000,
    interestRate: 1.5,
    status: 'ACTIVE',
    entries: [
      e(1, '2025-04-30', 100_000, 1500, 1_100_000),
      e(2, '2025-05-31', 100_000, 1400, 1_000_000),
      e(3, '2025-06-30', 100_000, 1300, 900_000),
      e(4, '2025-07-31', 100_000, 1200, 800_000),
    ],
  };

  it('returns the balance of the latest row on/before month end', () => {
    const w = monthWindow(NOW);
    expect(deriveCurrentBalance(loan, w.monthEnd)).toBe(900_000);
  });

  it('returns principal when no row has occurred yet', () => {
    const w = monthWindow(NOW);
    const future: DerivableLoan = {
      ...loan,
      entries: [e(1, '2025-09-30', 100_000, 1500, 1_100_000)],
    };
    expect(deriveCurrentBalance(future, w.monthEnd)).toBe(1_200_000);
  });

  it('returns 0 for REPAID loans', () => {
    const w = monthWindow(NOW);
    expect(deriveCurrentBalance({ ...loan, status: 'REPAID' }, w.monthEnd)).toBe(0);
  });
});

describe('deriveNextPayment', () => {
  it('finds the first row after month end', () => {
    const w = monthWindow(NOW);
    const loan: DerivableLoan = {
      principal: 800_000,
      interestRate: 1.5,
      status: 'ACTIVE',
      entries: [
        e(3, '2025-06-30', 100_000, 1300, 700_000),
        e(4, '2025-07-31', 100_000, 1200, 600_000),
      ],
    };
    expect(deriveNextPayment(loan, w.monthEnd)).toEqual({
      dueDate: new Date('2025-07-31T00:00:00.000Z'),
      amount: 101_200,
    });
  });

  it('returns null when nothing is upcoming', () => {
    const w = monthWindow(NOW);
    const loan: DerivableLoan = {
      principal: 0,
      interestRate: null,
      status: 'ACTIVE',
      entries: [e(1, '2025-01-31', 100_000, 0, 0)],
    };
    expect(deriveNextPayment(loan, w.monthEnd)).toBeNull();
  });
});

describe('deriveCurrentRate', () => {
  const w = monthWindow(NOW);
  it('uses the current-month row rate when present', () => {
    const loan: DerivableLoan = {
      principal: 1_000_000,
      interestRate: 1.5,
      status: 'ACTIVE',
      entries: [e(1, '2025-06-30', 100_000, 1300, 900_000, 2.375)],
    };
    expect(deriveCurrentRate(loan, w)).toBe(2.375);
  });

  it('falls back to loan rate when the current-month row rate is null', () => {
    const loan: DerivableLoan = {
      principal: 1_000_000,
      interestRate: 1.5,
      status: 'ACTIVE',
      entries: [e(1, '2025-06-30', 100_000, 1300, 900_000, null)],
    };
    expect(deriveCurrentRate(loan, w)).toBe(1.5);
  });

  it('falls back to loan rate when there is no current-month row', () => {
    const loan: DerivableLoan = {
      principal: 1_000_000,
      interestRate: 1.5,
      status: 'ACTIVE',
      entries: [e(1, '2025-03-31', 100_000, 1300, 900_000, 3.0)],
    };
    expect(deriveCurrentRate(loan, w)).toBe(1.5);
  });
});

describe('deriveTotals', () => {
  it('aggregates ACTIVE loans only, over the correct windows', () => {
    const w = monthWindow(NOW);
    const active: DerivableLoan = {
      principal: 1_200_000,
      interestRate: 1.5,
      status: 'ACTIVE',
      entries: [
        e(2, '2025-05-31', 100_000, 1400, 1_000_000),
        e(3, '2025-06-30', 100_000, 1300, 900_000), // 当月
        e(4, '2025-07-31', 100_000, 1200, 800_000), // 今後12ヶ月
        e(5, '2026-06-30', 100_000, 200, 700_000), // 今後12ヶ月の末（含む）
        e(6, '2026-07-31', 100_000, 100, 600_000), // 12ヶ月超（除外）
      ],
    };
    const repaid: DerivableLoan = {
      principal: 500_000,
      interestRate: 2.0,
      status: 'REPAID',
      entries: [e(1, '2025-06-30', 500_000, 9999, 0)],
    };

    const totals = deriveTotals([active, repaid], w);
    expect(totals.outstandingBalance).toBe(900_000); // repaid は除外
    expect(totals.monthlyPayment).toBe(101_300);
    expect(totals.monthlyPrincipal).toBe(100_000);
    expect(totals.monthlyInterest).toBe(1300);
    // 今後12ヶ月: 2025-07(1200) + 2026-06(200) = 1400。2026-07 は範囲外
    expect(totals.annualInterestEstimate).toBe(1400);
  });
});
