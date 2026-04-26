import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. 組織（デモ用）
  const org = await prisma.organization.upsert({
    where: { code: '0001-0001' },
    update: {},
    create: {
      name: 'デモ株式会社',
      code: '0001-0001',
      fiscalMonthEnd: 3,
      industry: 'SaaS',
      employeeCount: 25,
      planType: 'GROWTH',
    },
  });
  console.log(`  ✅ Organization: ${org.name}`);

  // 2. ユーザー
  const hashedPassword = await bcrypt.hash('password123', 12);

  // admin@demo.com は SEVENRICH 事務所オーナー（内部スタッフ）。
  // G-1 設計: 内部スタッフは orgId=NULL & role=owner/advisor。
  // role='owner' & orgId 持ちにすると顧問先側 owner と区別がつかなくなり権限混線するため絶対に避ける。
  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {
      password: hashedPassword,
      role: 'owner',
      orgId: null,
    },
    create: {
      email: 'admin@demo.com',
      name: '田中 健太',
      password: hashedPassword,
      role: 'owner',
      orgId: null,
    },
  });

  const advisor = await prisma.user.upsert({
    where: { email: 'advisor@sevenrich.jp' },
    update: { password: hashedPassword },
    create: {
      email: 'advisor@sevenrich.jp',
      name: '山田 太郎',
      password: hashedPassword,
      role: 'advisor',
      orgId: null, // SEVENRICH顧問スタッフ
    },
  });

  // 顧問担当割当 (OrganizationMembership)
  await prisma.organizationMembership.upsert({
    where: { userId_orgId: { userId: advisor.id, orgId: org.id } },
    update: {},
    create: { userId: advisor.id, orgId: org.id, role: 'advisor' },
  });
  console.log(`  ✅ Users: ${admin.name}, ${advisor.name}`);

  // 3. 勘定科目マスタ
  const accounts = [
    // 売上
    { code: '4100', name: '商品売上高', category: 'REVENUE' as const, order: 100 },
    { code: '4200', name: 'サービス売上高', category: 'REVENUE' as const, order: 200 },
    // 売上原価
    { code: '5100', name: '商品仕入高', category: 'COST_OF_SALES' as const, order: 300, variable: true },
    { code: '5200', name: '外注費', category: 'COST_OF_SALES' as const, order: 400, variable: true },
    // 販管費
    { code: '6100', name: '役員報酬', category: 'ADMIN_EXPENSE' as const, order: 500 },
    { code: '6110', name: '給料手当', category: 'ADMIN_EXPENSE' as const, order: 510 },
    { code: '6120', name: '法定福利費', category: 'ADMIN_EXPENSE' as const, order: 520 },
    { code: '6200', name: '地代家賃', category: 'ADMIN_EXPENSE' as const, order: 600 },
    { code: '6300', name: '通信費', category: 'ADMIN_EXPENSE' as const, order: 700, variable: true },
    { code: '6400', name: '広告宣伝費', category: 'SELLING_EXPENSE' as const, order: 800, variable: true },
    { code: '6500', name: '旅費交通費', category: 'ADMIN_EXPENSE' as const, order: 900, variable: true },
    { code: '6600', name: '消耗品費', category: 'ADMIN_EXPENSE' as const, order: 1000, variable: true },
    { code: '6700', name: '支払手数料', category: 'ADMIN_EXPENSE' as const, order: 1100, variable: true },
    { code: '6900', name: 'その他販管費', category: 'ADMIN_EXPENSE' as const, order: 1200, variable: true },
    // 営業外
    { code: '7100', name: '受取利息', category: 'NON_OPERATING_INCOME' as const, order: 1300 },
    { code: '7200', name: '支払利息', category: 'NON_OPERATING_EXPENSE' as const, order: 1400 },
  ];

  for (const acc of accounts) {
    await prisma.accountMaster.upsert({
      where: { orgId_code: { orgId: org.id, code: acc.code } },
      update: {},
      create: {
        orgId: org.id,
        code: acc.code,
        name: acc.name,
        category: acc.category,
        isVariableCost: acc.variable ?? false,
        displayOrder: acc.order,
      },
    });
  }
  console.log(`  ✅ Account Masters: ${accounts.length} accounts`);

  // 4. 会計年度
  const fy = await prisma.fiscalYear.upsert({
    where: { orgId_year: { orgId: org.id, year: 2025 } },
    update: {},
    create: {
      orgId: org.id,
      year: 2025,
      startDate: new Date('2025-04-01'),
      endDate: new Date('2026-03-31'),
      status: 'OPEN',
    },
  });

  // 5. 予算バージョン（Base）
  const bv = await prisma.budgetVersion.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      fiscalYearId: fy.id,
      name: 'Base',
      scenarioType: 'BASE',
      createdBy: admin.id,
    },
  });

  // 予算データ投入（12ヶ月分、主要科目のみ）
  const accountRecords = await prisma.accountMaster.findMany({ where: { orgId: org.id } });
  const accountMap = Object.fromEntries(accountRecords.map((a) => [a.code, a.id]));

  const monthlyBudgets: Record<string, number> = {
    '4100': 8000_0000,  // 商品売上 8,000万
    '4200': 3550_0000,  // サービス売上 3,550万
    '5100': 4000_0000,  // 商品仕入 4,000万
    '5200': 2930_0000,  // 外注費 2,930万
    '6100': 800_0000,   // 役員報酬 800万
    '6110': 1000_0000,  // 給料手当 1,000万
    '6120': 200_0000,   // 法定福利費 200万
    '6200': 200_0000,   // 地代家賃 200万
    '6300': 30_0000,    // 通信費 30万
    '6400': 100_0000,   // 広告宣伝費 100万
    '6500': 50_0000,    // 旅費交通費 50万
    '6600': 20_0000,    // 消耗品費 20万
    '6700': 30_0000,    // 支払手数料 30万
    '6900': 30_0000,    // その他 30万
  };

  // 既存の予算データをクリアしてから一括投入（upsertのnull問題を回避）
  await prisma.budgetEntry.deleteMany({ where: { budgetVersionId: bv.id } });

  const budgetEntries: { budgetVersionId: string; accountId: string; month: Date; amount: number }[] = [];
  for (let m = 4; m <= 12; m++) {
    const month = new Date(`2025-${String(m).padStart(2, '0')}-01`);
    for (const [code, amount] of Object.entries(monthlyBudgets)) {
      if (accountMap[code]) {
        budgetEntries.push({ budgetVersionId: bv.id, accountId: accountMap[code], month, amount });
      }
    }
  }
  for (let m = 1; m <= 3; m++) {
    const month = new Date(`2026-${String(m).padStart(2, '0')}-01`);
    for (const [code, amount] of Object.entries(monthlyBudgets)) {
      if (accountMap[code]) {
        budgetEntries.push({ budgetVersionId: bv.id, accountId: accountMap[code], month, amount });
      }
    }
  }
  await prisma.budgetEntry.createMany({ data: budgetEntries });
  console.log(`  ✅ Budget entries: ${budgetEntries.length} rows (12 months × 14 accounts)`);

  // 6. 資金繰りカテゴリ
  const cfCategories = [
    { name: '売上入金', direction: 'IN' as const, cfType: 'OPERATING' as const, isFixed: false, order: 100 },
    { name: 'その他収入', direction: 'IN' as const, cfType: 'OPERATING' as const, isFixed: false, order: 200 },
    { name: '人件費', direction: 'OUT' as const, cfType: 'OPERATING' as const, isFixed: true, recurrence: 'MONTHLY_25', order: 300 },
    { name: '家賃', direction: 'OUT' as const, cfType: 'OPERATING' as const, isFixed: true, recurrence: 'MONTHLY_END', order: 400 },
    { name: '仕入・外注費', direction: 'OUT' as const, cfType: 'OPERATING' as const, isFixed: false, order: 500 },
    { name: '社保・税金', direction: 'OUT' as const, cfType: 'OPERATING' as const, isFixed: false, recurrence: 'MONTHLY_END', order: 600 },
    { name: 'その他経費', direction: 'OUT' as const, cfType: 'OPERATING' as const, isFixed: false, order: 700 },
    { name: '設備投資', direction: 'OUT' as const, cfType: 'INVESTING' as const, isFixed: false, order: 800 },
    { name: '融資返済', direction: 'OUT' as const, cfType: 'FINANCING' as const, isFixed: true, recurrence: 'MONTHLY_END', order: 900 },
  ];

  for (const cat of cfCategories) {
    await prisma.cashFlowCategory.create({
      data: {
        orgId: org.id,
        name: cat.name,
        direction: cat.direction,
        cfType: cat.cfType,
        isFixed: cat.isFixed,
        recurrenceRule: cat.recurrence ?? null,
        displayOrder: cat.order,
      },
    });
  }
  console.log(`  ✅ Cash flow categories: ${cfCategories.length}`);

  // 7. ランウェイスナップショット
  await prisma.runwaySnapshot.create({
    data: {
      orgId: org.id,
      snapshotDate: new Date('2026-03-31'),
      cashBalance: 25_000_000,
      monthlyBurnRate: 3_000_000,
      runwayMonths: 8.3,
      alertLevel: 'SAFE',
    },
  });
  console.log('  ✅ Runway snapshot: 8.3 months');

  console.log('\n🎉 Seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
