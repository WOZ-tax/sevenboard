import {
  validateLoanSchedule,
  LoanDraft,
  LoanDraftEntry,
} from './loan-schedule-validator';

function entry(partial: Partial<LoanDraftEntry> & { seq: number }): LoanDraftEntry {
  return {
    dueDate: '2025-01-31',
    principalAmount: 0,
    interestAmount: 0,
    totalAmount: 0,
    balanceAfter: 0,
    ...partial,
  };
}

/**
 * 元金均等・期首から始まる正常な予定表を組み立てる。
 * principal を termMonths 回で等分し、最終行で残高 0 に着地させる。
 */
function buildNormalSchedule(
  principal: number,
  monthlyPrincipal: number,
  months: number,
): LoanDraft {
  const entries: LoanDraftEntry[] = [];
  let balance = principal;
  for (let i = 0; i < months; i++) {
    const isLast = i === months - 1;
    const principalAmount = isLast ? balance : monthlyPrincipal;
    const interestAmount = 1000;
    balance -= principalAmount;
    const month = String((i % 12) + 1).padStart(2, '0');
    const year = 2025 + Math.floor(i / 12);
    entries.push(
      entry({
        seq: i + 1,
        dueDate: `${year}-${month}-28`,
        principalAmount,
        interestAmount,
        totalAmount: principalAmount + interestAmount,
        balanceAfter: balance,
      }),
    );
  }
  return { loan: { principal, repaymentMethod: 'EQUAL_PRINCIPAL' }, entries };
}

describe('validateLoanSchedule', () => {
  it('accepts a normal fully-amortizing schedule', () => {
    const draft = buildNormalSchedule(1_200_000, 100_000, 12);
    const report = validateLoanSchedule(draft);
    expect(report.ok).toBe(true);
    expect(report.rowIssues).toHaveLength(0);
    expect(report.globalIssues).toHaveLength(0);
  });

  it('treats an empty schedule as ok (basic-info-only entry)', () => {
    const report = validateLoanSchedule({ loan: { principal: 1_000_000 }, entries: [] });
    expect(report.ok).toBe(true);
  });

  it('flags ROW_SUM when total != principal + interest', () => {
    const draft = buildNormalSchedule(1_200_000, 100_000, 12);
    draft.entries[2].totalAmount += 500; // 破壊
    const report = validateLoanSchedule(draft);
    expect(report.ok).toBe(false);
    expect(report.rowIssues).toEqual([
      expect.objectContaining({ seq: 3, code: 'ROW_SUM' }),
    ]);
  });

  it('flags BALANCE_CHAIN when the running balance breaks', () => {
    const draft = buildNormalSchedule(1_200_000, 100_000, 12);
    draft.entries[4].balanceAfter += 10_000; // 鎖が切れる
    const report = validateLoanSchedule(draft);
    const chainIssues = report.rowIssues.filter((r) => r.code === 'BALANCE_CHAIN');
    // 当行(seq5)と次行(seq6)の両方で鎖が崩れる
    expect(chainIssues.map((r) => r.seq)).toContain(5);
    expect(report.ok).toBe(false);
  });

  it('accepts a mid-term schedule where the first row balance < principal', () => {
    // principal 10,000,000 だが予定表は残高 6,000,000 の期中から始まる（SMBC 実例パターン）
    const entries: LoanDraftEntry[] = [];
    let balance = 6_000_000;
    for (let i = 0; i < 6; i++) {
      const isLast = i === 5;
      const principalAmount = isLast ? balance : 1_000_000;
      balance -= principalAmount;
      entries.push(
        entry({
          seq: i + 10,
          dueDate: `2025-0${i + 1}-28`,
          principalAmount,
          interestAmount: 500,
          totalAmount: principalAmount + 500,
          balanceAfter: balance,
        }),
      );
    }
    const report = validateLoanSchedule({
      loan: { principal: 10_000_000, repaymentMethod: 'EQUAL_PRINCIPAL' },
      entries,
    });
    expect(report.ok).toBe(true);
  });

  it('flags BALANCE_CHAIN on the first row when balance + principal exceeds principal total', () => {
    const entries: LoanDraftEntry[] = [
      entry({
        seq: 1,
        dueDate: '2025-01-28',
        principalAmount: 500_000,
        interestAmount: 1000,
        totalAmount: 501_000,
        balanceAfter: 9_800_000, // 9.8M + 0.5M = 10.3M > 10M
      }),
      entry({
        seq: 2,
        dueDate: '2025-02-28',
        principalAmount: 9_800_000,
        interestAmount: 1000,
        totalAmount: 9_801_000,
        balanceAfter: 0,
      }),
    ];
    const report = validateLoanSchedule({ loan: { principal: 10_000_000 }, entries });
    expect(report.rowIssues.some((r) => r.seq === 1 && r.code === 'BALANCE_CHAIN')).toBe(
      true,
    );
  });

  it('flags FINAL_BALANCE when the last row does not reach zero', () => {
    const draft = buildNormalSchedule(1_200_000, 100_000, 12);
    draft.entries[11].principalAmount -= 50_000;
    draft.entries[11].totalAmount -= 50_000;
    draft.entries[11].balanceAfter = 50_000; // 0 に着地しない
    const report = validateLoanSchedule(draft);
    expect(report.globalIssues).toEqual([
      expect.objectContaining({ code: 'FINAL_BALANCE' }),
    ]);
    expect(report.ok).toBe(false);
  });

  it('flags DATE_ORDER when a due date goes backwards', () => {
    const draft = buildNormalSchedule(1_200_000, 100_000, 12);
    draft.entries[3].dueDate = '2024-01-28'; // 前行より過去
    const report = validateLoanSchedule(draft);
    expect(report.rowIssues.some((r) => r.seq === 4 && r.code === 'DATE_ORDER')).toBe(true);
    expect(report.ok).toBe(false);
  });

  it('accepts a bullet (期日一括) schedule: interest-only rows then full principal at maturity', () => {
    const principal = 5_000_000;
    const entries: LoanDraftEntry[] = [];
    for (let i = 0; i < 5; i++) {
      // 利息のみ行（principal=0、残高不変）
      entries.push(
        entry({
          seq: i + 1,
          dueDate: `2025-0${i + 1}-28`,
          principalAmount: 0,
          interestAmount: 8000,
          totalAmount: 8000,
          balanceAfter: principal,
        }),
      );
    }
    // 最終回で全額償還
    entries.push(
      entry({
        seq: 6,
        dueDate: '2025-06-28',
        principalAmount: principal,
        interestAmount: 8000,
        totalAmount: principal + 8000,
        balanceAfter: 0,
      }),
    );
    const report = validateLoanSchedule({
      loan: { principal, repaymentMethod: 'BULLET' },
      entries,
    });
    expect(report.ok).toBe(true);
  });

  it('accepts interest-only rows (principal=0) within an amortizing schedule', () => {
    const entries: LoanDraftEntry[] = [
      entry({
        seq: 1,
        dueDate: '2025-01-28',
        principalAmount: 0,
        interestAmount: 2000,
        totalAmount: 2000,
        balanceAfter: 3_000_000,
      }),
      entry({
        seq: 2,
        dueDate: '2025-02-28',
        principalAmount: 3_000_000,
        interestAmount: 2000,
        totalAmount: 3_002_000,
        balanceAfter: 0,
      }),
    ];
    const report = validateLoanSchedule({ loan: { principal: 3_000_000 }, entries });
    expect(report.ok).toBe(true);
  });
});
