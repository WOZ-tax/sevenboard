import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const org = await p.organization.findFirst();
  if (!org) return;
  const fys = await p.fiscalYear.findMany({ where: { orgId: org.id } });
  for (const f of fys) {
    const start = f.startDate;
    console.log('FY year=' + f.year + ' startMonth=' + (start.getUTCMonth()+1) + ' startDate=' + start.toISOString());
  }
  // Sample recent actuals by month
  const ae = await p.actualEntry.groupBy({ by: ['month'], where: { orgId: org.id }, _count: true, orderBy: { month: 'asc' } });
  console.log('Actual months:');
  for (const row of ae) console.log('  ' + row.month.toISOString().slice(0,10) + ' count=' + row._count);
  await p.$disconnect();
})();
