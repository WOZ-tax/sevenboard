import {
  buildWithholdingTaxEntries,
  buildWithholdingTaxSummary,
  extractWithholdingEntry,
} from './withholding-tax-calculator';
import type { WithholdingTaxJournalInput } from './withholding-tax.types';

function journal(input: Partial<WithholdingTaxJournalInput>): WithholdingTaxJournalInput {
  return {
    id: 'j1',
    number: '1001',
    date: '2026-01-31',
    memo: null,
    partnerName: '山田太郎',
    debits: [],
    credits: [],
    ...input,
  };
}

describe('extractWithholdingEntry', () => {
  it('extracts professional fee withholding from an MF journal', () => {
    const entry = extractWithholdingEntry(
      journal({
        debits: [{ accountName: '支払報酬', amount: 100_000 }],
        credits: [
          { accountName: '普通預金', amount: 89_790 },
          { accountName: '預り金', subAccountName: '所得税(士業)', amount: 10_210 },
        ],
      }),
    );

    expect(entry).toMatchObject({
      category: 'PROFESSIONAL_FEE',
      paymentAmount: 100_000,
      withholdingTax: 10_210,
      paymentAmountEstimated: false,
      month: 1,
    });
  });

  it('classifies salary withholding separately', () => {
    const entry = extractWithholdingEntry(
      journal({
        debits: [{ accountName: '給料賃金', amount: 300_000 }],
        credits: [
          { accountName: '普通預金', amount: 292_350 },
          { accountName: '預り金', subAccountName: '所得税(給与)', amount: 7_650 },
        ],
      }),
    );

    expect(entry?.category).toBe('SALARY');
    expect(entry?.withholdingTax).toBe(7_650);
  });

  it('skips tax payment journals', () => {
    const entry = extractWithholdingEntry(
      journal({
        memo: '税務署 源泉所得税納付',
        debits: [{ accountName: '預り金', subAccountName: '所得税(士業)', amount: 10_210 }],
        credits: [{ accountName: '普通預金', amount: 10_210 }],
      }),
    );

    expect(entry).toBeNull();
  });

  it('shifts unpaid accruals to the first day of the next month', () => {
    const entry = extractWithholdingEntry(
      journal({
        date: '2026-01-31',
        debits: [{ accountName: '支払報酬', amount: 100_000 }],
        credits: [
          { accountName: '未払金', amount: 89_790 },
          { accountName: '預り金', subAccountName: '所得税(士業)', amount: 10_210 },
        ],
      }),
    );

    expect(entry?.paymentDate).toBe('2026-02-01');
    expect(entry?.month).toBe(2);
    expect(entry?.warnings).toContain(
      '未払計上の可能性があるため、支払月を翌月として扱っています。',
    );
  });

  it('reverse-calculates payment amount when source side is missing', () => {
    const entry = extractWithholdingEntry(
      journal({
        debits: [{ accountName: '仮払金', amount: 10_210 }],
        credits: [{ accountName: '預り金', subAccountName: '所得税(報酬)', amount: 10_210 }],
      }),
    );

    expect(entry?.paymentAmount).toBe(100_000);
    expect(entry?.paymentAmountEstimated).toBe(true);
    expect(entry?.confidence).toBe('LOW');
  });
});

describe('buildWithholdingTaxSummary', () => {
  it('aggregates category, month, total and payment statement rows', () => {
    const entries = buildWithholdingTaxEntries([
      journal({
        id: 'j1',
        date: '2026-01-15',
        partnerName: '山田太郎',
        debits: [{ accountName: '支払報酬', amount: 100_000 }],
        credits: [{ accountName: '預り金', subAccountName: '所得税(士業)', amount: 10_210 }],
      }),
      journal({
        id: 'j2',
        date: '2026-07-15',
        partnerName: '山田太郎',
        debits: [{ accountName: '支払報酬', amount: 200_000 }],
        credits: [{ accountName: '預り金', subAccountName: '所得税(士業)', amount: 20_420 }],
      }),
      journal({
        id: 'j3',
        date: '2026-01-25',
        partnerName: '佐藤花子',
        debits: [{ accountName: '給料賃金', amount: 300_000 }],
        credits: [{ accountName: '預り金', subAccountName: '所得税(給与)', amount: 7_650 }],
      }),
    ]);

    const summary = buildWithholdingTaxSummary(entries);

    expect(summary.totals).toMatchObject({
      count: 3,
      payeeCount: 2,
      paymentAmount: 600_000,
      withholdingTax: 38_280,
    });
    expect(summary.categorySummary.map((r) => r.category)).toEqual([
      'SALARY',
      'PROFESSIONAL_FEE',
    ]);
    expect(summary.monthlySummary).toEqual([
      expect.objectContaining({ month: 1, count: 2, withholdingTax: 17_860 }),
      expect.objectContaining({ month: 7, count: 1, withholdingTax: 20_420 }),
    ]);
    expect(summary.paymentStatements).toEqual([
      expect.objectContaining({
        payeeName: '山田太郎',
        h1PaymentAmount: 100_000,
        h2PaymentAmount: 200_000,
        totalWithholdingTax: 30_630,
      }),
    ]);
  });
});
