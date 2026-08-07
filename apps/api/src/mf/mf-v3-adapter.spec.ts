import {
  adaptAccounts,
  adaptJournalsResult,
  adaptOffice,
  adaptTransition,
  adaptTrialBalance,
} from './mf-v3-adapter';
import {
  MfV3AccountResponse,
  MfV3Office,
  MfV3TbResponse,
  MfV3TransitionResponse,
} from './types/mf-v3.types';

// Fixtures use the OpenAPI canonical example values (non-sensitive dummy data).
// The live read-only smoke (scripts/mf-v3-smoke.mjs against a v3test token)
// confirmed the real responses carry exactly these fields, so structurally
// these stand in for captured responses without embedding a client's books.

describe('adaptOffice', () => {
  it('maps office identity and accounting periods, dropping extra fields', () => {
    const v3: MfV3Office = {
      name: 'Money Forward Inc.',
      code: '0000-0000',
      type: 'CORPORATE',
      employee_count: 'RANGE_1_5',
      is_manufacturing: false,
      is_real_estate: false,
      pl_name_value_display_option: 'SWITCH_NAME_AND_VALUE',
      accounting_periods: [
        { start_date: '2024-04-01', end_date: '2025-03-31', fiscal_year: 2024 },
        { start_date: '2023-04-01', end_date: '2024-03-31', fiscal_year: 2023 },
      ],
    };

    expect(adaptOffice(v3)).toEqual({
      name: 'Money Forward Inc.',
      code: '0000-0000',
      type: 'CORPORATE',
      accounting_periods: [
        { fiscal_year: 2024, start_date: '2024-04-01', end_date: '2025-03-31' },
        { fiscal_year: 2023, start_date: '2023-04-01', end_date: '2024-03-31' },
      ],
    });
  });
});

describe('adaptTrialBalance', () => {
  const v3: MfV3TbResponse = {
    report_type: 'trial_balance_pl',
    columns: ['opening_balance', 'debit_amount', 'credit_amount', 'closing_balance', 'ratio'],
    start_date: '2022-04-01',
    end_date: '2023-03-31',
    created_at: '2023-07-05T15:54:43.446000+09:00',
    rows: [
      {
        name: '売上高合計',
        type: 'financial_statement_item',
        values: [0, 11092, 1433636, 1422544, 100],
        rows: [
          {
            name: '売上高',
            type: 'account',
            values: [0, 0, 1395134, 1395134, 98.1],
            rows: null,
          },
        ],
      },
    ],
  };

  it('maps the report envelope and drops created_at', () => {
    const out = adaptTrialBalance(v3);
    expect(out.report_type).toBe('trial_balance_pl');
    expect(out.columns).toEqual(v3.columns);
    expect(out.start_date).toBe('2022-04-01');
    expect(out.end_date).toBe('2023-03-31');
    expect(out).not.toHaveProperty('created_at');
  });

  it('preserves nested rows and keeps leaf rows null', () => {
    const out = adaptTrialBalance(v3);
    const parent = out.rows[0];
    expect(parent.name).toBe('売上高合計');
    expect(parent.values[3]).toBe(1422544);
    expect(parent.rows).toHaveLength(1);
    expect(parent.rows![0].rows).toBeNull();
    expect(parent.rows![0].values[3]).toBe(1395134);
  });
});

describe('adaptTransition', () => {
  const v3: MfV3TransitionResponse = {
    report_type: 'transition_pl',
    columns: ['4', '5', '6', '7', '8', '9', '10', '11', '12', '1', '2', '3', 'settlement_balance', 'total'],
    fiscal_year: 2022,
    start_month: 4,
    end_month: 3,
    start_date: '2022-04-01',
    end_date: '2023-03-31',
    created_at: '2023-07-05T17:38:23.750000+09:00',
    rows: [
      {
        name: '売上高合計',
        type: 'financial_statement_item',
        values: [35042, 9091, 297137, 11819, 0, 233091, 0, 818182, 0, 0, 0, 0, 18182, 1422544],
        rows: [
          {
            name: '売上高',
            type: 'account',
            values: [25587, 9091, 293182, 0, 6910, 233091, 0, 818182, 0, 0, 0, 0, 9091, 1395134],
            rows: null,
          },
        ],
      },
    ],
  };

  it('maps all transition envelope fields including month bounds', () => {
    const out = adaptTransition(v3);
    expect(out.report_type).toBe('transition_pl');
    expect(out.fiscal_year).toBe(2022);
    expect(out.start_month).toBe(4);
    expect(out.end_month).toBe(3);
    expect(out.start_date).toBe('2022-04-01');
    expect(out.end_date).toBe('2023-03-31');
    expect(out.columns).toHaveLength(14);
    expect(out.rows[0].rows![0].name).toBe('売上高');
  });
});

describe('adaptAccounts', () => {
  it('unwraps accounts and reduces sub_accounts to {id,name}', () => {
    const v3: MfV3AccountResponse = {
      accounts: [
        {
          id: 'BowMhLnFvzZ1y9TeF5%2B3QQ%3D%3D',
          name: '現金',
          account_group: 'ASSET',
          category: 'CASH_AND_DEPOSITS',
          financial_statement_type: 'BALANCE_SHEET',
          available: true,
          tax_id: '3uHWBCFlkrY_QmW0yo06Eg',
          search_key: '現金',
          sub_accounts: [
            {
              id: 'Sb0m10vvYk2dUdLU8aGxgQ%3D%3D',
              account_id: 'BowMhLnFvzZ1y9TeF5%2B3QQ%3D%3D',
              name: '小口現金',
              tax_id: '3uHWBCFlkrY_QmW0yo06Eg',
            },
          ],
        },
      ],
    };

    expect(adaptAccounts(v3)).toEqual({
      accounts: [
        {
          id: 'BowMhLnFvzZ1y9TeF5%2B3QQ%3D%3D',
          name: '現金',
          account_group: 'ASSET',
          category: 'CASH_AND_DEPOSITS',
          financial_statement_type: 'BALANCE_SHEET',
          available: true,
          sub_accounts: [{ id: 'Sb0m10vvYk2dUdLU8aGxgQ%3D%3D', name: '小口現金' }],
        },
      ],
    });
  });

  it('tolerates a missing accounts array', () => {
    expect(adaptAccounts({} as MfV3AccountResponse)).toEqual({ accounts: [] });
  });
});

describe('adaptJournalsResult', () => {
  it('passes journals through and preserves the truncated flag', () => {
    const journals = [{ id: 'j1' }, { id: 'j2' }] as any;
    expect(adaptJournalsResult({ journals, truncated: true })).toEqual({
      journals,
      truncated: true,
    });
  });

  it('defaults truncated to false for a raw GetJournalsResponse', () => {
    const res = { journals: [{ id: 'j1' }], metadata: { total_count: 1, total_pages: 1 } } as any;
    expect(adaptJournalsResult(res)).toEqual({ journals: res.journals, truncated: false });
  });
});
