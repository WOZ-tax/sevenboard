import test from 'node:test';
import assert from 'node:assert/strict';
import { stracActual, stracPlan, stracWindow, stracRepayments, stracBookDebt, normalizeStracAssumptions, DEFAULT_STRAC_ASSUMPTIONS as defaults } from './strac.ts';

const source = { revenue: 1000, variableCosts: [{name:'仕入',amount:600}], fixedCosts:[{name:'給料手当',amount:120},{name:'減価償却費',amount:30},{name:'家賃',amount:50}] };
const pl = [{category:'売上高',current:1000},{category:'営業利益',current:200},{category:'経常利益',current:190},{category:'税引前当期純利益',current:210},{category:'当期純利益',current:147}];
const actual = stracActual(source,pl);
const jan = {fiscal_year:2026,start_date:'2026-01-01',end_date:'2026-12-31'};
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('fiscal calendar, data cutoff and consistent following 12 months',()=>{
  assert.deepEqual(stracWindow(jan,undefined,'2026-08-31','2026-09-18'),{fiscalYear:2026,start:'2026-01-01',end:'2026-08-31',endMonth:8,months:8,nextStart:'2026-09-01',nextEnd:'2027-08-31',capped:true});
  assert.equal(stracWindow({fiscal_year:2025,start_date:'2025-04-01',end_date:'2026-03-31'},2,undefined,'2026-09-18').months,11);
  assert.equal(stracWindow(jan,1,undefined,'2026-09-18').months,1);
  assert.equal(stracWindow(jan,7,'2026-07-15','2026-09-18').end,'2026-06-30');
  assert.equal(stracWindow(jan,1,undefined,'2026-01-01'),null);
  assert.equal(stracWindow({...jan,start_date:'2026-01-15'},8,undefined,'2026-09-18'),null);
  assert.equal(stracWindow({...jan,start_date:'2026-02-31'},8,undefined,'2026-09-18'),null);
  assert.equal(stracWindow({...jan,end_date:'2026-03-31'},8,undefined,'2026-09-18'),null);
});
test('classification preserves operating profit and separates labor / D&A',()=>{
  assert.equal(actual.personnel,120);assert.equal(actual.depreciation,30);assert.equal(actual.fixed,200);assert.equal(actual.operating,200);
  assert.equal(actual.nonOperating,-10);assert.equal(actual.extraordinary,20);assert.equal(actual.tax,63);assert.deepEqual(actual.issues,[]);
  const reclassified=stracActual(source,pl,{'給料手当':true});assert.equal(reclassified.personnel,0);assert.equal(reclassified.operating,200);assert.equal(reclassified.variable,720);
  near(actual.breakEven,500);near(actual.safetyMargin,.5);
});
test('bookkeeping mismatches, missing totals and invalid numbers are flagged',()=>{
  assert.ok(stracActual({...source,revenue:998},pl).issues.length>=2);
  assert.ok(stracActual(source,pl.filter(r=>r.category!=='当期純利益')).issues.length);
  assert.ok(stracActual({...source,revenue:NaN},pl).issues.length);
  assert.equal(stracActual({...source,revenue:0},pl).breakEven,null);
});
test('annual projection excludes extraordinary gains and interest is not subtracted twice',()=>{
  const result=stracPlan(actual,6,defaults,100);
  assert.deepEqual(result.issues,[]);near(result.base.pretax,380);near(result.base.net,266);near(result.base.simpleCash,326);near(result.base.surplus,226);
  near(result.depreciation,60);near(result.base.coverage,3.26);
});
test('working capital, investment and signed cash adjustments affect repayment funds',()=>{
  const result=stracPlan(actual,6,{...defaults,workingCapital:'50',capex:'80',otherCash:'-20'},100);
  near(result.base.surplus,76);
  near(stracPlan(actual,6,{...defaults,workingCapital:'-50'},100).base.surplus,276);
});
test('unknown principal differs from verified zero and manual override',()=>{
  const unknown=stracPlan(actual,6,defaults,null);assert.equal(unknown.base.surplus,null);assert.equal(unknown.base.requiredRevenue,null);
  const zero=stracPlan(actual,6,defaults,0);near(zero.base.surplus,326);assert.equal(zero.base.coverage,null);
  const manual=stracPlan(actual,6,{...defaults,principal:'123'},null);near(manual.base.surplus,203);assert.equal(manual.manualPrincipal,true);
});
test('required sales solve the target cash equation on both tax branches',()=>{
  for(const retainedCash of ['0','200']) for(const depreciation of ['0','1000']) {
    const a={...defaults,retainedCash,depreciation,workingCapital:'40',capex:'60',otherCash:'-10',marginChange:'3',fixedReduction:'10'};
    const plan=stracPlan(actual,6,a,100), r=plan.scenario.requiredRevenue;
    const salesChange=String((r/2000-1)*100);
    const solved=stracPlan(actual,6,{...a,salesChange},100);
    if(r>0)near(solved.scenario.surplus,Number(retainedCash));else assert.ok(solved.scenario.surplus>=Number(retainedCash));
  }
});
test('losses never create a negative tax estimate; nonpositive margin has no inverse sales',()=>{
  const plan=stracPlan(actual,6,{...defaults,salesChange:'-90'},100);assert.equal(plan.scenario.tax,0);assert.ok(plan.scenario.surplus<0);
  assert.equal(stracPlan(actual,6,{...defaults,marginChange:'-50'},100).scenario.requiredRevenue,null);
});
test('reject invalid assumptions instead of replacing them with zero',()=>{
  for(const patch of [{taxRate:'100'},{taxRate:''},{principal:'-1'},{capex:'-1'},{salesChange:'-101'},{fixedReduction:'99999'},{marginChange:'90'},{workingCapital:'NaN'},{otherCash:'1e100'}]) assert.ok(stracPlan(actual,6,{...defaults,...patch},100).issues.length,JSON.stringify(patch));
  assert.equal(normalizeStracAssumptions(null).taxRate,'30');assert.equal(normalizeStracAssumptions({taxRate:42}).taxRate,'30');
});
const loan={id:'a',lenderName:'Test bank',principal:300,startDate:'2025-12-31',maturityDate:'2026-03-31',scheduleEntries:[
  {seq:1,dueDate:'2026-01-31',principalAmount:100,interestAmount:3,balanceAfter:200},
  {seq:2,dueDate:'2026-02-28',principalAmount:100,interestAmount:2,balanceAfter:100},
  {seq:3,dueDate:'2026-03-31',principalAmount:100,interestAmount:1,balanceAfter:0},
]};
test('repayment window includes its edges, checks reference-date balance, supports repaid loans',()=>{
  const r=stracRepayments([loan],'2026-02-01','2027-01-31','2026-01-31',200);
  assert.equal(r.principal,200);assert.equal(r.interest,3);assert.equal(r.balance,200);assert.equal(r.complete,true);
  const repaid=stracRepayments([loan],'2026-04-01','2027-03-31','2026-03-31',0);assert.equal(repaid.principal,0);assert.equal(repaid.complete,true);
});
test('missing schedules, duplicates, inconsistent balances and unregistered debt block automatic principal',()=>{
  for(const l of [{...loan,scheduleEntries:[]},{...loan,scheduleEntries:loan.scheduleEntries.slice(0,2)},{...loan,scheduleEntries:[...loan.scheduleEntries,loan.scheduleEntries[2]]},{...loan,scheduleEntries:loan.scheduleEntries.map((r,i)=>i===1?{...r,balanceAfter:98}:r)}]) assert.equal(stracRepayments([l],'2026-02-01','2027-01-31','2026-01-31',200).complete,false);
  assert.equal(stracRepayments([],'2026-02-01','2027-01-31','2026-01-31',200).complete,false);
  assert.equal(stracRepayments([],'2026-02-01','2027-01-31','2026-01-31',null).complete,false);
  assert.equal(stracRepayments([],'2026-02-01','2027-01-31','2026-01-31',0).complete,true);
  assert.equal(stracRepayments([loan],'2026-02-01','2027-01-31','2026-01-31',201.1).complete,false);
});
test('loan book balance uses account rows, no duplicated total',()=>{
  assert.equal(stracBookDebt({liabilitiesEquity:[{category:'長期借入金',current:200},{category:'短期借入金',current:100},{category:'借入金合計',current:300}]}),300);
  assert.equal(stracBookDebt({liabilitiesEquity:[]}),null);
});
