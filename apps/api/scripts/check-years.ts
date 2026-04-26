import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const org = await p.organization.findFirst();
  if (!org) { console.log('no org'); return; }
  const fys = await p.fiscalYear.findMany({ where: { orgId: org.id }, include: { budgetVersions: true } });
  console.log('FiscalYears:');
  for (const f of fys) {
    console.log('  year=' + f.year + ' start=' + f.startDate.toISOString().slice(0,10) + ' end=' + f.endDate.toISOString().slice(0,10));
    for (const bv of f.budgetVersions) {
      console.log('    bv=' + bv.name + ' scenario=' + bv.scenarioType + ' id=' + bv.id);
    }
  }
  const bvId = fys[0]?.budgetVersions[0]?.id;
  if (bvId) {
    const beAgg = await p.budgetEntry.aggregate({ where: { budgetVersionId: bvId }, _min: { month: true }, _max: { month: true }, _count: true });
    console.log('BudgetEntry range for bv0: ' + beAgg._min.month?.toISOString().slice(0,10) + ' -> ' + beAgg._max.month?.toISOString().slice(0,10) + ' count=' + beAgg._count);
  }
  const aeAgg = await p.actualEntry.aggregate({ where: { orgId: org.id }, _min: { month: true }, _max: { month: true }, _count: true });
  console.log('ActualEntry range: ' + aeAgg._min.month?.toISOString().slice(0,10) + ' -> ' + aeAgg._max.month?.toISOString().slice(0,10) + ' count=' + aeAgg._count);
  await p.$disconnect();
})();
