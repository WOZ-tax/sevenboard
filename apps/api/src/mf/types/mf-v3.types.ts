// MoneyForward Cloud Accounting Public API v3 wire types.
//
// Faithful to the OpenAPI 3.0.3 contract published at
// https://developers.api-accounting.moneyforward.com/v3/openapi.yaml
// These are the raw REST shapes as returned by the API. Adapters in
// mf-v3-adapter.ts convert them into the SevenBoard-internal types in
// mf-api.types.ts. Keep this file free of business logic.
//
// IDs returned by the API (account_id, transaction_id, journal id, ...) are
// already URL-encoded strings. They must be echoed back to the API verbatim;
// re-encoding them double-encodes and yields empty results.

// ── Common ──────────────────────────────────────────────

export interface MfV3Metadata {
  total_count: number;
  total_pages: number;
}

export interface MfV3ErrorItem {
  code: string;
  message: string;
}

export interface MfV3ErrorResponse {
  errors: MfV3ErrorItem[];
}

// ── Office / term settings ──────────────────────────────

export interface MfV3AccountingPeriod {
  start_date: string;
  end_date: string;
  fiscal_year: number;
}

export interface MfV3Office {
  name: string;
  code: string;
  type: 'INDIVIDUAL' | 'CORPORATE' | string;
  employee_count?: string | null;
  is_real_estate?: boolean | null;
  is_manufacturing: boolean;
  pl_name_value_display_option?: string | null;
  accounting_periods: MfV3AccountingPeriod[];
}

export interface MfV3TermSetting {
  fiscal_year: number;
  start_date: string;
  end_date: string;
  accounting_method?: string;
  tax_method?: string;
  sales_rounding_method?: string;
  purchases_rounding_method?: string;
  prefecture?: string;
  business_types?: string[];
}

export interface MfV3TermSettingsResponse {
  term_settings: MfV3TermSetting[];
}

// ── Accounts / sub accounts ─────────────────────────────

export type MfV3AccountGroup =
  | 'NONE'
  | 'ASSET'
  | 'LIABILITY'
  | 'CAPITAL'
  | 'REVENUE'
  | 'EXPENSE';

export interface MfV3SubAccount {
  id: string;
  account_id: string;
  name: string;
  search_key?: string | null;
  tax_id?: string;
}

export interface MfV3Account {
  id: string;
  name: string;
  financial_statement_type:
    | 'BALANCE_SHEET'
    | 'PROFIT_LOSS'
    | 'COST_REPORT'
    | 'REAL_ESTATE'
    | 'UNKNOWN'
    | string;
  available: boolean;
  tax_id?: string;
  search_key?: string | null;
  sub_accounts: MfV3SubAccount[];
  account_group: MfV3AccountGroup;
  category: string;
}

export interface MfV3AccountResponse {
  accounts: MfV3Account[];
}

export interface MfV3SubAccountResponse {
  sub_accounts: MfV3SubAccount[];
}

// ── Departments ─────────────────────────────────────────

export interface MfV3Department {
  id: string;
  name: string;
  parent_id: string | null;
  search_key: string | null;
}

export interface MfV3DepartmentResponse {
  departments: MfV3Department[];
}

// ── Taxes ───────────────────────────────────────────────

export interface MfV3Tax {
  id: string;
  name: string;
  abbreviation?: string;
  available: boolean;
  tax_rate?: number;
  search_key?: string | null;
}

export interface MfV3TaxResponse {
  taxes: MfV3Tax[];
}

// ── Trade partners ──────────────────────────────────────

export interface MfV3TradePartner {
  code: string;
  name: string;
  available?: boolean;
  invoice_registration_number?: string;
  corporate_number?: string;
  search_key?: string;
}

export interface MfV3TradePartnersResponse {
  trade_partners: MfV3TradePartner[];
}

export interface MfV3PostTradePartnersRequest {
  trade_partners: Array<{
    name: string;
    search_key?: string;
    invoice_registration_number?: string;
    corporate_number?: string;
  }>;
}

// ── Connected accounts ──────────────────────────────────

export interface MfV3ConnectedSubAccount {
  id: string;
  account_id: string;
  sub_account_id: string;
  name: string;
}

export interface MfV3ConnectedAccount {
  id: string;
  name: string;
  is_manual: boolean;
  account_id: string;
  sub_account_id: string;
  connected_sub_accounts: MfV3ConnectedSubAccount[];
}

export interface MfV3ConnectedAccountsResponse {
  connected_accounts: MfV3ConnectedAccount[];
}

// ── Reports (trial balance / transition) ────────────────

export type MfV3RowType =
  | 'assets'
  | 'liabilities'
  | 'net_assets'
  | 'liabilities_net_assets'
  | 'financial_statement_item'
  | 'account'
  | 'sub_account';

export interface MfV3ReportRow {
  name: string;
  type: MfV3RowType;
  values: (number | null)[];
  rows: MfV3ReportRow[] | null;
}

export interface MfV3TbResponse {
  report_type: 'trial_balance_bs' | 'trial_balance_pl' | string;
  columns: string[];
  rows: MfV3ReportRow[];
  start_date: string;
  end_date: string;
  created_at?: string;
}

export interface MfV3TransitionResponse {
  report_type: 'transition_bs' | 'transition_pl' | string;
  columns: string[];
  rows: MfV3ReportRow[];
  fiscal_year: number;
  start_month: number;
  end_month: number;
  start_date: string;
  end_date: string;
  created_at?: string;
}

export interface MfV3TbQuery {
  fiscal_year?: number;
  start_month?: number;
  end_month?: number;
  start_date?: string;
  end_date?: string;
  with_sub_accounts?: boolean;
  include_tax?: boolean;
  journal_types?: ('journal_entry' | 'adjusting_entry')[];
}

export interface MfV3TransitionQuery {
  type: 'monthly';
  fiscal_year?: number;
  start_month?: number;
  end_month?: number;
  with_sub_accounts?: boolean;
  include_tax?: boolean;
}

// ── Journals ────────────────────────────────────────────

export type MfV3InvoiceKind =
  | 'INVOICE_KIND_NONE'
  | 'INVOICE_KIND_NOT_TARGET'
  | 'INVOICE_KIND_QUALIFIED'
  | 'INVOICE_KIND_UNQUALIFIED_80'
  | 'INVOICE_KIND_UNQUALIFIED_50'
  | 'INVOICE_KIND_UNQUALIFIED';

export interface MfV3JournalLineDetails {
  value: number;
  tax_value?: number | null;
  account_id: string;
  account_name: string;
  sub_account_id?: string | null;
  sub_account_name?: string | null;
  tax_id?: string | null;
  tax_name?: string | null;
  tax_long_name?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  trade_partner_code?: string | null;
  trade_partner_name?: string | null;
  invoice_kind?: MfV3InvoiceKind | null;
}

export interface MfV3JournalLine {
  remark?: string | null;
  creditor?: MfV3JournalLineDetails;
  debitor?: MfV3JournalLineDetails;
}

export interface MfV3JournalItem {
  id: string;
  number: number;
  term_period: number;
  transaction_date: string;
  is_realized: boolean;
  journal_type: 'journal_entry' | 'adjusting_entry';
  entered_by: string;
  create_time: string;
  update_time: string;
  branches: MfV3JournalLine[];
  tags: string[];
  memo?: string | null;
  voucher_file_ids: string[];
  transaction_id?: string | null;
}

export interface MfV3GetJournalsResponse {
  journals: MfV3JournalItem[];
  metadata: MfV3Metadata;
}

export interface MfV3JournalsQuery {
  start_date?: string;
  end_date?: string;
  account_id?: string;
  is_realized?: boolean;
  transaction_ids?: string[];
  page?: number;
  per_page?: number;
}

export interface MfV3CRUDJournalResponse {
  journal: MfV3JournalItem;
}

export interface MfV3CRUDJournalLineDetails {
  value: number;
  tax_id?: string;
  account_id: string;
  sub_account_id?: string;
  department_id?: string;
  trade_partner_code?: string;
  invoice_kind?: MfV3InvoiceKind;
}

export interface MfV3CRUDJournalLine {
  remark?: string;
  creditor?: MfV3CRUDJournalLineDetails;
  debitor?: MfV3CRUDJournalLineDetails;
}

export interface MfV3CRUDJournalRequest {
  journal: {
    transaction_date: string;
    journal_type?: 'journal_entry' | 'adjusting_entry';
    memo?: string;
    tags?: string[];
    branches: MfV3CRUDJournalLine[];
  };
}

// ── Transactions (連携明細) ──────────────────────────────

export type MfV3JournalizingStatus =
  | 'excluded'
  | 'none'
  | 'registered'
  | 'modified'
  | 'new_voucher_attached';

export interface MfV3Transaction {
  id: string;
  date: string;
  value: number;
  side: 'INCOME' | 'EXPENSE';
  content?: string;
  memo?: string;
  journalizing_status: MfV3JournalizingStatus;
  connected_account_id?: string;
  connected_sub_account_id?: string;
  voucher_file_ids?: string[];
}

export interface MfV3GetTransactionsResponse {
  transactions: MfV3Transaction[];
  metadata: MfV3Metadata;
}

export interface MfV3TransactionsQuery {
  start_date: string;
  end_date: string;
  connected_account_id?: string;
  connected_sub_account_id?: string;
  value_min?: number;
  value_max?: number;
  side?: 'INCOME' | 'EXPENSE';
  content?: string;
  content_match_type?: 'exact' | 'partial' | 'forward' | 'backward';
  journalizing_statuses?: MfV3JournalizingStatus[];
  order?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
}

export interface MfV3PostTransactionsRequest {
  connected_account_id: string;
  transactions: Array<{
    date: string;
    value: number;
    side: 'INCOME' | 'EXPENSE';
    content?: string;
    memo?: string;
  }>;
}

export interface MfV3PostTransactionsResponse {
  transactions: MfV3Transaction[];
}

export interface MfV3PostTransactionJournalizeRequest {
  transaction_id: string;
  [key: string]: unknown;
}

// ── Vouchers (証憑) ──────────────────────────────────────

export interface MfV3PostVouchersRequest {
  journal_id?: string | null;
  voucher_files: Array<{ file_name: string; file_data: string }>;
}

export interface MfV3PostVouchersResponse {
  voucher_file_ids: Array<{ file_name: string; file_id: string }>;
}

export interface MfV3DeleteVouchersRequest {
  journal_id: string;
  voucher_file_id: string;
}
