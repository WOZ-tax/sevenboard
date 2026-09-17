import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fiscalMonths, filterFiscalRows } from './fiscal-months.ts';
import { journalDisplayRows } from './journal-display.ts';

test('December and March fiscal years preserve calendar years and month order', () => {
  const december = fiscalMonths('2026-01-01', '2026-12-31');
  assert.equal(december[0].date, '2026-01-01');
  assert.equal(december[11].date, '2026-12-01');
  const march = fiscalMonths('2025-04-01', '2026-03-31');
  assert.equal(march[0].date, '2025-04-01');
  assert.equal(march[9].date, '2026-01-01');
  assert.equal(march[11].date, '2026-03-01');
});
test('monthly and cumulative variance include exactly the chosen accounting months', () => {
  const rows = fiscalMonths('2026-01-01', '2026-12-31').map(m => ({ month: m.date, amount: m.month }));
  assert.equal(filterFiscalRows(rows, '2026-08-01', '2026-08-01').length, 1);
  assert.equal(filterFiscalRows(rows, '2026-01-01', '2026-08-01').reduce((a, r) => a + r.amount, 0), 36);
  const crossing = fiscalMonths('2025-04-01', '2026-03-31').map(m => ({ month: m.date }));
  assert.equal(filterFiscalRows(crossing, '2025-04-01', '2026-01-01').length, 10);
});
test('MF journal branches keep their date, accounts, tax-inclusive amount and memo', () => {
  const rows = journalDisplayRows([{ id: '1', transaction_date: '2025-01-25', branches: [
    { debitor: { account_name: '売掛金', value: 110 }, creditor: { account_name: '売上高', value: 100, tax_value: 10 }, remark: '販売' },
    { debitor: { account_name: '支払手数料', value: 5 }, creditor: { account_name: '普通預金', value: 5 } },
  ] }], '売上高');
  assert.deepEqual(rows, [{ id: '1:0', date: '2025-01-25', debit: '売掛金', credit: '売上高', amount: 110, description: '販売' }]);
});
test('legacy journals retain an explicit zero amount', () => {
  assert.equal(journalDisplayRows([{ date: '2025-01-01', amount: 10, details: [{ amount: 0 }] }])[0].amount, 0);
});
