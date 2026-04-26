import { PrismaClient } from '@prisma/client';
const ORG = '443e3ee5-09e4-44b8-b6ec-8e5fd5773f58';
const BV = '00000000-0000-0000-0000-000000000001';
(async () => {
  const p = new PrismaClient();
  const bes = await p.budgetEntry.findMany({
    where: { budgetVersionId: BV },
    include: { account: true },
  });
  const aes = await p.actualEntry.findMany({
    where: { orgId: ORG },
    include: { account: true },
  });
  const actualMap = new Map<string, number>();
  for (const ae of aes) {
    actualMap.set(ae.accountId + ':' + ae.month.toISOString().slice(0,10), Number(ae.amount));
  }
  let matchedCount = 0;
  let totalBudget = 0;
  let totalActualMatched = 0;
  const perAccount: Record<string, {name: string; budget: number; actual: number}> = {};
  for (const be of bes) {
    const k = be.accountId + ':' + be.month.toISOString().slice(0,10);
    const actual = actualMap.get(k) || 0;
    if (actual !== 0) matchedCount++;
    totalBudget += Number(be.amount);
    totalActualMatched += actual;
    const name = be.account.name;
    if (!perAccount[name]) perAccount[name] = { name, budget: 0, actual: 0 };
    perAccount[name].budget += Number(be.amount);
    perAccount[name].actual += actual;
  }
  console.log('BE total=' + bes.length + ' matched with non-zero actual=' + matchedCount);
  console.log('Total budget=' + totalBudget.toLocaleString());
  console.log('Total actual matched=' + totalActualMatched.toLocaleString());
  console.log('\nPer-account with non-zero:');
  for (const a of Object.values(perAccount).filter(a => a.actual !== 0 || a.budget !== 0).sort((x,y)=>Math.abs(y.actual)-Math.abs(x.actual)).slice(0, 15)) {
    console.log('  ' + a.name.padEnd(20) + ' budget=' + a.budget.toLocaleString().padStart(15) + '  actual=' + a.actual.toLocaleString().padStart(15));
  }
  await p.$disconnect();
})();
