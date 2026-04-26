import { PrismaClient } from '@prisma/client';
const ORG_ID = '443e3ee5-09e4-44b8-b6ec-8e5fd5773f58';
(async () => {
  const p = new PrismaClient();
  const r = await p.actualEntry.deleteMany({
    where: { orgId: ORG_ID, source: 'MF_CLOUD' },
  });
  console.log('deleted MF_CLOUD actuals:', r.count);
  await p.$disconnect();
})();
