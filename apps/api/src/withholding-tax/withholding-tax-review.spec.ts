import {
  buildWithholdingTaxReview,
  withholdingReviewDefaultCheckDate,
} from './withholding-tax-review';
import type { MfTrialBalance } from '../mf/types/mf-api.types';
import type {
  WithholdingTaxJournalInput,
  WithholdingTaxJournalSide,
} from './withholding-tax.types';

const tax = (
  amount: number,
  subAccountName = '源泉所得税',
): WithholdingTaxJournalSide => ({
  accountName: '預り金',
  subAccountName,
  amount,
});
const cash = (amount: number) => ({ accountName: '普通預金', amount });
const journal = (
  id: string,
  date: string,
  debits: WithholdingTaxJournalSide[],
  credits: WithholdingTaxJournalSide[],
  memo = '',
): WithholdingTaxJournalInput => ({
  id,
  date,
  number: id,
  debits,
  credits,
  memo,
  partnerName: 'テスト従業員',
});
const salary = (amount = 100, date = '2026-06-25', sub?: string) =>
  journal(
    `salary-${date}-${sub ?? ''}`,
    date,
    [{ accountName: '給料手当', amount: 10_000 }],
    [tax(amount, sub), cash(10_000 - amount)],
    '給与支給',
  );
const payment = (amount = 100, date = '2026-07-10', sub?: string) =>
  journal(
    `payment-${date}-${sub ?? ''}`,
    date,
    [tax(amount, sub)],
    [cash(amount)],
    '源泉所得税 納付',
  );

function trial(
  balances: Array<[string, number | null]> = [['源泉所得税', 100]],
  endDate = '2026-06-30',
): MfTrialBalance {
  return {
    report_type: 'trial_balance_bs',
    start_date: endDate.endsWith('12-31')
      ? `${endDate.slice(0, 4)}-07-01`
      : `${endDate.slice(0, 4)}-01-01`,
    end_date: endDate,
    columns: [
      'opening_balance',
      'debit_amount',
      'credit_amount',
      'closing_balance',
      'ratio',
    ],
    rows: [
      {
        name: '流動負債',
        type: 'liabilities',
        values: [],
        rows: [
          {
            name: '預り金',
            type: 'account',
            values: [0, 0, 0, 999_999],
            rows: balances.map(([name, balance]) => ({
              name,
              type: 'account',
              values: [0, 0, 0, balance],
              rows: null,
            })),
          },
        ],
      },
    ],
  };
}

const coverage = {
  ranges: [{ startDate: '2025-12-01', endDate: '2026-07-10' }],
  complete: true,
  truncated: false,
};
function review(
  overrides: Partial<Parameters<typeof buildWithholdingTaxReview>[0]> = {},
) {
  return buildWithholdingTaxReview({
    year: 2026,
    half: 1,
    checkDate: '2026-07-10',
    today: '2026-09-15',
    journals: [salary(), payment()],
    trialBalance: trial(),
    coverage,
    ...overrides,
  });
}

describe('withholding payment review', () => {
  it('bridges carried refunds, in-period payments and deferred wages without manufacturing a zero', () => {
    const closing = trial([
      ['所得税(給与)', 587_090],
      ['所得税(報酬)', 13_170],
    ]);
    closing.rows[0].rows![0].rows![0].values[0] = -76_264;
    const wage = (amount: number, date: string) =>
      journal(
        `wage-${date}`,
        date,
        [{ accountName: '給料賃金', amount: amount + 1_000_000 }],
        [tax(amount, '所得税(給与)'), cash(1_000_000)],
        '給与計上',
      );
    const prior = wage(149_270, '2025-12-31');
    prior.credits[1] = { accountName: '未払給与', amount: 1_000_000 };
    const deferred = wage(188_320, '2026-06-30');
    deferred.credits[1] = { accountName: '未払給与', amount: 1_000_000 };
    const wages = wage(996_494, '2026-05-31');
    const fee = journal(
      'fee',
      '2026-06-05',
      [{ accountName: '支払報酬', amount: 700_000 }],
      [tax(64_013, '所得税(報酬)'), cash(635_987)],
      '税理士報酬 / 源泉所得税 預り',
    );
    const result = review({
      trialBalance: closing,
      journals: [
        prior,
        wages,
        deferred,
        fee,
        {
          ...journal(
            'opening',
            '2026-01-01',
            [tax(76_264, '所得税(給与)')],
            [],
            '',
          ),
          isOpening: true,
        },
        journal(
          'offset',
          '2026-01-30',
          [tax(5_819, '所得税(報酬)')],
          [tax(5_819, '所得税(給与)')],
          '年調還付分 振替',
        ),
        payment(527_279, '2026-05-07', '所得税(給与)'),
        payment(45_024, '2026-05-07', '所得税(報酬)'),
        payment(179_070, '2026-07-03', '所得税(給与)'),
        payment(5_819, '2026-07-03', '所得税(報酬)'),
      ],
    });
    expect(result.totals).toMatchObject({
      openingBalance: -76_264,
      aggregatedTax: 1_209_777,
      priorAccrualTax: 149_270,
      periodPayments: 572_303,
      deferredTax: 188_320,
      periodEndBalance: 600_260,
      balanceDifference: 0,
      payments: 184_889,
      remainingBalance: 227_051,
    });
    expect(result.accounts.map((a) => a.remainingBalance)).toEqual([
      219_700, 7_351,
    ]);
    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.details.some((d) => d.kind === 'OPENING')).toBe(true);
    expect(result.issues.join(' ')).not.toContain('用途を特定できない');
    expect(result.issues.join(' ')).not.toContain('集計と半期末残高に差');
  });

  it('accounts for monthly payments before the half-year end', () => {
    const result = review({
      journals: [salary(300), payment(200, '2026-06-28'), payment(100)],
    });
    expect(result.totals.periodPayments).toBe(200);
    expect(result.totals.balanceDifference).toBe(0);
    expect(result.status).toBe('CLEARED');
  });

  it('uses the prior closing balance when the accounting year does not start with the half-year', () => {
    const closing = trial([['源泉所得税', 120]]);
    closing.start_date = '2026-04-01';
    const result = review({
      trialBalance: closing,
      openingTrialBalance: trial([['源泉所得税', 20]], '2025-12-31'),
      journals: [salary(), payment(120)],
    });
    expect(result.totals.openingBalance).toBe(20);
    expect(result.totals.balanceDifference).toBe(0);
    expect(result.status).toBe('CLEARED');
    expect(review({ trialBalance: closing }).status).toBe('REVIEW_REQUIRED');
  });

  it('starts weekend confirmation dates on the following weekday', () => {
    expect(withholdingReviewDefaultCheckDate(2027, 1)).toBe('2027-07-12');
    expect(withholdingReviewDefaultCheckDate(2023, 2)).toBe('2024-01-22');
  });

  it('holds a payment explicitly labelled for the other half-year', () => {
    const paid = payment();
    paid.memo = '源泉所得税 7月分 納付';
    expect(review({ journals: [salary(), paid] }).status).toBe(
      'REVIEW_REQUIRED',
    );
  });
  it('reconciles half-year withholding, the actual BS subaccount and July remittance', () => {
    const result = review();
    expect(result.status).toBe('CLEARED');
    expect(result.issues).toEqual([]);
    expect(result.totals).toMatchObject({
      aggregatedTax: 100,
      periodEndBalance: 100,
      payments: 100,
      bookBalance: 0,
      remainingBalance: 0,
      balanceDifference: 0,
    });
    expect(result.details.map((row) => row.kind)).toEqual([
      'WITHHOLDING',
      'PAYMENT',
    ]);
  });

  it.each([
    [80, 'BALANCE_REMAINING', 20],
    [0, 'BALANCE_REMAINING', 100],
    [110, 'OVERPAID', -10],
  ] as const)('detects a remittance of %i', (amount, status, remaining) => {
    const result = review({
      journals: amount ? [salary(), payment(amount)] : [salary()],
    });
    expect(result.status).toBe(status);
    expect(result.totals.remainingBalance).toBe(remaining);
  });

  it('keeps July withholding, resident tax and social insurance separate', () => {
    const nextSalary = salary(30, '2026-07-05');
    nextSalary.credits.push(tax(20, '住民税'), tax(50, '社会保険料'));
    const residentPayment = journal(
      'resident',
      '2026-07-10',
      [tax(200, '住民税')],
      [cash(200)],
      '住民税納付',
    );
    const result = review({
      journals: [salary(), nextSalary, payment(), residentPayment],
      trialBalance: trial([
        ['源泉所得税', 100],
        ['住民税', 200],
        ['社会保険料', 400],
      ]),
    });
    expect(result.status).toBe('CLEARED');
    expect(result.totals).toMatchObject({
      aggregatedTax: 100,
      payments: 100,
      nextPeriodTax: 30,
      bookBalance: 30,
      remainingBalance: 0,
    });
    expect(result.accounts).toHaveLength(1);
  });

  it('uses January of the next calendar year and subtracts year-end refunds', () => {
    const result = review({
      half: 2,
      checkDate: '2027-01-20',
      today: '2027-01-21',
      trialBalance: trial([['源泉所得税', 100]], '2026-12-31'),
      journals: [
        salary(120, '2026-12-25'),
        journal('refund', '2026-12-31', [tax(20)], [cash(20)], '年末調整 還付'),
        salary(30, '2027-01-15'),
        payment(100, '2027-01-20'),
      ],
    });
    expect(result.nominalDueDate).toBe('2027-01-20');
    expect(result.status).toBe('CLEARED');
    expect(result.totals).toMatchObject({
      aggregatedTax: 120,
      adjustments: -20,
      payments: 100,
      nextPeriodTax: 30,
      bookBalance: 30,
      remainingBalance: 0,
    });
  });

  it('handles year-end additional withholding and zero payment after a full refund', () => {
    const extra = journal(
      'extra',
      '2026-06-29',
      [cash(20)],
      [tax(20)],
      '年末調整 追加徴収',
    );
    expect(
      review({
        journals: [salary(), extra, payment(120)],
        trialBalance: trial([['源泉所得税', 120]]),
      }).status,
    ).toBe('CLEARED');
    const refund = journal(
      'refund',
      '2026-06-29',
      [tax(100)],
      [cash(100)],
      '年末調整 還付',
    );
    const result = review({
      journals: [salary(), refund],
      trialBalance: trial([['源泉所得税', 0]]),
    });
    expect(result.status).toBe('CLEARED');
    expect(result.totals.payments).toBe(0);
  });

  it('does not cancel a debit balance in one subaccount against another liability', () => {
    const result = review({
      journals: [
        salary(100, '2026-06-25', '源泉所得税 給与'),
        salary(100, '2026-06-25', '源泉所得税 役員'),
        payment(90, '2026-07-10', '源泉所得税 給与'),
        payment(110, '2026-07-10', '源泉所得税 役員'),
      ],
      trialBalance: trial([
        ['源泉所得税 給与', 100],
        ['源泉所得税 役員', 100],
      ]),
    });
    expect(result.totals.remainingBalance).toBe(0);
    expect(result.status).toBe('OVERPAID');
    expect(result.accounts.map((row) => row.remainingBalance)).toEqual([
      10, -10,
    ]);
  });

  it.each([
    { coverage: { ...coverage, truncated: true } },
    { coverage: { ...coverage, complete: false } },
    { trialBalance: null },
    { trialBalance: trial([['源泉所得税', null]]) },
    { trialBalance: trial([['源泉所得税', 100]], '2026-05-31') },
    { trialBalance: trial([]) },
  ])(
    'never declares a match with missing or incomplete evidence: %p',
    (input) => {
      const result = review(input);
      expect(result.status).toBe('REVIEW_REQUIRED');
      expect(result.issues.length).toBeGreaterThan(0);
    },
  );

  it('does not assume an unlabelled 預り金 balance is all income tax', () => {
    const data = trial();
    data.rows[0].rows![0].rows = null;
    const result = review({ trialBalance: data });
    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.totals.remainingBalance).toBeNull();
  });

  it('detects carried balances even if a payment happens to reduce the whole account to zero', () => {
    const result = review({
      trialBalance: trial([['源泉所得税', 120]]),
      journals: [salary(), payment(120)],
    });
    expect(result.totals).toMatchObject({
      balanceDifference: 20,
      remainingBalance: 0,
    });
    expect(result.status).toBe('REVIEW_REQUIRED');
  });

  it('includes split remittances through the selected confirmation date only', () => {
    const result = review({
      journals: [
        salary(),
        payment(40, '2026-07-05'),
        payment(60, '2026-07-10'),
        payment(500, '2026-07-11'),
      ],
    });
    expect(result.status).toBe('CLEARED');
    expect(result.totals.payments).toBe(100);
  });

  it('allows a changed check date and does not count future-dated remittances', () => {
    expect(
      review({
        checkDate: '2026-07-13',
        journals: [salary(), payment(100, '2026-07-13')],
      }).status,
    ).toBe('CLEARED');
    const result = review({
      today: '2026-07-08',
      journals: [salary(), payment()],
    });
    expect(result.checkedThroughDate).toBe('2026-07-08');
    expect(result.totals.payments).toBe(0);
    expect(result.status).toBe('BALANCE_REMAINING');
  });

  it('shows ongoing periods and no activity without reporting paid', () => {
    expect(review({ today: '2026-06-30' }).status).toBe('NOT_READY');
    expect(
      review({ journals: [], trialBalance: trial([['源泉所得税', 0]]) }).status,
    ).toBe('NO_DATA');
  });

  it('holds inferred payment dates at half-year boundaries for review', () => {
    const unpaid = salary(100, '2025-12-31');
    unpaid.credits[1] = { accountName: '未払給与', amount: 9_900 };
    const result = review({ journals: [unpaid, payment()] });
    expect(result.totals.aggregatedTax).toBe(100);
    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.issues.join(' ')).toContain('支払月');
    expect(result.details.some((row) => row.date === '2025-12-31')).toBe(true);
  });

  it('separates unpaid June tax from the H1 balance and keeps the inferred date under review', () => {
    const unpaid = salary();
    unpaid.credits[1] = { accountName: '未払給与', amount: 9_900 };
    const result = review({ journals: [unpaid, payment()] });
    expect(result.totals.aggregatedTax).toBe(0);
    expect(result.totals.deferredTax).toBe(100);
    expect(result.totals.balanceDifference).toBe(0);
    expect(result.status).toBe('REVIEW_REQUIRED');
  });

  it('does not automatically treat generic outsourcing or manuscript fees as semiannual tax', () => {
    for (const source of ['業務委託料', '原稿料']) {
      const fee = salary();
      fee.memo = source;
      fee.debits[0].accountName = source;
      const result = review({ journals: [fee, payment()] });
      expect(result.status).toBe('REVIEW_REQUIRED');
      expect(result.issues.join(' ')).toContain('納期の特例');
    }
  });

  it('can match clearly identified eligible professional withholding', () => {
    const fee = salary();
    fee.memo = '税理士 顧問報酬';
    fee.debits[0].accountName = '支払報酬';
    expect(review({ journals: [fee, payment()] }).status).toBe('CLEARED');
  });

  it('does not call a transfer, refund or insufficient bank payment a remittance', () => {
    const transfer = journal(
      'transfer',
      '2026-07-10',
      [tax(100)],
      [{ accountName: '未払金', amount: 100 }],
      '源泉所得税 納付振替',
    );
    const result = review({ journals: [salary(), transfer] });
    expect(result.totals).toMatchObject({
      payments: 0,
      otherMovements: -100,
      remainingBalance: 0,
    });
    expect(result.status).toBe('REVIEW_REQUIRED');
    const paid = payment();
    paid.credits = [cash(1), { accountName: '未払金', amount: 99 }];
    expect(review({ journals: [salary(), paid] }).status).toBe(
      'REVIEW_REQUIRED',
    );
    paid.memo = '年末調整 還付';
    expect(review({ journals: [salary(), paid] }).totals.payments).toBe(0);
  });

  it('leaves unlabelled payment candidates in the audit details without counting them', () => {
    const paid = payment();
    paid.debits[0].subAccountName = null;
    const result = review({ journals: [salary(), paid] });
    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.totals.payments).toBe(0);
    expect(result.details.at(-1)?.kind).toBe('UNCLASSIFIED');
  });

  it('does not sum parent and leaf amounts or duplicate leaf balances', () => {
    expect(review().totals.periodEndBalance).toBe(100);
    const result = review({
      trialBalance: trial([
        ['源泉所得税', 100],
        ['源泉所得税', 100],
      ]),
    });
    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.totals.periodEndBalance).toBeNull();
  });
});
