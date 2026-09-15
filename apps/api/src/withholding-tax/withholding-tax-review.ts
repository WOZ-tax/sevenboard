import type { MfReportRow, MfTrialBalance } from '../mf/types/mf-api.types';
import { buildWithholdingTaxEntries } from './withholding-tax-calculator';
import type {
  WithholdingTaxEntry,
  WithholdingTaxJournalInput,
  WithholdingTaxJournalSide,
  WithholdingTaxReviewAccount,
  WithholdingTaxReviewAmounts,
  WithholdingTaxReviewDetail,
  WithholdingTaxReviewResult,
} from './withholding-tax.types';

const TAX = /源泉|所得税/;
const DEPOSIT = /預[り]?金|預[り]?税|源泉所得税|源泉税/;
const OTHER_DEPOSIT =
  /住民税|市県民税|市民税|県民税|都民税|特別徴収|社会保険|健康保険|厚生年金|雇用保険|労働保険|介護保険|社保/;
const ADJUSTMENT = /年末調整|年調|過不足|還付|充当/;
const TRANSFER = /開始残高|期首|繰越|振替|振替伝票/;
const CASH = /現金|預金/;
const REMITTANCE = /納付|納税|税務署|国税|ダイレクト納付|e-?tax/i;
const ELIGIBLE_FEE =
  /税理士|弁護士|司法書士|公認会計士|土地家屋調査士|社会保険労務士|社労士|弁理士|海事代理士|測量士|建築士|不動産鑑定士|技術士|ゼイリシ|シ[ャヤ]カイホケンロウムシ/;

export function withholdingReviewPeriod(year: number, half: 1 | 2) {
  return {
    startDate: `${year}-${half === 1 ? '01-01' : '07-01'}`,
    endDate: `${year}-${half === 1 ? '06-30' : '12-31'}`,
  };
}

/** 標準日。祝日・災害等による個別延長の判定は行わず、確認日を変更できる。 */
export function withholdingReviewDueDate(year: number, half: 1 | 2) {
  return half === 1 ? `${year}-07-10` : `${year + 1}-01-20`;
}

export function withholdingReviewDefaultCheckDate(year: number, half: 1 | 2) {
  const date = new Date(`${withholdingReviewDueDate(year, half)}T00:00:00Z`);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6)
    date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function emptyReviewAmounts(): WithholdingTaxReviewAmounts {
  return {
    aggregatedTax: 0,
    adjustments: 0,
    openingBalance: null,
    periodPayments: 0,
    periodOtherMovements: 0,
    priorAccrualTax: 0,
    deferredTax: 0,
    periodEndBalance: null,
    balanceDifference: null,
    payments: 0,
    nextPeriodTax: 0,
    otherMovements: 0,
    bookBalance: null,
    remainingBalance: null,
  };
}

/**
 * 半期末の補助科目残高を起点に、その後の仕訳を積み上げる。
 * 翌期徴収分だけを分離し、親科目の合計や別の補助科目との相殺で「0」を作らない。
 * 期首残高を 0 と仮定せず、集計との橋渡しが合わない場合も要確認にする。
 */
export function buildWithholdingTaxReview(input: {
  year: number;
  half: 1 | 2;
  checkDate: string;
  today: string;
  journals: WithholdingTaxJournalInput[];
  trialBalance: MfTrialBalance | null;
  openingTrialBalance?: MfTrialBalance | null;
  coverage: WithholdingTaxReviewResult['coverage'];
  issues?: string[];
}): WithholdingTaxReviewResult {
  const { year, half, checkDate, today, journals, trialBalance, coverage } =
    input;
  const period = withholdingReviewPeriod(year, half);
  const checkedThroughDate = checkDate < today ? checkDate : today;
  const issues = new Set(input.issues ?? []);
  const accountMap = new Map<string, WithholdingTaxReviewAccount>();
  const details: WithholdingTaxReviewDetail[] = [];
  const accountFor = (accountName: string, subAccountName?: string | null) => {
    const key = accountKey(accountName, subAccountName);
    let account = accountMap.get(key);
    if (!account) {
      account = {
        accountName,
        subAccountName: subAccountName ?? null,
        ...emptyReviewAmounts(),
      };
      accountMap.set(key, account);
    }
    return account;
  };

  const periodFinished = today > period.endDate;
  if (periodFinished) {
    if (!coverage.complete)
      issues.add('確認に必要な期間の仕訳をすべて取得できていません。');
    if (coverage.truncated)
      issues.add(
        'MFの仕訳取得上限に達しています。残高0の判定は保留しています。',
      );
    if (!trialBalance || trialBalance.end_date !== period.endDate) {
      issues.add(
        '半期末の試算表残高を確認できません。MFの会計期間・取得状況を確認してください。',
      );
    } else {
      readTaxBalances(trialBalance, accountFor, issues);
      if (trialBalance.start_date === period.startDate) {
        readTaxBalances(
          trialBalance,
          accountFor,
          issues,
          'opening_balance',
          'openingBalance',
        );
      } else {
        const openingDate = new Date(`${period.startDate}T00:00:00Z`);
        openingDate.setUTCDate(openingDate.getUTCDate() - 1);
        if (
          input.openingTrialBalance?.end_date ===
          openingDate.toISOString().slice(0, 10)
        ) {
          readTaxBalances(
            input.openingTrialBalance,
            accountFor,
            issues,
            'closing_balance',
            'openingBalance',
          );
        }
      }
    }
  }

  const entries = buildWithholdingTaxEntries(journals);
  const journalMap = new Map(journals.map((journal) => [journal.id, journal]));
  const entryMap = new Map(entries.map((entry) => [entry.journalId, entry]));
  for (const entry of entries) {
    if (
      !entry.paymentDate ||
      entry.paymentDate < period.startDate ||
      entry.paymentDate > period.endDate ||
      entry.paymentDate > today
    )
      continue;
    const journal = journalMap.get(entry.journalId)!;
    const marked = journal.credits.filter(isTaxSide);
    const markedTotal = marked.reduce((sum, side) => sum + side.amount, 0);
    if (marked.length && markedTotal === entry.withholdingTax) {
      for (const side of marked) {
        const account = accountFor(side.accountName, side.subAccountName);
        account.aggregatedTax += side.amount;
        if (entry.sourceDate && entry.sourceDate < period.startDate)
          account.priorAccrualTax += side.amount;
      }
    } else {
      accountFor(
        entry.withholdingAccountName ?? '預り金',
        entry.withholdingSubAccountName,
      ).aggregatedTax += entry.withholdingTax;
      issues.add(
        '源泉所得税の補助科目や貸借の金額を特定できない集計明細があります。',
      );
    }
    if (entry.sourceDate !== entry.paymentDate)
      issues.add(
        '未払計上から支払月を推定した明細があります。実際の支払日を確認してください。',
      );
    if (entry.paymentAmountEstimated)
      issues.add('支払科目・支払金額を特定できない集計明細があります。');
    if (!isSpecialPaymentEntry(entry))
      issues.add(
        '納期の特例の対象外、または対象か特定できない報酬が含まれます。給与・退職金・対象士業報酬の内訳を確認してください。',
      );
  }

  for (const journal of journals) {
    const date = journal.date;
    const entry = entryMap.get(journal.id);
    const priorAccrualInPeriod =
      entry?.paymentDate &&
      entry.paymentDate >= period.startDate &&
      entry.paymentDate <= period.endDate;
    if (
      !date ||
      (date < period.startDate && !priorAccrualInPeriod) ||
      date > checkedThroughDate
    )
      continue;
    const afterPeriod = date > period.endDate;
    const memo = journal.memo ?? '';
    // 同じ仕訳の給与・還付・納付を一括扱いしないよう、借方／貸方を別々に分類する。
    for (const [sides, sign] of [
      [journal.debits, -1],
      [journal.credits, 1],
    ] as const) {
      for (const side of sides) {
        if (!isTaxSide(side)) continue;
        const account = accountFor(side.accountName, side.subAccountName);
        const amount = sign * side.amount;
        let kind: WithholdingTaxReviewDetail['kind'] = 'UNCLASSIFIED';
        if (journal.isOpening) {
          kind = 'OPENING';
        } else if (side.amount < 0 || !Number.isSafeInteger(side.amount)) {
          issues.add(
            'マイナス仕訳または円未満の金額があるため、貸借の向きを確認してください。',
          );
        } else if (ADJUSTMENT.test(memo)) {
          kind = 'ADJUSTMENT';
          if (!afterPeriod) account.adjustments += amount;
          else
            issues.add(
              '納付確認期間に年末調整・還付等があります。どの半期に属する調整か確認してください。',
            );
          if (entry == null && /給与|給料|賞与/.test(memo))
            issues.add(
              '給与と年末調整が同じ仕訳に含まれています。通常の徴収額と調整額の内訳を確認してください。',
            );
        } else if (
          sign === -1 &&
          journal.credits
            .filter((credit) => CASH.test(credit.accountName))
            .reduce((sum, credit) => sum + credit.amount, 0) >=
            journal.debits
              .filter(isTaxSide)
              .reduce((sum, debit) => sum + debit.amount, 0) &&
          REMITTANCE.test(memo)
        ) {
          kind = 'PAYMENT';
          if (afterPeriod) {
            account.payments += side.amount;
            const paymentMonth = half === 1 ? `${year}-07` : `${year + 1}-01`;
            if (!date.startsWith(paymentMonth))
              issues.add(
                '通常の納付月より後の納付を含みます。納付対象の半期と摘要を確認してください。',
              );
            const statedMonth = memo.match(/(\d{1,2})月(?:分|度)/)?.[1];
            if (
              (statedMonth &&
                (half === 1
                  ? Number(statedMonth) > 6
                  : Number(statedMonth) <= 6)) ||
              (half === 1 && /下期|下半期/.test(memo)) ||
              (half === 2 && /上期|上半期/.test(memo))
            ) {
              issues.add(
                '納付摘要に別の半期を示す月・期間があります。納付額の帰属を確認してください。',
              );
            }
          } else if (date >= period.startDate) {
            account.periodPayments += side.amount;
          }
        } else if (sign === 1 && entry && !TRANSFER.test(memo)) {
          const deferred =
            !afterPeriod &&
            date >= period.startDate &&
            entry.paymentDate != null &&
            entry.paymentDate > period.endDate;
          kind = afterPeriod
            ? 'NEXT_PERIOD'
            : deferred
              ? 'DEFERRED'
              : 'WITHHOLDING';
          if (deferred) {
            account.deferredTax += amount;
            issues.add(
              '半期末の未払給与・報酬に対応する源泉税を、翌期支払予定分として分けています。推定のため実際の支払月を確認してください。',
            );
          }
          if (afterPeriod) {
            account.nextPeriodTax += amount;
            if (entry.sourceDate !== entry.paymentDate)
              issues.add(
                '確認期間に未払計上があります。翌期分として分離した源泉税の帰属を確認してください。',
              );
          }
        }
        if (kind === 'UNCLASSIFIED')
          issues.add(
            '源泉預り金に用途を特定できない増減があります。振替・相殺・納付の摘要を確認してください。',
          );
        if (afterPeriod) {
          // bookBalance は後で半期末残高を加える。翌期徴収・納付以外は別枠で残す。
          if (
            kind !== 'NEXT_PERIOD' &&
            kind !== 'PAYMENT' &&
            kind !== 'OPENING'
          )
            account.otherMovements += amount;
        } else if (date >= period.startDate && kind === 'UNCLASSIFIED') {
          account.periodOtherMovements += amount;
        }
        details.push({
          journalId: journal.id,
          journalNumber: journal.number,
          date,
          memo: journal.memo,
          accountName: side.accountName,
          subAccountName: side.subAccountName ?? null,
          kind,
          amount,
        });
      }
    }
    // 補助なし預り金の納付を、他の補助科目の源泉税と安易に相殺しない。
    if (
      afterPeriod &&
      REMITTANCE.test(memo) &&
      journal.debits.some(
        (side) =>
          DEPOSIT.test(side.accountName) &&
          !isTaxSide(side) &&
          !OTHER_DEPOSIT.test(sideText(side)),
      )
    ) {
      issues.add(
        '納付候補に源泉所得税の補助科目がない預り金があります。納付額への自動算入を保留しています。',
      );
      for (const side of journal.debits.filter(
        (side) =>
          DEPOSIT.test(side.accountName) &&
          !isTaxSide(side) &&
          !OTHER_DEPOSIT.test(sideText(side)),
      )) {
        details.push({
          journalId: journal.id,
          journalNumber: journal.number,
          date,
          memo: journal.memo,
          accountName: side.accountName,
          subAccountName: side.subAccountName ?? null,
          kind: 'UNCLASSIFIED',
          amount: -side.amount,
        });
      }
    }
  }

  const accounts = [...accountMap.values()];
  for (const account of accounts) {
    if (account.periodEndBalance == null) {
      if (periodFinished)
        issues.add(
          '源泉科目の半期末残高が不足しています。補助科目の欠落を0円として扱っていません。',
        );
      continue;
    }
    if (account.openingBalance == null) {
      issues.add(
        '半期開始時の源泉科目残高を確認できません。繰越残高を0円とは扱っていません。',
      );
    } else {
      account.balanceDifference =
        account.periodEndBalance -
        (account.openingBalance +
          account.aggregatedTax -
          account.priorAccrualTax +
          account.deferredTax +
          account.adjustments -
          account.periodPayments +
          account.periodOtherMovements);
    }
    account.bookBalance =
      account.periodEndBalance -
      account.payments +
      account.nextPeriodTax +
      account.otherMovements;
    account.remainingBalance =
      account.bookBalance - account.nextPeriodTax - account.deferredTax;
    if (account.balanceDifference != null && account.balanceDifference !== 0)
      issues.add(
        '繰越残高・期中納付・未払計上を調整しても、源泉集計と半期末残高に差があります。計上漏れ・重複を確認してください。',
      );
  }
  const totals = totalAmounts(accounts);
  const hasActivity = accounts.some(
    (account) =>
      account.aggregatedTax !== 0 ||
      account.adjustments !== 0 ||
      account.payments !== 0 ||
      (account.periodEndBalance != null && account.periodEndBalance !== 0),
  );
  let status: WithholdingTaxReviewResult['status'];
  if (!periodFinished) status = 'NOT_READY';
  else if (issues.size) status = 'REVIEW_REQUIRED';
  else if (!hasActivity) status = 'NO_DATA';
  else if (accounts.every((account) => account.remainingBalance === 0))
    status = 'CLEARED';
  else if (
    accounts.some(
      (account) =>
        account.remainingBalance != null && account.remainingBalance < 0,
    )
  )
    status = 'OVERPAID';
  else status = 'BALANCE_REMAINING';

  return {
    year,
    half,
    period,
    nominalDueDate: withholdingReviewDueDate(year, half),
    checkDate,
    checkedThroughDate,
    generatedAt: new Date().toISOString(),
    status,
    totals,
    accounts,
    details: details.sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.journalId.localeCompare(b.journalId),
    ),
    issues: [...issues],
    coverage,
  };
}

function isTaxSide(side: WithholdingTaxJournalSide): boolean {
  const text = sideText(side);
  // 取引先名・摘要にある「所得税」を理由に普通預金などを選ばない。
  return (
    (DEPOSIT.test(side.accountName) || TAX.test(side.accountName)) &&
    TAX.test(text) &&
    !OTHER_DEPOSIT.test(text) &&
    !/法人税|仮払|租税公課/.test(side.accountName)
  );
}

function sideText(side: WithholdingTaxJournalSide): string {
  return `${side.accountName} ${side.subAccountName ?? ''}`;
}

function isSpecialPaymentEntry(entry: WithholdingTaxEntry): boolean {
  if (entry.category === 'SALARY' || entry.category === 'RETIREMENT')
    return true;
  if (
    entry.category !== 'PROFESSIONAL_FEE' &&
    entry.category !== 'JUDICIAL_SCRIVENER'
  )
    return false;
  return ELIGIBLE_FEE.test(
    [
      entry.memo,
      entry.payeeName,
      entry.sourceAccountName,
      entry.sourceSubAccountName,
      entry.withholdingSubAccountName,
    ]
      .join(' ')
      .normalize('NFKC'),
  );
}

function accountKey(
  accountName: string,
  subAccountName?: string | null,
): string {
  return JSON.stringify([accountName, subAccountName || null]);
}

function readTaxBalances(
  trial: MfTrialBalance,
  accountFor: (
    name: string,
    sub?: string | null,
  ) => WithholdingTaxReviewAccount,
  issues: Set<string>,
  columnName = 'closing_balance',
  field: 'periodEndBalance' | 'openingBalance' = 'periodEndBalance',
) {
  const column = trial.columns.indexOf(columnName);
  if (column < 0) {
    issues.add('試算表の月末残高列を特定できません。');
    return;
  }
  const seen = new Set<string>();
  const walk = (
    rows: MfReportRow[],
    accountName?: string,
    subPath: string[] = [],
  ) => {
    for (const row of rows) {
      const name =
        accountName ?? (row.type === 'account' ? row.name : undefined);
      const sub = accountName ? [...subPath, row.name] : [];
      if (row.rows?.length) {
        walk(row.rows, name, sub);
        continue;
      }
      if (!name) continue;
      const subAccountName = sub.join(' / ') || null;
      if (!isTaxSide({ accountName: name, subAccountName, amount: 0 }))
        continue;
      const key = accountKey(name, subAccountName);
      const value = row.values[column];
      const account = accountFor(name, subAccountName);
      if (
        seen.has(key) ||
        typeof value !== 'number' ||
        !Number.isSafeInteger(value)
      ) {
        account[field] = null;
        issues.add('試算表の補助科目残高に欠落・重複があります。');
      } else {
        account[field] = value;
      }
      seen.add(key);
    }
  };
  walk(trial.rows);
}

function totalAmounts(
  accounts: WithholdingTaxReviewAccount[],
): WithholdingTaxReviewAmounts {
  const total = emptyReviewAmounts();
  for (const key of Object.keys(total) as Array<
    keyof WithholdingTaxReviewAmounts
  >) {
    const values = accounts.map((account) => account[key]);
    total[key] =
      values.length && values.every((value) => value !== null)
        ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
        : total[key];
  }
  return total;
}
