import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const rates = new URL('./tax-rates-2026.ts', import.meta.url).href;
const source = readFileSync(new URL('./payroll-tax-calc.ts', import.meta.url), 'utf8')
  .replace('"@/lib/tax-rates-2026"', JSON.stringify(rates));
const { calcCorpTax } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);

test('defense corporate tax starts with fiscal years beginning April 1, 2026', () => {
  const before = calcCorpTax(3000, 1000, undefined, '2026-03-31');
  const after = calcCorpTax(3000, 1000, undefined, '2026-04-01');
  assert.equal(before.defenseTax.tax, 0);
  assert.equal(after.defenseTax.tax, 5.21);
  assert.ok(Math.abs(after.total - before.total - 5.21) < 1e-8);
  assert.equal(calcCorpTax(3000, 1000, undefined, '2026-01-01').defenseTax.tax, 0);
  assert.equal(calcCorpTax(3000, 1000, undefined, '2027-01-01').defenseTax.tax, 5.21);
});

test('unknown fiscal start does not apply defense tax in year-specific forecasts', () => {
  assert.equal(calcCorpTax(3000, 1000, undefined, '').defenseTax.tax, 0);
  assert.equal(calcCorpTax(1000, 1000, undefined, '2026-04-01').defenseTax.tax, 0);
  assert.equal(calcCorpTax(-100, 1000, undefined, '2026-04-01').defenseTax.tax, 0);
});
