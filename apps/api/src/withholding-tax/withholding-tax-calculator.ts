import {
  WITHHOLDING_TAX_CATEGORY_LABELS,
  type WithholdingTaxCategory,
  type WithholdingTaxEntry,
  type WithholdingTaxJournalInput,
  type WithholdingTaxJournalSide,
  type WithholdingTaxMonthlySummaryRow,
  type WithholdingTaxPaymentStatementRow,
  type WithholdingTaxSummaryRow,
} from './withholding-tax.types';

const LOW_WITHHOLDING_RATE = 0.1021;

const TAX_PAYMENT_RE =
  /(源泉|所得税|預り金).*(納付|支払|振替)|納付書|税務署|ダイレクト納付|e-?tax/i;
const OPENING_OR_TRANSFER_RE = /(開始残高|期首|繰越|振替|年末調整|還付|充当)/;
const WITHHOLDING_RE = /(源泉|所得税|預り金)/;
const SOURCE_ACCOUNT_RE =
  /(役員報酬|給料|給与|賞与|退職|報酬|士業|税理士|弁護士|司法書士|行政書士|社労士|原稿|講演|業務委託|外注費|支払手数料)/;
const UNPAID_ACCOUNT_RE = /(未払金|未払費用|未払給与|未払報酬)/;

export function buildWithholdingTaxEntries(
  journals: WithholdingTaxJournalInput[],
): WithholdingTaxEntry[] {
  const entries: WithholdingTaxEntry[] = [];
  for (const journal of journals) {
    const extracted = extractWithholdingEntry(journal);
    if (extracted) entries.push(extracted);
  }
  return entries;
}

export function extractWithholdingEntry(
  journal: WithholdingTaxJournalInput,
): WithholdingTaxEntry | null {
  const allText = joinText([
    journal.memo,
    journal.partnerName,
    ...journal.debits.flatMap(sideTextParts),
    ...journal.credits.flatMap(sideTextParts),
  ]);

  if (TAX_PAYMENT_RE.test(allText) || OPENING_OR_TRANSFER_RE.test(allText)) {
    return null;
  }

  const taxSides = journal.credits.filter((side) => isWithholdingTaxSide(side));
  if (taxSides.length === 0) return null;

  const withholdingTax = sumAmounts(taxSides);
  if (withholdingTax <= 0) return null;

  const sourceSides = journal.debits.filter((side) => isSourcePaymentSide(side));
  const sourceAmount = sumAmounts(sourceSides);
  const sourceSide = pickLargestSide(sourceSides);
  const taxSide = pickLargestSide(taxSides);
  const sourceText = joinText([
    journal.memo,
    journal.partnerName,
    ...sourceSides.flatMap(sideTextParts),
    ...taxSides.flatMap(sideTextParts),
  ]);
  const category = detectCategory(sourceText);
  const paymentAmountEstimated = sourceAmount <= 0;
  const paymentAmount = paymentAmountEstimated
    ? Math.round(withholdingTax / LOW_WITHHOLDING_RATE)
    : sourceAmount;

  const dateInfo = computePaymentDate(journal.date, [
    ...journal.debits,
    ...journal.credits,
  ]);
  const warnings: string[] = [];
  if (paymentAmountEstimated) {
    warnings.push('支払金額が仕訳から取れないため源泉税額から逆算しています。');
  }
  if (dateInfo.adjusted) {
    warnings.push('未払計上の可能性があるため、支払月を翌月として扱っています。');
  }
  if (!journal.partnerName && !sourceSide?.partnerName && !taxSide?.partnerName) {
    warnings.push('支払先名を仕訳から特定できません。');
  }
  if (sourceSides.length === 0) {
    warnings.push('支払側の科目を明確に特定できません。');
  }

  const payeeName =
    sourceSide?.partnerName ??
    taxSide?.partnerName ??
    journal.partnerName ??
    null;

  return {
    id: `${journal.id}:withholding`,
    journalId: journal.id,
    journalNumber: journal.number,
    sourceDate: journal.date,
    paymentDate: dateInfo.paymentDate,
    month: dateInfo.month,
    payeeName,
    memo: journal.memo,
    category,
    categoryLabel: WITHHOLDING_TAX_CATEGORY_LABELS[category],
    paymentAmount,
    withholdingTax,
    paymentAmountEstimated,
    sourceAccountName: sourceSide?.accountName ?? null,
    sourceSubAccountName: sourceSide?.subAccountName ?? null,
    withholdingAccountName: taxSide?.accountName ?? null,
    withholdingSubAccountName: taxSide?.subAccountName ?? null,
    confidence: warnings.length === 0 ? 'HIGH' : sourceSides.length > 0 ? 'MEDIUM' : 'LOW',
    warnings,
  };
}

export function buildWithholdingTaxSummary(entries: WithholdingTaxEntry[]): {
  categorySummary: WithholdingTaxSummaryRow[];
  monthlySummary: WithholdingTaxMonthlySummaryRow[];
  paymentStatements: WithholdingTaxPaymentStatementRow[];
  totals: {
    count: number;
    payeeCount: number;
    paymentAmount: number;
    withholdingTax: number;
    warningCount: number;
  };
} {
  const categoryRows = new Map<WithholdingTaxCategory, WithholdingTaxEntry[]>();
  const monthlyRows = new Map<number, WithholdingTaxEntry[]>();
  for (const entry of entries) {
    pushMap(categoryRows, entry.category, entry);
    if (entry.month != null) pushMap(monthlyRows, entry.month, entry);
  }

  const categorySummary = Array.from(categoryRows.entries())
    .map(([category, rows]) => ({
      category,
      categoryLabel: WITHHOLDING_TAX_CATEGORY_LABELS[category],
      ...summarizeRows(rows),
    }))
    .sort((a, b) => categorySortIndex(a.category) - categorySortIndex(b.category));

  const monthlySummary = Array.from(monthlyRows.entries())
    .map(([month, rows]) => ({ month, ...summarizeRows(rows) }))
    .sort((a, b) => a.month - b.month);

  const paymentStatements = buildPaymentStatements(entries);
  const totalRow = summarizeRows(entries);
  return {
    categorySummary,
    monthlySummary,
    paymentStatements,
    totals: {
      ...totalRow,
      warningCount: entries.reduce((sum, row) => sum + row.warnings.length, 0),
    },
  };
}

export function normalizeMfJournalForWithholding(
  raw: unknown,
): WithholdingTaxJournalInput | null {
  const obj = raw as Record<string, unknown>;
  const id = pickString(obj.id);
  if (!id) return null;

  const branches = Array.isArray(obj.branches)
    ? (obj.branches as Record<string, unknown>[])
    : [];
  const debits: WithholdingTaxJournalSide[] = [];
  const credits: WithholdingTaxJournalSide[] = [];
  let firstRemark: string | null = null;
  let firstPartner: string | null = null;

  for (const branch of branches) {
    if (firstRemark == null) {
      const remark = pickString(branch.remark);
      if (remark) firstRemark = remark;
    }
    const debit = normalizeJournalSide(
      branch.debitor as Record<string, unknown> | undefined,
    );
    if (debit) {
      debits.push(debit);
      if (!firstPartner && debit.partnerName) firstPartner = debit.partnerName;
    }
    const credit = normalizeJournalSide(
      branch.creditor as Record<string, unknown> | undefined,
    );
    if (credit) {
      credits.push(credit);
      if (!firstPartner && credit.partnerName) firstPartner = credit.partnerName;
    }
  }

  return {
    id,
    number: normalizeNumber(obj.number),
    date:
      pickString(obj.transaction_date) ??
      pickString(obj.date) ??
      pickString(obj.issue_date) ??
      null,
    memo:
      firstRemark ??
      pickString(obj.memo) ??
      pickString(obj.description) ??
      null,
    partnerName:
      firstPartner ??
      pickString(obj.partner_name) ??
      pickString(obj.trade_partner_name) ??
      null,
    debits,
    credits,
  };
}

function buildPaymentStatements(
  entries: WithholdingTaxEntry[],
): WithholdingTaxPaymentStatementRow[] {
  const targetEntries = entries.filter(
    (entry) => entry.category !== 'SALARY' && entry.category !== 'RETIREMENT',
  );
  const grouped = new Map<string, WithholdingTaxEntry[]>();
  for (const entry of targetEntries) {
    const key = `${entry.payeeName ?? '未設定'}\t${entry.category}`;
    pushMap(grouped, key, entry);
  }

  return Array.from(grouped.entries())
    .map(([key, rows]) => {
      const [payeeName, categoryRaw] = key.split('\t');
      const category = categoryRaw as WithholdingTaxCategory;
      const h1 = rows.filter((r) => r.month != null && r.month >= 1 && r.month <= 6);
      const h2 = rows.filter((r) => r.month != null && r.month >= 7 && r.month <= 12);
      const h1Summary = summarizeRows(h1);
      const h2Summary = summarizeRows(h2);
      const total = summarizeRows(rows);
      return {
        payeeName,
        category,
        categoryLabel: WITHHOLDING_TAX_CATEGORY_LABELS[category],
        count: total.count,
        h1PaymentAmount: h1Summary.paymentAmount,
        h1WithholdingTax: h1Summary.withholdingTax,
        h2PaymentAmount: h2Summary.paymentAmount,
        h2WithholdingTax: h2Summary.withholdingTax,
        totalPaymentAmount: total.paymentAmount,
        totalWithholdingTax: total.withholdingTax,
      };
    })
    .sort((a, b) =>
      b.totalWithholdingTax === a.totalWithholdingTax
        ? a.payeeName.localeCompare(b.payeeName, 'ja')
        : b.totalWithholdingTax - a.totalWithholdingTax,
    );
}

function summarizeRows(rows: WithholdingTaxEntry[]): {
  count: number;
  payeeCount: number;
  paymentAmount: number;
  withholdingTax: number;
} {
  return {
    count: rows.length,
    payeeCount: new Set(rows.map((r) => r.payeeName).filter(Boolean)).size,
    paymentAmount: rows.reduce((sum, row) => sum + row.paymentAmount, 0),
    withholdingTax: rows.reduce((sum, row) => sum + row.withholdingTax, 0),
  };
}

function isWithholdingTaxSide(side: WithholdingTaxJournalSide): boolean {
  const text = joinText(sideTextParts(side));
  return WITHHOLDING_RE.test(text);
}

function isSourcePaymentSide(side: WithholdingTaxJournalSide): boolean {
  const text = joinText(sideTextParts(side));
  return SOURCE_ACCOUNT_RE.test(text) && !WITHHOLDING_RE.test(text);
}

function detectCategory(text: string): WithholdingTaxCategory {
  if (/退職/.test(text)) return 'RETIREMENT';
  if (/(給与|給料|賞与|役員報酬|所得税\(給与\))/.test(text)) return 'SALARY';
  if (/司法書士/.test(text)) return 'JUDICIAL_SCRIVENER';
  if (/(原稿|講演|講師|デザイン|執筆)/.test(text)) return 'MANUSCRIPT_LECTURE';
  if (/(士業|税理士|弁護士|行政書士|社労士|報酬|顧問料|業務委託|外注費)/.test(text)) {
    return 'PROFESSIONAL_FEE';
  }
  if (/所得税|源泉/.test(text)) return 'OTHER_REWARD';
  return 'OTHER';
}

function computePaymentDate(
  sourceDate: string | null,
  sides: WithholdingTaxJournalSide[],
): { paymentDate: string | null; month: number | null; adjusted: boolean } {
  const parsed = parseDate(sourceDate);
  if (!parsed) return { paymentDate: sourceDate, month: null, adjusted: false };
  const hasUnpaidSide = sides.some((side) =>
    UNPAID_ACCOUNT_RE.test(joinText(sideTextParts(side))),
  );
  if (!hasUnpaidSide) {
    return {
      paymentDate: formatDate(parsed),
      month: parsed.getUTCMonth() + 1,
      adjusted: false,
    };
  }
  const shifted = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 1));
  return {
    paymentDate: formatDate(shifted),
    month: shifted.getUTCMonth() + 1,
    adjusted: true,
  };
}

function normalizeJournalSide(
  side: Record<string, unknown> | undefined,
): WithholdingTaxJournalSide | null {
  if (!side) return null;
  const amount = Number(side.value ?? side.amount ?? 0);
  if (!Number.isFinite(amount) || amount === 0) return null;
  return {
    accountName: pickString(side.account_name) ?? '',
    subAccountName: pickString(side.sub_account_name) ?? null,
    partnerName: pickString(side.trade_partner_name) ?? null,
    amount,
  };
}

function sideTextParts(side: WithholdingTaxJournalSide): string[] {
  return [
    side.accountName,
    side.subAccountName ?? '',
    side.partnerName ?? '',
  ].filter(Boolean);
}

function pickLargestSide(
  sides: WithholdingTaxJournalSide[],
): WithholdingTaxJournalSide | undefined {
  return [...sides].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
}

function sumAmounts(sides: WithholdingTaxJournalSide[]): number {
  return sides.reduce((sum, side) => sum + Math.abs(Number(side.amount || 0)), 0);
}

function joinText(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function pushMap<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const rows = map.get(key);
  if (rows) rows.push(value);
  else map.set(key, [value]);
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function normalizeNumber(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return pickString(value) ?? null;
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function categorySortIndex(category: WithholdingTaxCategory): number {
  const order: WithholdingTaxCategory[] = [
    'SALARY',
    'RETIREMENT',
    'PROFESSIONAL_FEE',
    'JUDICIAL_SCRIVENER',
    'MANUSCRIPT_LECTURE',
    'OTHER_REWARD',
    'OTHER',
  ];
  return order.indexOf(category);
}
