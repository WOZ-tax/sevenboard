import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statementAmount} from './statement-amount.ts';

test('balance totals take precedence over zero display headers and component balances',()=>{
  const rows=[{category:'【流動資産】',current:0,isHeader:true},{category:'その他流動資産',current:500},{category:'流動資産合計',current:162146610,isTotal:true}];
  assert.equal(statementAmount(rows,'流動資産'),162146610);
});
test('explicit zero balances remain zero while missing accounts return null',()=>{
  assert.equal(statementAmount([{category:'【長期借入金】',current:0,isHeader:true}],'長期借入金'),null);
  assert.equal(statementAmount([{category:'  長期借入金',current:0}],'長期借入金'),0);
});
