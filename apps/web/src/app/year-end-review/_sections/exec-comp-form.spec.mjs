import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_EXEC_FORM,normalizeExecForm,applyExecPreset,sumTransitionToMonth} from './exec-comp-form.ts';

test('partial legacy saves cannot replace defaults with undefined and produce NaN',()=>{
  const form=normalizeExecForm({revenue:'248625000',monthlyComp:undefined,dependents:undefined});
  assert.ok(Number.isFinite(form.monthlyComp/10000));
  assert.equal(form.dependents,0);
  assert.equal(form.prefill.revenue,'manual');
  assert.equal(form.prefill.monthlyComp,'auto');
  assert.equal(applyExecPreset(form,{monthlyComp:0}).monthlyComp,0);
});
test('manual values including zero survive new financial data and JSON reload',()=>{
  const form=JSON.parse(JSON.stringify({...DEFAULT_EXEC_FORM,revenue:'0',monthlyComp:0,prefill:{revenue:'manual',monthlyComp:'manual',capital:'auto'}}));
  const updated=applyExecPreset(normalizeExecForm(form),{revenue:'100000000',monthlyComp:300000,capital:'10000000'});
  assert.equal(updated.revenue,'0'); assert.equal(updated.monthlyComp,0); assert.equal(updated.capital,'10000000');
  assert.equal(applyExecPreset(updated,{monthlyComp:300000},true).monthlyComp,300000);
});
test('transition sums stop at the selected month including fiscal years spanning calendar years',()=>{
  const rows=[{month:'2025-04',amount:10},{month:'2025-08',amount:20},{month:'2025-09',amount:30},{month:'2026-01',amount:40}];
  assert.equal(sumTransitionToMonth(rows,4,5),30);
  assert.equal(sumTransitionToMonth(rows,4,10),100);
});
