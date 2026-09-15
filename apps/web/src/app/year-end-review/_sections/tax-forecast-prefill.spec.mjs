import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyTaxForecastPreset, setTaxForecastManualValue, sanitizeTaxAmount } from './tax-forecast-prefill.ts';

const fresh = () => ({
  pretaxProfit: '0', capital: '1000000', vatReceived: '0', vatPaid: '0',
  vatMid: '12345', items: [{ id: 'loss', amount: '50' }],
  prefill: { pretaxProfit: 'auto', capital: 'auto', vatReceived: 'auto', vatPaid: 'auto' },
});
const firstData = { pretaxProfit: '1920', capital: '10000000', vatReceived: '8400000', vatPaid: '5760000' };

test('初回取得で自動項目を反映し、税務調整と中間納付は保持する', () => {
  const original = fresh(), next = applyTaxForecastPreset(original, firstData);
  assert.equal(next.pretaxProfit, '1920');
  assert.equal(next.capital, '10000000');
  assert.equal(next.vatMid, '12345');
  assert.strictEqual(next.items, original.items);
  assert.equal(original.pretaxProfit, '0');
});

test('手入力後に対象月を変えても利益と資本金が置き換わらない', () => {
  let form = applyTaxForecastPreset(fresh(), firstData);
  form = setTaxForecastManualValue(form, 'pretaxProfit', '3456');
  form = setTaxForecastManualValue(form, 'capital', '5000000');
  const next = applyTaxForecastPreset(form, { ...firstData, pretaxProfit: '2400', capital: '20000000', vatPaid: '6000000' });
  assert.equal(next.pretaxProfit, '3456');
  assert.equal(next.capital, '5000000');
  assert.equal(next.vatPaid, '6000000');
});

test('手入力した0・空欄・赤字を保存復元後も保持する', () => {
  for (const value of ['0', '', '-500']) {
    const manual = setTaxForecastManualValue(fresh(), 'pretaxProfit', value);
    const restored = JSON.parse(JSON.stringify(manual));
    assert.equal(applyTaxForecastPreset(restored, firstData).pretaxProfit, value);
  }
});

test('消費税に手入力した0も自動反映で置き換えない', () => {
  const manual = setTaxForecastManualValue(applyTaxForecastPreset(fresh(), firstData), 'vatReceived', '0');
  assert.equal(applyTaxForecastPreset(manual, { vatReceived: '9999999' }).vatReceived, '0');
});

test('出自のない旧保存データは、0を含めて自動変更しない', () => {
  const { prefill, ...legacy } = fresh();
  assert.strictEqual(applyTaxForecastPreset(legacy, firstData), legacy);
  assert.strictEqual(applyTaxForecastPreset({ ...legacy, prefill: {} }, firstData).pretaxProfit, '0');
});

test('再反映を明示したときだけ手入力項目を自動値へ戻す', () => {
  const manual = setTaxForecastManualValue(fresh(), 'pretaxProfit', '3456');
  const next = applyTaxForecastPreset(manual, firstData, true);
  assert.equal(next.pretaxProfit, '1920');
  assert.equal(next.prefill.pretaxProfit, 'auto');
  assert.equal(applyTaxForecastPreset(next, { pretaxProfit: '2400' }).pretaxProfit, '2400');
});

test('未取得項目は再反映でも保持し、取得済みの0は反映する', () => {
  const original = applyTaxForecastPreset(fresh(), firstData);
  const next = applyTaxForecastPreset(original, { pretaxProfit: null, capital: '0', vatReceived: undefined }, true);
  assert.equal(next.pretaxProfit, '1920');
  assert.equal(next.capital, '0');
  assert.equal(next.vatReceived, '8400000');
});

test('値が変わらない再取得では同じオブジェクトを返す', () => {
  const form = applyTaxForecastPreset(fresh(), firstData);
  assert.strictEqual(applyTaxForecastPreset(form, firstData), form);
  assert.strictEqual(applyTaxForecastPreset(form, {}), form);
});

test('金額入力は桁区切りを除去し、利益欄では赤字と符号入力中を保持する', () => {
  assert.equal(sanitizeTaxAmount('1,234'), '1234');
  assert.equal(sanitizeTaxAmount('-1,234', true), '-1234');
  assert.equal(sanitizeTaxAmount('-', true), '-');
  assert.equal(sanitizeTaxAmount(''), '');
  assert.equal(sanitizeTaxAmount('-100', false), '100');
});
