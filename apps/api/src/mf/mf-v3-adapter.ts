// Pure adapters: MF v3 REST wire types → SevenBoard-internal types.
//
// The v3 report/office/account shapes are structurally almost identical to the
// internal types the 58 consumers already depend on, so these adapters are thin
// and deterministic. Keeping them as free functions (no HTTP, no Nest) makes
// them unit-testable against captured fixtures.

import {
  MfAccount,
  MfOffice,
  MfReportRow,
  MfTrialBalance,
  MfTransition,
} from './types/mf-api.types';
import {
  MfV3Account,
  MfV3AccountResponse,
  MfV3GetJournalsResponse,
  MfV3JournalItem,
  MfV3Office,
  MfV3ReportRow,
  MfV3TbResponse,
  MfV3TransitionResponse,
} from './types/mf-v3.types';

export function adaptOffice(v3: MfV3Office): MfOffice {
  return {
    name: v3.name,
    code: v3.code,
    type: v3.type,
    accounting_periods: (v3.accounting_periods ?? []).map((p) => ({
      fiscal_year: p.fiscal_year,
      start_date: p.start_date,
      end_date: p.end_date,
    })),
  };
}

function adaptReportRows(rows: MfV3ReportRow[] | null | undefined): MfReportRow[] {
  if (!rows) return [];
  return rows.map((row) => ({
    name: row.name,
    type: row.type as MfReportRow['type'],
    values: row.values ?? [],
    rows: row.rows == null ? null : adaptReportRows(row.rows),
  }));
}

export function adaptTrialBalance(v3: MfV3TbResponse): MfTrialBalance {
  return {
    report_type: v3.report_type,
    columns: v3.columns ?? [],
    rows: adaptReportRows(v3.rows),
    start_date: v3.start_date,
    end_date: v3.end_date,
  };
}

export function adaptTransition(v3: MfV3TransitionResponse): MfTransition {
  return {
    report_type: v3.report_type,
    columns: v3.columns ?? [],
    rows: adaptReportRows(v3.rows),
    fiscal_year: v3.fiscal_year,
    start_date: v3.start_date,
    end_date: v3.end_date,
    start_month: v3.start_month,
    end_month: v3.end_month,
  };
}

function adaptAccount(a: MfV3Account): MfAccount {
  return {
    id: a.id,
    name: a.name,
    account_group: a.account_group as MfAccount['account_group'],
    category: a.category,
    financial_statement_type:
      a.financial_statement_type as MfAccount['financial_statement_type'],
    available: a.available,
    sub_accounts: (a.sub_accounts ?? []).map((s) => ({
      id: s.id,
      name: s.name,
    })),
  };
}

export function adaptAccounts(v3: MfV3AccountResponse): { accounts: MfAccount[] } {
  return { accounts: (v3.accounts ?? []).map(adaptAccount) };
}

/**
 * getJournals returns raw v3 journal items unchanged — consumers already read
 * the v3 journal shape (see JournalReviewService) — plus a truncated flag that
 * matches the MCP path's return contract.
 */
export function adaptJournalsResult(
  result: { journals: MfV3JournalItem[]; truncated: boolean } | MfV3GetJournalsResponse,
): { journals: MfV3JournalItem[]; truncated: boolean } {
  return {
    journals: result.journals ?? [],
    truncated: 'truncated' in result ? result.truncated : false,
  };
}
