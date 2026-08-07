// mf-scope-repro.mjs — MF MCPエンドポイントのscope一括要求を実証する再現実験
//
// 目的: 「旧11 scope（transaction.readなし）の正常なトークンが、権限内のはずの
// ツール(currentOffice / report系)呼び出しでも403 insufficient_scopeになる」ことを
// 新規発行トークンで実測し、MFへの報告証拠を採取する。
//
// 安全設計:
//   - コールバックは本スクリプトのローカルHTTP受け（sevenboardのDB/Integrationに一切触れない）
//   - 対象事業者はTest事業者（顧客データなし）を選択すること（認可画面で人間が選択）
//   - 呼び出しは読み取り専用のみ / トークン値は出力しない
//
// 使い方:
//   node scripts/mf-scope-repro.mjs --scopes 11   # 旧scopeセット（再現群）
//   node scripts/mf-scope-repro.mjs --scopes 12   # transaction.read込み（対照群）
//   → 表示されるURLをMFログイン済みブラウザ(support@)で開き、Test事業者を選んで許可する
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(HERE, '..', 'apps', 'api', '.env');

const SCOPES_11 = [
  'mfc/accounting/offices.read',
  'mfc/accounting/accounts.read',
  'mfc/accounting/departments.read',
  'mfc/accounting/journal.read',
  'mfc/accounting/journal.write',
  'mfc/accounting/report.read',
  'mfc/accounting/taxes.read',
  'mfc/accounting/trade_partners.read',
  'mfc/accounting/trade_partners.write',
  'mfc/accounting/connected_account.read',
  'mfc/accounting/transaction.write',
];
const SCOPES_12 = [...SCOPES_11.slice(0, 10), 'mfc/accounting/transaction.read', SCOPES_11[10]];

const MCP_URL = 'https://beta.mcp.developers.biz.moneyforward.com/mcp/ca/v3';
const REST_BASE = 'https://api-accounting.moneyforward.com';
const REDIRECT_URI = 'http://localhost:3001/auth/mf/callback';
const PORT = 3001;

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const scopeSet = arg('--scopes', '11') === '12' ? SCOPES_12 : SCOPES_11;
const label = scopeSet.length === 12 ? '12scope(対照群)' : '11scope(再現群)';

// .env からクライアント資格情報を読む（値は出力しない）
const env = Object.fromEntries(
  readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const CLIENT_ID = env.MF_CLIENT_ID;
const CLIENT_SECRET = env.MF_CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) { console.error('MF_CLIENT_ID/SECRET が .env にありません'); process.exit(1); }

const ts = () => new Date().toISOString();
console.log(`# mf-scope-repro ${label}  client_id=${CLIENT_ID}  ${ts()}`);
console.log(`# 要求scope (${scopeSet.length}個): ${scopeSet.join(' ')}`);

// 1) ローカルコールバック受け
const state = randomBytes(16).toString('hex');
const code = await new Promise((resolveCode, reject) => {
  const srv = createServer((req, res) => {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    if (u.pathname !== '/auth/mf/callback') { res.writeHead(404).end(); return; }
    const params = Object.fromEntries(u.searchParams.entries());
    const gotCode = !!params.code;
    console.log(`[callback] state_ok=${params.state === state} code=${gotCode ? 'あり(' + params.code.length + '文字)' : 'なし'} ` +
      Object.entries(params).filter(([k]) => k !== 'code' && k !== 'state').map(([k, v]) => `${k}=${v}`).join(' '));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(gotCode
      ? '<h3>OK - 実験スクリプトがcodeを受領しました。この画面は閉じてください。</h3>'
      : `<h3>codeが来ませんでした（エラー: ${params.error || '不明'}）。ターミナルを確認してください。</h3>`);
    if (params.state !== state) { console.error(`state不一致 (待機継続): 受信state=${(params.state || '').slice(0, 8)}…`); return; }
    if (!gotCode) { console.error(`エラーコールバック (待機継続): ${params.error || ''} ${params.error_description || ''}`); return; }
    srv.close();
    resolveCode(params.code);
  });
  srv.on('error', (e) => reject(new Error(`ポート${PORT}が使用中です(dev APIを停止してください): ${e.message}`)));
  srv.listen(PORT, '127.0.0.1', () => {
    const authUrl = 'https://api.biz.moneyforward.com/authorize?' + new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: scopeSet.join(' '),
      state,
      resource: MCP_URL,
    });
    console.log('\n>>> 以下のURLをMFログイン済みブラウザ(support@)で開き、【Test事業者(6430-5845)】を選択して許可してください:');
    console.log(authUrl + '\n');
  });
  setTimeout(() => reject(new Error('900秒以内にコールバックが来ませんでした')), 900_000);
});

// 2) token exchange（sevenboard本番と同じ Basic + resource）
const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
const tokRes = await fetch('https://api.biz.moneyforward.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
  body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, resource: MCP_URL }),
});
const tok = await tokRes.json();
if (!tokRes.ok || !tok.access_token) { console.error(`token exchange失敗: HTTP ${tokRes.status} ${JSON.stringify(tok).slice(0, 300)}`); process.exit(1); }
console.log(`[${ts()}] token取得OK  granted_scope=${tok.scope ?? '(応答にscopeフィールドなし)'}  expires_in=${tok.expires_in}`);
const T = tok.access_token;

// 3) プローブ
const evidence = [];
const rec = (name, status, wwwAuth, body) => {
  evidence.push({ name, status, wwwAuth: wwwAuth || null, body: (body || '').slice(0, 200) });
  console.log(`[${ts()}] ${name}: HTTP ${status}${wwwAuth ? `\n    WWW-Authenticate: ${wwwAuth}` : ''}${body ? `\n    body: ${String(body).slice(0, 200).replace(/\n/g, '\\n')}` : ''}`);
};

// 3a) MCP initialize（sevenboard本番実装と同一: protocolVersion 2024-11-05 / Accept json+SSE）
const mcpPost = (payload, sessionId) => fetch(MCP_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${T}`,
    ...(sessionId ? { 'Mcp-Session': sessionId } : {}),
  },
  body: JSON.stringify(payload),
});

const init = await mcpPost({
  jsonrpc: '2.0', method: 'initialize', id: 1,
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'sevenboard-scope-repro', version: '1.0.0' } },
});
rec('MCP initialize', init.status, init.headers.get('www-authenticate'), await init.text());
const sessionId = init.headers.get('mcp-session') || init.headers.get('mcp-session-id') || '';

// 3b) MCP tools/call（11 scopeの権限内ツール。initializeが403でも敢えて実測して記録）
for (const tool of ['mfc_ca_currentOffice', 'mfc_ca_getReportsTrialBalanceProfitLoss']) {
  const r = await mcpPost({ jsonrpc: '2.0', method: 'tools/call', id: 2, params: { name: tool, arguments: {} } }, sessionId);
  rec(`MCP tools/call ${tool}`, r.status, r.headers.get('www-authenticate'), await r.text());
  await new Promise((r2) => setTimeout(r2, 500));
}

// 3c) REST API v3（同一トークン・読み取り専用）— トークン自体の健全性の対照
const rest = await fetch(`${REST_BASE}/api/v3/offices`, { headers: { Authorization: `Bearer ${T}`, Accept: 'application/json' } });
const restBody = await rest.text();
let officeInfo = '';
try { const j = JSON.parse(restBody); officeInfo = ` office=${j.code ?? '?'} ${j.name ?? ''}`; } catch { /* keep raw */ }
rec(`REST GET /api/v3/offices${officeInfo}`, rest.status, rest.headers.get('www-authenticate'), officeInfo ? '' : restBody);

// 4) サマリ
console.log(`\n===== 実験サマリ (${label}) =====`);
for (const e of evidence) console.log(`  ${e.name}: HTTP ${e.status}${e.wwwAuth ? ' [WWW-Authenticate captured]' : ''}`);
console.log('トークン値は記録していません。証拠として上記ログ全文をコピーしてください。');
