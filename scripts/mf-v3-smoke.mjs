#!/usr/bin/env node
// Read-only smoke test for the MF Cloud Accounting Public API v3 REST endpoints.
//
// Verifies that an existing OAuth access token works against the REST transport
// and that each GET response carries the fields the SevenBoard adapters
// (apps/api/src/mf/mf-v3-adapter.ts) read. It NEVER performs writes
// (POST/PUT/DELETE/journalize) and NEVER refreshes the token — an expired token
// is reported and skipped so refresh_token rotation is not triggered.
//
// Usage:
//   node scripts/mf-v3-smoke.mjs [tokenFile] [baseUrl]
// Defaults:
//   tokenFile = ~/.claude/mf-offices-v3test/0040-0597.json
//   baseUrl   = MF_V3_BASE_URL env, else _config.json restBase, else prod

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

const DEFAULT_TOKEN_FILE = join(
  homedir(),
  '.claude',
  'mf-offices-v3test',
  '0040-0597.json',
);
const DEFAULT_BASE_URL = 'https://api-accounting.moneyforward.com';
const RATE_SPACING_MS = 400; // < 3 req/s

const tokenFile = process.argv[2] || DEFAULT_TOKEN_FILE;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function resolveBaseUrl(tokenPath) {
  if (process.env.MF_V3_BASE_URL) return process.env.MF_V3_BASE_URL;
  if (process.argv[3]) return process.argv[3];
  try {
    const cfg = readJson(join(dirname(tokenPath), '_config.json'));
    if (cfg.restBase) return cfg.restBase;
  } catch {
    /* fall through to default */
  }
  return DEFAULT_BASE_URL;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Query builder mirroring MfV3ClientService: never re-encode pre-encoded ids.
function buildQuery(params) {
  const parts = [];
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null) continue;
    const enc = (x) => {
      const s = String(x);
      return /%[0-9A-Fa-f]{2}/.test(s) ? s : encodeURIComponent(s);
    };
    if (Array.isArray(v)) for (const x of v) parts.push(`${encodeURIComponent(k)}=${enc(x)}`);
    else parts.push(`${encodeURIComponent(k)}=${enc(v)}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

async function get(baseUrl, token, path, query) {
  const url = baseUrl.replace(/\/+$/, '') + path + buildQuery(query);
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  let body;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  await sleep(RATE_SPACING_MS);
  return { status: res.status, body };
}

function topKeys(body) {
  if (Array.isArray(body)) return `array(len=${body.length})`;
  if (body && typeof body === 'object') return Object.keys(body).join(',');
  return typeof body;
}

// Report each required field's presence in the first element / object.
function checkFields(sample, fields) {
  if (sample == null || typeof sample !== 'object') return fields.map((f) => `${f}=MISSING`);
  return fields.map((f) => `${f}=${f in sample ? 'ok' : 'MISSING'}`);
}

function line(label, res, detail) {
  const flag = res.status === 200 ? 'OK ' : `!! `;
  console.log(`${flag}[${res.status}] ${label}  keys=[${topKeys(res.body)}]`);
  if (detail) console.log(`      ${detail}`);
}

async function main() {
  const tok = readJson(tokenFile);
  const baseUrl = resolveBaseUrl(tokenFile);
  const office = tok.office ? `${tok.office.code} ${tok.office.name}` : '(unknown)';
  console.log(`# MF v3 smoke  office=${office}`);
  console.log(`# base=${baseUrl}`);
  console.log(`# tokenFile=${tokenFile}`);

  const now = Date.now();
  if (typeof tok.expiresAt === 'number' && tok.expiresAt <= now) {
    console.log(
      `\nTOKEN EXPIRED (expiresAt=${new Date(tok.expiresAt).toISOString()}). ` +
        `Skipping read checks; NOT refreshing (avoids refresh_token rotation).`,
    );
    process.exit(0);
  }
  if (typeof tok.expiresAt === 'number') {
    console.log(
      `# token valid until ${new Date(tok.expiresAt).toISOString()} ` +
        `(${Math.round((tok.expiresAt - now) / 3600000)}h left)`,
    );
  }
  const token = tok.accessToken;
  if (!token) {
    console.error('No accessToken in token file.');
    process.exit(1);
  }

  console.log('\n== read-only GETs ==');

  // 1. offices — also drives fiscal_year / date range for later calls
  const offices = await get(baseUrl, token, '/api/v3/offices');
  const periods = offices.body?.accounting_periods ?? [];
  const latest = periods[0];
  line(
    'GET /offices',
    offices,
    checkFields(offices.body, ['name', 'code', 'type', 'accounting_periods']).join(' ') +
      (latest
        ? ` | latest FY=${latest.fiscal_year} ${latest.start_date}..${latest.end_date}`
        : ''),
  );

  const fiscalYear = latest?.fiscal_year;

  // 2. accounts
  const accounts = await get(baseUrl, token, '/api/v3/accounts');
  line(
    'GET /accounts',
    accounts,
    `accounts=${accounts.body?.accounts?.length ?? 'n/a'} | ` +
      checkFields(accounts.body?.accounts?.[0], [
        'id',
        'name',
        'account_group',
        'category',
        'financial_statement_type',
        'available',
        'sub_accounts',
      ]).join(' '),
  );

  // 3. taxes
  const taxes = await get(baseUrl, token, '/api/v3/taxes');
  line('GET /taxes', taxes, `taxes=${taxes.body?.taxes?.length ?? 'n/a'}`);

  // 4. departments
  const departments = await get(baseUrl, token, '/api/v3/departments');
  line(
    'GET /departments',
    departments,
    `departments=${departments.body?.departments?.length ?? 'n/a'}`,
  );

  // 5. sub_accounts (may 403 if outside accounts.read scope)
  const subs = await get(baseUrl, token, '/api/v3/sub_accounts');
  line(
    'GET /sub_accounts',
    subs,
    subs.status === 403
      ? 'accounts.read 圏外の可能性 (403)'
      : `sub_accounts=${subs.body?.sub_accounts?.length ?? 'n/a'}`,
  );

  const tbFields = ['report_type', 'columns', 'rows', 'start_date', 'end_date'];
  const trFields = [
    'report_type',
    'columns',
    'rows',
    'fiscal_year',
    'start_month',
    'end_month',
    'start_date',
    'end_date',
  ];
  const rowFields = ['name', 'type', 'values', 'rows'];

  // 6-7. trial balance PL / BS
  const tbPl = await get(baseUrl, token, '/api/v3/reports/trial_balance_pl', {
    fiscal_year: fiscalYear,
  });
  line(
    'GET /reports/trial_balance_pl',
    tbPl,
    checkFields(tbPl.body, tbFields).join(' ') +
      ' | row: ' +
      checkFields(tbPl.body?.rows?.[0], rowFields).join(' '),
  );

  const tbBs = await get(baseUrl, token, '/api/v3/reports/trial_balance_bs', {
    fiscal_year: fiscalYear,
  });
  line(
    'GET /reports/trial_balance_bs',
    tbBs,
    checkFields(tbBs.body, tbFields).join(' ') +
      ' | row: ' +
      checkFields(tbBs.body?.rows?.[0], rowFields).join(' '),
  );

  // 8-9. transition PL / BS (type=monthly required)
  const trPl = await get(baseUrl, token, '/api/v3/reports/transition_pl', {
    type: 'monthly',
    fiscal_year: fiscalYear,
  });
  line(
    'GET /reports/transition_pl',
    trPl,
    checkFields(trPl.body, trFields).join(' ') + ` | columns=${trPl.body?.columns?.join('|')}`,
  );

  const trBs = await get(baseUrl, token, '/api/v3/reports/transition_bs', {
    type: 'monthly',
    fiscal_year: fiscalYear,
  });
  line(
    'GET /reports/transition_bs',
    trBs,
    checkFields(trBs.body, trFields).join(' ') + ` | columns=${trBs.body?.columns?.join('|')}`,
  );

  // 10. journals (page 1 only, small page)
  const journalQuery = { per_page: 10, page: 1 };
  if (latest) {
    journalQuery.start_date = latest.start_date;
    journalQuery.end_date = latest.end_date;
  }
  const journals = await get(baseUrl, token, '/api/v3/journals', journalQuery);
  line(
    'GET /journals (page 1, per_page 10)',
    journals,
    `journals=${journals.body?.journals?.length ?? 'n/a'} | ` +
      `metadata: ` +
      checkFields(journals.body?.metadata, ['total_count', 'total_pages']).join(' ') +
      ` | journal: ` +
      checkFields(journals.body?.journals?.[0], [
        'id',
        'number',
        'transaction_date',
        'branches',
      ]).join(' '),
  );

  console.log('\n# done (read-only, no writes performed)');
}

main().catch((err) => {
  console.error('smoke failed:', err?.message ?? err);
  process.exit(1);
});
