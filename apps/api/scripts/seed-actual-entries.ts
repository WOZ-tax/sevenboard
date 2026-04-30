/**
 * MFの2026年度推移PLデータをActualEntryにseedする一回限りのスクリプト。
 * MFトークン切れでsync経由が使えない場合の代替。
 *
 * 使い方:
 *   npx ts-node scripts/seed-actual-entries.ts
 */
import { PrismaClient } from '@prisma/client';

const ORG_ID = '443e3ee5-09e4-44b8-b6ec-8e5fd5773f58';
// MFの fiscal_year=2026 は日本の決算年度表記（3月決算の場合 2025-04〜2026-03）。
// FiscalYear.year は開始年基準なので 2025。monthIdx 0 = 2025-04、monthIdx 11 = 2026-03。
const FY_START_YEAR = 2025;
const FY_START_MONTH_IDX = 3; // April (0-indexed) — Organization.fiscalMonthEnd=3 + 1 → 4月開始

// MF 2026年度推移PL (mcp__mfc_ca__mfc_ca_getReportsTransitionProfitLoss より)
type Row = { name: string; values: number[] };
const mfRows: Row[] = [
  { name: '売上高', values: [5139700, 8168386, 10695150, 2291290, 1923050, 1878050, 693050, 683050, 583500, 317200, 273100, 50000] },
  { name: '仕入原価', values: [63750, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: '役員報酬', values: [1241800, 1241800, 1241800, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: '給料賃金', values: [2891758, 2909290, 2926162, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: '法定福利費', values: [694800, 600062, 581235, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: '業務委託料', values: [926211, 1185679, 3164447, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: '広告宣伝費', values: [340000, 770000, 70000, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: '旅費交通費', values: [129670, 116078, 65037, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: '通信費', values: [1117329, 700502, 93929, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: '備品・消耗品費', values: [824594, 265427, 494400, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: '地代家賃', values: [818028, 883460, 883460, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: '支払手数料', values: [20645, 270158, 6275, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: '受取利息', values: [0, 13669, 3626, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: '支払利息', values: [42465, 41956, 82249, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  // その他販管費に集約される科目群
  { name: '福利厚生費', values: [163709, 109580, 120464, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: '荷造運賃', values: [2499, 6581, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: '接待交際費', values: [139988, 105001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: '水道光熱費', values: [33644, 53824, 46458, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: '租税公課', values: [2130, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: '支払報酬', values: [57000, 57000, 202002, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: '減価償却費', values: [45805, 45805, 45805, 45805, 45805, 45805, 45805, 45805, 45805, 45805, 45805, 45827] },
  { name: '雑費', values: [0, 0, 242305, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
];

// MF科目名 → DB科目名 のマッピング
const NAME_MAP: Record<string, string> = {
  売上高: 'サービス売上高',
  仕入原価: '商品仕入高',
  業務委託料: '外注費',
  給料賃金: '給料手当',
  '備品・消耗品費': '消耗品費',
  // その他販管費に集約
  福利厚生費: 'その他販管費',
  荷造運賃: 'その他販管費',
  接待交際費: 'その他販管費',
  水道光熱費: 'その他販管費',
  租税公課: 'その他販管費',
  支払報酬: 'その他販管費',
  減価償却費: 'その他販管費',
  雑費: 'その他販管費',
};

async function main() {
  const prisma = new PrismaClient();
  const org = await prisma.organization.findUnique({
    where: { id: ORG_ID },
    select: { tenantId: true },
  });
  if (!org) {
    throw new Error(`Organization not found: ${ORG_ID}`);
  }
  const tenantId = org.tenantId;

  const accounts = await prisma.accountMaster.findMany({
    where: { tenantId, orgId: ORG_ID },
    select: { id: true, name: true },
  });
  const accountByName = new Map(accounts.map((a) => [a.name, a.id]));

  const syncedAt = new Date();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  // 集約用: (DB科目名 × 月) 単位で合算
  const aggregated = new Map<string, number>();
  const key = (dbName: string, monthIdx: number) => `${dbName}::${monthIdx}`;

  for (const row of mfRows) {
    const dbName = NAME_MAP[row.name] || row.name;
    if (!accountByName.has(dbName)) {
      console.warn(`[skip] no AccountMaster for "${row.name}" → "${dbName}"`);
      skipped++;
      continue;
    }
    for (let m = 0; m < row.values.length; m++) {
      const amt = row.values[m];
      if (amt === 0) continue;
      const k = key(dbName, m);
      aggregated.set(k, (aggregated.get(k) || 0) + amt);
    }
  }

  for (const [k, amount] of aggregated.entries()) {
    const [dbName, mStr] = k.split('::');
    const monthIdx = parseInt(mStr, 10);
    const accountId = accountByName.get(dbName)!;
    const absoluteMonthIdx = FY_START_MONTH_IDX + monthIdx;
    const year = FY_START_YEAR + Math.floor(absoluteMonthIdx / 12);
    const mm = absoluteMonthIdx % 12;
    const month = new Date(Date.UTC(year, mm, 1));

    const existing = await prisma.actualEntry.findFirst({
      where: { tenantId, orgId: ORG_ID, accountId, departmentId: null, month },
    });
    if (existing) {
      await prisma.actualEntry.update({
        where: { id: existing.id },
        data: { amount, source: 'MF_CLOUD', syncedAt },
      });
      updated++;
    } else {
      await prisma.actualEntry.create({
        data: {
          tenantId,
          orgId: ORG_ID,
          accountId,
          month,
          amount,
          source: 'MF_CLOUD',
          syncedAt,
        },
      });
      created++;
    }
  }

  console.log(`done. created=${created} updated=${updated} skipped=${skipped}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
