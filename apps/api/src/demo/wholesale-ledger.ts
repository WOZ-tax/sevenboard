import { BadRequestException } from '@nestjs/common';
import type {
  MfAccount,
  MfOffice,
  MfReportRow,
  MfTransition,
  MfTrialBalance,
} from '../mf/types/mf-api.types';
import type {
  MfV3JournalItem,
  MfV3JournalLineDetails,
} from '../mf/types/mf-v3.types';
import {
  DEMO_AS_OF,
  DEMO_CODE,
  DEMO_COMPANY_NAME,
  DEMO_MONTH,
  DEMO_YEAR,
} from './demo.constants';

type Group = MfAccount['account_group'];
type Account = {
  key: string;
  name: string;
  group: Group;
  category: string;
  opening?: number;
};
// All values are yen. 2022 is the comparison baseline; 2023–2025 are the three
// completed periods, and 2026 has eight booked months. No real client data.
export const DEMO_ACCOUNTS: Account[] = [
  {
    key: 'cash',
    name: '普通預金',
    group: 'ASSET',
    category: 'ASSET',
    opening: 35000000,
  },
  {
    key: 'ar',
    name: '売掛金',
    group: 'ASSET',
    category: 'ASSET',
    opening: 11000000,
  },
  {
    key: 'stock',
    name: '商品',
    group: 'ASSET',
    category: 'ASSET',
    opening: 12000000,
  },
  { key: 'vatIn', name: '仮払消費税', group: 'ASSET', category: 'ASSET' },
  {
    key: 'equipment',
    name: '建物附属設備',
    group: 'ASSET',
    category: 'ASSET',
    opening: 18000000,
  },
  {
    key: 'ap',
    name: '買掛金',
    group: 'LIABILITY',
    category: 'LIABILITY',
    opening: 8800000,
  },
  {
    key: 'withheld',
    name: '源泉所得税預り金',
    group: 'LIABILITY',
    category: 'LIABILITY',
  },
  {
    key: 'social',
    name: '社会保険料預り金',
    group: 'LIABILITY',
    category: 'LIABILITY',
  },
  {
    key: 'socialPayable',
    name: '未払費用',
    group: 'LIABILITY',
    category: 'LIABILITY',
  },
  {
    key: 'vatOut',
    name: '仮受消費税',
    group: 'LIABILITY',
    category: 'LIABILITY',
  },
  {
    key: 'vatPayable',
    name: '未払消費税等',
    group: 'LIABILITY',
    category: 'LIABILITY',
  },
  {
    key: 'taxPayable',
    name: '未払法人税等',
    group: 'LIABILITY',
    category: 'LIABILITY',
  },
  {
    key: 'loan',
    name: '長期借入金',
    group: 'LIABILITY',
    category: 'LIABILITY',
    opening: 30000000,
  },
  {
    key: 'capital',
    name: '資本金',
    group: 'CAPITAL',
    category: 'EQUITY',
    opening: 10000000,
  },
  {
    key: 'retained',
    name: '繰越利益剰余金',
    group: 'CAPITAL',
    category: 'EQUITY',
    opening: 27200000,
  },
  { key: 'sales', name: '売上高', group: 'REVENUE', category: 'REVENUE' },
  {
    key: 'cogs',
    name: '売上原価',
    group: 'EXPENSE',
    category: 'COST_OF_SALES',
  },
  {
    key: 'salary',
    name: '給料手当',
    group: 'EXPENSE',
    category: 'ADMIN_EXPENSE',
  },
  {
    key: 'insurance',
    name: '法定福利費',
    group: 'EXPENSE',
    category: 'ADMIN_EXPENSE',
  },
  {
    key: 'rent',
    name: '地代家賃',
    group: 'EXPENSE',
    category: 'ADMIN_EXPENSE',
  },
  {
    key: 'delivery',
    name: '荷造運賃',
    group: 'EXPENSE',
    category: 'SELLING_EXPENSE',
  },
  {
    key: 'fees',
    name: '支払報酬料',
    group: 'EXPENSE',
    category: 'ADMIN_EXPENSE',
  },
  {
    key: 'utilities',
    name: '水道光熱費',
    group: 'EXPENSE',
    category: 'ADMIN_EXPENSE',
  },
  {
    key: 'depreciation',
    name: '減価償却費',
    group: 'EXPENSE',
    category: 'ADMIN_EXPENSE',
  },
  {
    key: 'interest',
    name: '支払利息',
    group: 'EXPENSE',
    category: 'NON_OPERATING_EXPENSE',
  },
  { key: 'tax', name: '法人税等', group: 'EXPENSE', category: 'TAX' },
];
const ACCOUNT = new Map(DEMO_ACCOUNTS.map((a) => [a.key, a]));
const naturalDebit = (a: Account) =>
  a.group === 'ASSET' || a.group === 'EXPENSE';
const plAccount = (a: Account) =>
  a.group === 'REVENUE' || a.group === 'EXPENSE';
const sum = (values: number[]) => values.reduce((s, n) => s + n, 0);
const vat = (amount: number) => Math.round(amount / 10);
const pad = (n: number) => String(n).padStart(2, '0');
export const monthEnd = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
type Line = { key: string; value: number; tax?: number; partner?: string };
type Posting = { date: string; key: string; debit: number; credit: number };
const journals: MfV3JournalItem[] = [];
const postings: Posting[] = [];

function side(line: Line, debit: boolean): MfV3JournalLineDetails {
  const a = ACCOUNT.get(line.key)!;
  return {
    account_id: `demo-${a.key}`,
    account_name: a.name,
    value: line.value,
    tax_value: line.tax ?? 0,
    tax_name: line.tax ? (debit ? '課税仕入10%' : '課税売上10%') : '対象外',
    tax_long_name: line.tax
      ? debit
        ? '課税仕入10%'
        : '課税売上10%'
      : '対象外',
    trade_partner_name: line.partner ?? null,
    invoice_kind: line.tax
      ? 'INVOICE_KIND_QUALIFIED'
      : 'INVOICE_KIND_NOT_TARGET',
  };
}

function add(date: string, memo: string, debits: Line[], credits: Line[]) {
  const total = (lines: Line[]) =>
    sum(lines.map((l) => l.value + (l.tax ?? 0)));
  if (total(debits) !== total(credits))
    throw new Error(`Unbalanced demo journal: ${date} ${memo}`);
  for (const [lines, debit] of [
    [debits, true],
    [credits, false],
  ] as const) {
    for (const l of lines) {
      if (!Number.isSafeInteger(l.value) || l.value < 0)
        throw new Error('Invalid demo amount');
      postings.push({
        date,
        key: l.key,
        debit: debit ? l.value : 0,
        credit: debit ? 0 : l.value,
      });
      if (l.tax)
        postings.push({
          date,
          key: debit ? 'vatIn' : 'vatOut',
          debit: debit ? l.tax : 0,
          credit: debit ? 0 : l.tax,
        });
    }
  }
  const number = journals.length + 1;
  journals.push({
    id: `demo-${date}-${number}`,
    number,
    term_period: 1,
    transaction_date: date,
    is_realized: true,
    journal_type: 'journal_entry',
    entered_by: 'デモ担当者',
    create_time: `${date}T09:00:00+09:00`,
    update_time: `${date}T09:00:00+09:00`,
    branches: Array.from(
      { length: Math.max(debits.length, credits.length) },
      (_, i) => ({
        remark: memo,
        ...(debits[i] ? { debitor: side(debits[i], true) } : {}),
        ...(credits[i] ? { creditor: side(credits[i], false) } : {}),
      }),
    ),
    memo,
    tags: ['架空データ'],
    voucher_file_ids: [],
  });
}
function totals(key: string, start: string, end: string) {
  const rows = postings.filter(
    (p) => p.key === key && p.date >= start && p.date <= end,
  );
  return {
    debit: sum(rows.map((p) => p.debit)),
    credit: sum(rows.map((p) => p.credit)),
  };
}
export function demoBalance(key: string, end: string): number {
  const a = ACCOUNT.get(key)!;
  if (key === 'retained') {
    return (
      (a.opening ?? 0) +
      sum(
        Array.from(
          { length: Math.max(0, Number(end.slice(0, 4)) - 2022) },
          (_, i) => profit(`${2022 + i}-12-31`),
        ),
      )
    );
  }
  const t = totals(
    key,
    plAccount(a) ? `${end.slice(0, 4)}-01-01` : '2022-01-01',
    end,
  );
  return (
    (a.opening ?? 0) +
    (naturalDebit(a) ? t.debit - t.credit : t.credit - t.debit)
  );
}
export function demoMonthAmount(
  key: string,
  year: number,
  month: number,
): number {
  const a = ACCOUNT.get(key)!;
  if (!plAccount(a)) return demoBalance(key, monthEnd(year, month));
  const t = totals(key, `${year}-${pad(month)}-01`, monthEnd(year, month));
  return naturalDebit(a) ? t.debit - t.credit : t.credit - t.debit;
}
const profit = (end: string) =>
  sum(
    DEMO_ACCOUNTS.filter(plAccount).map(
      (a) => demoBalance(a.key, end) * (a.group === 'REVENUE' ? 1 : -1),
    ),
  );

// Opening ledger is explicit and excluded from payment extraction by its memo.
add(
  '2022-01-01',
  '開始残高',
  DEMO_ACCOUNTS.filter((a) => naturalDebit(a) && a.opening).map((a) => ({
    key: a.key,
    value: a.opening!,
  })),
  DEMO_ACCOUNTS.filter((a) => !naturalDebit(a) && a.opening).map((a) => ({
    key: a.key,
    value: a.opening!,
  })),
);
// Opening values belong to the trial balance, not the period movement columns.
postings.splice(0);
const seasonalSales = [
  14000000, 14500000, 16500000, 16000000, 15000000, 17000000, 18000000,
  16500000, 17500000, 18500000, 20500000, 22000000,
];
let lastSocial = 0;
for (let year = 2022; year <= DEMO_YEAR; year++) {
  for (
    let month = 1;
    month <= (year === DEMO_YEAR ? DEMO_MONTH : 12);
    month++
  ) {
    const date = (day: number) => `${year}-${pad(month)}-${pad(day)}`;
    const end = monthEnd(year, month);
    const before = new Date(Date.UTC(year, month - 1, 0))
      .toISOString()
      .slice(0, 10);
    if (month === 1 || month === 7) {
      const due = month === 1 ? 20 : 10;
      const balance = demoBalance('withheld', before);
      if (balance)
        add(
          date(due),
          '源泉所得税 納期の特例 納付',
          [{ key: 'withheld', value: balance }],
          [{ key: 'cash', value: balance }],
        );
    }
    if (month === 2) {
      for (const key of ['taxPayable', 'vatPayable']) {
        const value = demoBalance(key, `${year - 1}-12-31`);
        if (value)
          add(
            end,
            `${ACCOUNT.get(key)!.name} 前期確定分納付`,
            [{ key, value }],
            [{ key: 'cash', value }],
          );
      }
    }
    if (lastSocial)
      add(
        date(15),
        '前月分 社会保険料納付',
        [
          { key: 'social', value: lastSocial },
          { key: 'socialPayable', value: lastSocial },
        ],
        [{ key: 'cash', value: lastSocial * 2 }],
      );
    const sales = Math.round(
      seasonalSales[month - 1] * (1 + (year - 2022) * 0.075),
    );
    const cost = Math.round(sales * (0.7 - (year - 2022) * 0.003));
    const stockTarget =
      12000000 +
      (year - 2022) * 500000 +
      (month >= 9 && month <= 11
        ? 2500000
        : month === 12
          ? 1000000
          : month * 100000);
    const purchase = cost + stockTarget - demoBalance('stock', before);
    const oldAr = demoBalance('ar', before);
    const oldAp = demoBalance('ap', before);
    add(
      date(20),
      '前月売掛金 回収（架空取引先）',
      [{ key: 'cash', value: oldAr }],
      [{ key: 'ar', value: oldAr }],
    );
    add(
      date(20),
      '前月買掛金 支払（架空仕入先）',
      [{ key: 'ap', value: oldAp }],
      [{ key: 'cash', value: oldAp }],
    );
    add(
      date(21),
      '生活用品卸売 商品売上',
      [{ key: 'ar', value: sales + vat(sales) }],
      [
        {
          key: 'sales',
          value: sales,
          tax: vat(sales),
          partner: '架空・つばさ小売株式会社',
        },
      ],
    );
    add(
      date(22),
      '生活用品 商品仕入',
      [
        {
          key: 'stock',
          value: purchase,
          tax: vat(purchase),
          partner: '架空・ひかり製品株式会社',
        },
      ],
      [{ key: 'ap', value: purchase + vat(purchase) }],
    );
    add(
      end,
      '商品払出 売上原価計上',
      [{ key: 'cogs', value: cost }],
      [{ key: 'stock', value: cost }],
    );
    const salary = 1800000 + (year - 2022) * 80000;
    const social = Math.round(salary * 0.14);
    const withholding = 60000 + (year - 2022) * 3000;
    add(
      date(25),
      '当月給与 支払',
      [{ key: 'salary', value: salary, partner: '架空従業員8名' }],
      [
        { key: 'cash', value: salary - social - withholding },
        { key: 'withheld', value: withholding },
        { key: 'social', value: social },
      ],
    );
    add(
      date(25),
      '会社負担 社会保険料計上',
      [{ key: 'insurance', value: social }],
      [{ key: 'socialPayable', value: social }],
    );
    lastSocial = social;
    add(
      date(25),
      '税理士 顧問報酬 支払',
      [
        {
          key: 'fees',
          value: 100000,
          tax: 10000,
          partner: '架空・七海税理士事務所',
        },
      ],
      [
        { key: 'cash', value: 99790 },
        { key: 'withheld', value: 10210 },
      ],
    );
    for (const [key, value] of [
      ['rent', 600000],
      ['delivery', Math.round(sales * 0.025)],
      ['utilities', 150000 + month * 5000],
    ] as const) {
      add(
        date(27),
        `${ACCOUNT.get(key)!.name} 支払`,
        [{ key, value, tax: vat(value), partner: '架空取引先' }],
        [{ key: 'cash', value: value + vat(value) }],
      );
    }
    if (year === 2024 && month === 4)
      add(
        date(15),
        '倉庫設備更新',
        [{ key: 'equipment', value: 6000000, tax: 600000 }],
        [{ key: 'cash', value: 6600000 }],
      );
    add(
      end,
      '月次減価償却',
      [{ key: 'depreciation', value: 200000 }],
      [{ key: 'equipment', value: 200000 }],
    );
    const loanBalance = demoBalance('loan', before);
    const interest = Math.round((loanBalance * 0.015) / 12);
    add(
      end,
      '架空みらい銀行 借入返済',
      [
        { key: 'loan', value: 250000 },
        { key: 'interest', value: interest },
      ],
      [{ key: 'cash', value: 250000 + interest }],
    );
    // Training provision at 30% is an explicit illustrative assumption, not a tax filing calculation.
    const pretaxMonth =
      demoMonthAmount('sales', year, month) -
      sum(
        DEMO_ACCOUNTS.filter(
          (a) => a.group === 'EXPENSE' && a.key !== 'tax',
        ).map((a) => demoMonthAmount(a.key, year, month)),
      );
    const corporateTax = Math.round(Math.max(pretaxMonth, 0) * 0.3);
    add(
      end,
      '法人税等 月次概算計上（研修用30%）',
      [{ key: 'tax', value: corporateTax }],
      [{ key: 'taxPayable', value: corporateTax }],
    );
    if (month === 12) {
      const output = demoBalance('vatOut', end),
        input = demoBalance('vatIn', end);
      add(
        end,
        '消費税 決算振替',
        [{ key: 'vatOut', value: output }],
        [
          { key: 'vatIn', value: input },
          { key: 'vatPayable', value: output - input },
        ],
      );
    }
  }
}

export function demoOffice(): MfOffice {
  return {
    name: DEMO_COMPANY_NAME,
    code: DEMO_CODE,
    type: 'corporate',
    accounting_periods: [2026, 2025, 2024, 2023, 2022].map((year) => ({
      fiscal_year: year,
      start_date: `${year}-01-01`,
      end_date: `${year}-12-31`,
    })),
  };
}
export function demoAccounts(): { accounts: MfAccount[] } {
  return {
    accounts: DEMO_ACCOUNTS.map((a) => ({
      id: `demo-${a.key}`,
      name: a.name,
      account_group: a.group,
      category: a.category,
      financial_statement_type: plAccount(a) ? 'PROFIT_LOSS' : 'BALANCE_SHEET',
      available: true,
      sub_accounts: [],
    })),
  };
}
export function demoJournals(params?: {
  startDate?: string;
  endDate?: string;
}) {
  return {
    journals: structuredClone(
      journals.filter(
        (j) =>
          j.transaction_date >= (params?.startDate ?? `${DEMO_YEAR}-01-01`) &&
          j.transaction_date <= (params?.endDate ?? DEMO_AS_OF),
      ),
    ),
    truncated: false,
  };
}
function period(year = DEMO_YEAR, endMonth?: number) {
  if (!Number.isInteger(year) || year < 2022 || year > DEMO_YEAR)
    throw new BadRequestException('デモの会計期間は2022〜2026年です');
  const month = endMonth ?? (year === DEMO_YEAR ? DEMO_MONTH : 12);
  if (!Number.isInteger(month) || month < 1 || month > 12)
    throw new BadRequestException('月は1〜12で指定してください');
  return {
    year,
    month,
    start: `${year}-01-01`,
    end: monthEnd(year, Math.min(month, year === DEMO_YEAR ? DEMO_MONTH : 12)),
  };
}
type Values = (key: string) => number[];
function statementRows(
  kind: 'pl' | 'bs',
  values: Values,
  netValues: number[],
): MfReportRow[] {
  const leaf = (key: string): MfReportRow => ({
    name: ACCOUNT.get(key)!.name,
    type: 'account',
    values: values(key),
    rows: null,
  });
  const rollup = (
    name: string,
    rows: MfReportRow[],
    type: MfReportRow['type'] = 'financial_statement_item',
  ): MfReportRow => ({
    name,
    type,
    rows,
    values: netValues.map((_, i) => sum(rows.map((r) => r.values[i] ?? 0))),
  });
  const calc = (name: string, terms: [MfReportRow, number][]): MfReportRow => ({
    name,
    type: 'financial_statement_item',
    rows: null,
    values: netValues.map((_, i) =>
      sum(terms.map(([r, sign]) => (r.values[i] ?? 0) * sign)),
    ),
  });
  if (kind === 'pl') {
    const sales = rollup('売上高合計', [leaf('sales')]);
    const cogs = leaf('cogs');
    const gross = calc('売上総利益', [
      [sales, 1],
      [cogs, -1],
    ]);
    const sga = rollup(
      '販売費及び一般管理費合計',
      [
        'salary',
        'insurance',
        'rent',
        'delivery',
        'fees',
        'utilities',
        'depreciation',
      ].map(leaf),
    );
    const op = calc('営業利益', [
      [gross, 1],
      [sga, -1],
    ]);
    const nonOp = rollup('営業外費用合計', [leaf('interest')]);
    const ordinary = calc('経常利益', [
      [op, 1],
      [nonOp, -1],
    ]);
    const pretax = calc('税引前当期純利益', [[ordinary, 1]]);
    const tax = leaf('tax');
    return [
      sales,
      cogs,
      gross,
      sga,
      op,
      nonOp,
      ordinary,
      pretax,
      tax,
      calc('当期純利益', [
        [pretax, 1],
        [tax, -1],
      ]),
    ];
  }
  const assets = rollup(
    '資産合計',
    [
      rollup('流動資産', [
        rollup('現金及び預金', [leaf('cash')]),
        rollup('売上債権合計', [leaf('ar')]),
        rollup('棚卸資産', [leaf('stock')]),
        leaf('vatIn'),
      ]),
      rollup('固定資産', [leaf('equipment')]),
    ],
    'assets',
  );
  const liabilities = rollup(
    '負債合計',
    [
      rollup(
        '流動負債',
        [
          'ap',
          'withheld',
          'social',
          'socialPayable',
          'vatOut',
          'vatPayable',
          'taxPayable',
        ].map(leaf),
      ),
      rollup('固定負債', [leaf('loan')]),
    ],
    'liabilities',
  );
  const equity = rollup(
    '純資産合計',
    [
      leaf('capital'),
      leaf('retained'),
      {
        name: '当期純利益',
        type: 'financial_statement_item',
        values: netValues,
        rows: null,
      },
    ],
    'net_assets',
  );
  const total = rollup(
    '負債純資産合計',
    [liabilities, equity],
    'liabilities_net_assets',
  );
  total.rows = null; // A total is not a second copy of the account tree.
  return [assets, liabilities, equity, total];
}
export function demoTrialBalance(
  kind: 'pl' | 'bs',
  fiscalYear?: number,
  endMonth?: number,
  startMonth = 1,
): MfTrialBalance {
  const p = period(fiscalYear, endMonth);
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > p.month)
    throw new BadRequestException('Invalid start month');
  const start = `${p.year}-${pad(startMonth)}-01`;
  const before = new Date(Date.UTC(p.year, startMonth - 1, 0))
    .toISOString()
    .slice(0, 10);
  const values: Values = (key) => {
    const a = ACCOUNT.get(key)!,
      t = totals(key, start, p.end);
    const opening = plAccount(a)
      ? 0
      : demoBalance(key, before) +
        (key === 'retained' && startMonth === 1 ? profit(before) : 0);
    return [
      opening,
      t.debit,
      t.credit,
      plAccount(a)
        ? naturalDebit(a)
          ? t.debit - t.credit
          : t.credit - t.debit
        : demoBalance(key, p.end),
      0,
    ];
  };
  return {
    report_type: `trial_balance_${kind}`,
    columns: [
      'opening_balance',
      'debit_amount',
      'credit_amount',
      'closing_balance',
      'ratio',
    ],
    rows: statementRows(kind, values, [
      startMonth === 1 ? 0 : profit(before),
      0,
      0,
      profit(p.end),
      0,
    ]),
    start_date: start,
    end_date: p.end,
  };
}
export function demoTransition(
  kind: 'pl' | 'bs',
  fiscalYear?: number,
  endMonth?: number,
): MfTransition {
  const p = period(fiscalYear, endMonth);
  const months = Array.from({ length: p.month }, (_, i) => i + 1);
  const values: Values = (key) => {
    const a = ACCOUNT.get(key)!;
    const monthly = months.map((m) =>
      p.year === DEMO_YEAR && m > DEMO_MONTH
        ? null
        : plAccount(a)
          ? demoMonthAmount(key, p.year, m)
          : demoBalance(key, monthEnd(p.year, m)),
    );
    return [
      ...monthly,
      0,
      plAccount(a) ? sum(monthly.map((v) => v ?? 0)) : demoBalance(key, p.end),
    ] as number[];
  };
  return {
    report_type: `transition_${kind}`,
    fiscal_year: p.year,
    start_month: 1,
    end_month: p.month,
    start_date: p.start,
    end_date: p.end,
    columns: [...months.map(String), 'settlement_balance', 'total'],
    rows: statementRows(kind, values, [
      ...months.map((m) =>
        profit(
          monthEnd(p.year, Math.min(m, p.year === DEMO_YEAR ? DEMO_MONTH : 12)),
        ),
      ),
      0,
      profit(p.end),
    ]),
  };
}
