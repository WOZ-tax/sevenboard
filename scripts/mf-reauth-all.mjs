#!/usr/bin/env node
// mf-reauth-all.mjs — sevenboard 全org の MF OAuth 再認証を自動化（デバッグChrome + 生CDP）
//
// 背景: MF の scope 変更で全org の MF トークンが失効扱いになり、各org の OAuth を
// 取り直す必要がある。社数が多いのでブラウザ自動化する。骨格は 119 定期実行の
// pochipochi_api/scripts/auto_auth_all.mjs（63社実績）を踏襲:
//   CDP接続 / 画面ステート機械 / パスワード画面即中断 / 連続失敗中断。
//
// フロー(1orgあたり):
//   1. sevenboard API GET /auth/mf/authorize?orgId=X (Bearer JWT) で authUrl 取得
//   2. デバッグChrome の専用タブで authUrl へ遷移し、ステート機械で進める:
//        account_selector → support@ タイルをクリック
//          ★ input[type=password] 検知で全体即中断（パスワードは絶対入力しない）
//        /tenants → 検索ボックスに org.code を実キー入力→Enter
//                 → input[name="identification_code"][value="<code>"] を選択→次へ
//          （コード完全一致ゲート。radio 不在ならその社はスキップ記録、名前選択は禁止）
//        同意画面 → 許可/同意
//        callback → フロントの /settings?mf=connected 着地（mf=error は理由を記録）
//   3. 着地検証: GET /auth/mf/status?orgId=X で connected=true かつ expiry>現在+50分
//   4. 二重ゲート: GET /organizations/:orgId/mf/office の code == org.code を照合。
//        不一致は「別会社の帳簿に接続」事故 → 全体を即中断して赤字報告
//   5. 1.5秒待って次へ。連続10失敗で中断。--cooldown-rounds で失敗社をラウンド再試行。
//
// 認証: 全 API 呼び出しは Authorization: Bearer <JWT>（CsrfGuard は Bearer 免除）。
//   JWT は SB_JWT 直指定、または SB_EMAIL/SB_PASSWORD で POST /auth/login して取得。
//
// 使い方:
//   1) デバッグChrome を起動（既存プロファイルを閉じてから）:
//        Windows: "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
//                   --remote-debugging-port=9222 --user-data-dir="%TEMP%\mf-reauth-chrome"
//        mac:     /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
//                   --remote-debugging-port=9222 --user-data-dir="$TMPDIR/mf-reauth-chrome"
//      そのChromeで support@sevenrich-ac.com に一度ログインしておく（パスは手入力）。
//   2) 環境変数を設定: SB_API_BASE, (SB_JWT | SB_EMAIL+SB_PASSWORD)
//   3) 実行:
//        node scripts/mf-reauth-all.mjs --dry-run        # 対象一覧と計画だけ（ブラウザ不要）
//        node scripts/mf-reauth-all.mjs --skip-connected # 未接続/失効のみ本番実行
//
// オプション:
//   --only <orgId|code,...>   対象を限定（org.id か org.code のいずれか一致）
//   --skip-connected          status が connected かつ expiry>現在 の org をスキップ
//   --max N                   先頭 N 社だけ
//   --dry-run                 ブラウザを開かず、対象一覧と計画のみ出力（API 不通でも動く）
//   --cooldown-rounds N       失敗社を最大 N 回追加ラウンド再試行（ラウンド間 3 分待機）
//   --help                    このヘルプ
//
// env: SB_API_BASE(既定 http://localhost:3001) / SB_EMAIL / SB_PASSWORD / SB_JWT /
//      CDP_PORT(既定 9222) / MF_ACCOUNT_EMAIL(既定 support@sevenrich-ac.com)
//
// 契約: MF 書き込み API は叩かない（OAuth 再認証のみ）。コミット/デプロイもしない。

import { setTimeout as sleep } from 'node:timers/promises';

// ── args / env ──────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (k) => argv.includes(k);
const val = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d;
};

if (has('--help')) {
  // ヘルプはファイル冒頭コメントに集約。ここでは主要行だけ再掲。
  console.log(
    [
      'mf-reauth-all.mjs — sevenboard 全org の MF OAuth 再認証（デバッグChrome + CDP）',
      '',
      'node scripts/mf-reauth-all.mjs [--dry-run] [--skip-connected] [--only ids,codes]',
      '                              [--max N] [--cooldown-rounds N]',
      '',
      'env: SB_API_BASE (既定 http://localhost:3001), SB_JWT | SB_EMAIL+SB_PASSWORD,',
      '     CDP_PORT (既定 9222), MF_ACCOUNT_EMAIL (既定 support@sevenrich-ac.com)',
      '',
      'デバッグChrome: chrome --remote-debugging-port=9222 --user-data-dir=<temp>',
      '  で起動し support@sevenrich-ac.com に手動ログインしてから実行する。',
    ].join('\n'),
  );
  process.exit(0);
}

const CFG = {
  apiBase: (process.env.SB_API_BASE || 'http://localhost:3001').replace(/\/+$/, ''),
  email: process.env.SB_EMAIL || '',
  password: process.env.SB_PASSWORD || '',
  jwt: process.env.SB_JWT || '',
  cdpPort: process.env.CDP_PORT || '9222',
  accountEmail: process.env.MF_ACCOUNT_EMAIL || 'support@sevenrich-ac.com',
  only: (val('--only', '') || '').split(',').map((s) => s.trim()).filter(Boolean),
  skipConnected: has('--skip-connected'),
  max: parseInt(val('--max', '99999'), 10),
  dryRun: has('--dry-run'),
  cooldownRounds: Math.max(0, parseInt(val('--cooldown-rounds', '0'), 10) || 0),
};

const MIN_EXPIRY_MS = 50 * 60 * 1000; // 着地検証: 現在+50分以降
const CONSECUTIVE_FAIL_ABORT = 10;
const COOLDOWN_MS = 3 * 60 * 1000;
const PER_ORG_GAP_MS = 1500;
const STATE_MACHINE_MAX_STEPS = 8;

const norm = (s) => String(s ?? '').replace(/[^0-9a-zA-Z]/g, '').toLowerCase();

// ── sevenboard API (Bearer) ─────────────────────────────
async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(CFG.apiBase + path, {
    method,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

async function acquireJwt() {
  if (CFG.jwt) return CFG.jwt;
  if (!CFG.email || !CFG.password) {
    throw new Error('SB_JWT も SB_EMAIL/SB_PASSWORD も未設定です');
  }
  const res = await api('/auth/login', {
    method: 'POST',
    body: { email: CFG.email, password: CFG.password },
  });
  if (!res.ok || !res.data?.accessToken) {
    throw new Error(`login 失敗: status=${res.status} ${JSON.stringify(res.data).slice(0, 200)}`);
  }
  return res.data.accessToken;
}

async function listTargets(token) {
  const res = await api('/organizations', { token });
  if (!res.ok || !Array.isArray(res.data)) {
    throw new Error(`org 一覧取得失敗: status=${res.status} ${JSON.stringify(res.data).slice(0, 200)}`);
  }
  let orgs = res.data
    .filter((o) => o && o.code)
    .map((o) => ({ id: o.id, code: String(o.code), name: o.name || '' }));
  if (CFG.only.length) {
    const set = new Set(CFG.only.map((s) => s.toLowerCase()));
    orgs = orgs.filter(
      (o) => set.has(String(o.id).toLowerCase()) || set.has(o.code.toLowerCase()),
    );
  }
  orgs.sort((a, b) => a.code.localeCompare(b.code));
  return orgs.slice(0, CFG.max);
}

async function getStatus(token, orgId) {
  const res = await api(`/auth/mf/status?orgId=${encodeURIComponent(orgId)}`, { token });
  return res.ok ? res.data : { connected: false, _status: res.status };
}

function isFreshlyConnected(status) {
  if (!status?.connected || !status?.expiresAt) return false;
  return new Date(status.expiresAt).getTime() > Date.now() + MIN_EXPIRY_MS;
}

// ── CDP（専用タブ1枚を使い回し） ─────────────────────────
async function connectCdp(port) {
  const nt = await (await fetch(`http://localhost:${port}/json/new`, { method: 'PUT' })).json();
  const ws = new WebSocket(nt.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('CDP接続失敗（デバッグChromeが起動しているか確認）'));
  });
  let mid = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result || m);
      pending.delete(m.id);
    }
  };
  const send = (method, params = {}, tmo = 25000) =>
    new Promise((resolve) => {
      const i = ++mid;
      pending.set(i, resolve);
      ws.send(JSON.stringify({ id: i, method, params }));
      setTimeout(() => {
        if (pending.has(i)) {
          pending.delete(i);
          resolve({ timeout: true });
        }
      }, tmo);
    });
  await send('Page.enable');
  await send('Runtime.enable');
  const ev = async (expr, tmo = 20000) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, tmo);
    if (r.timeout) return '__TIMEOUT__';
    return r.result?.value ?? r.result?.result?.value ?? null;
  };
  const nav = async (url, waitMs = 5000) => {
    await send('Page.navigate', { url });
    await sleep(waitMs);
  };
  const state = async () => {
    const s = await ev(
      `JSON.stringify({u:location.href.slice(0,160),pw:!!document.querySelector('input[type=password]')})`,
    );
    return s === '__TIMEOUT__' ? null : JSON.parse(s);
  };
  const close = async () => {
    try {
      await fetch(`http://localhost:${port}/json/close/${nt.id}`);
    } catch {
      /* best-effort */
    }
    try {
      ws.close();
    } catch {
      /* best-effort */
    }
  };
  return { send, ev, nav, state, close };
}

// ── 1org のブラウザ側フロー ──────────────────────────────
// 戻り値: { landed:true } | { landed:false, why } | { abort:'PASSWORD_SCREEN' }
async function driveBrowser(cdp, authUrl, code) {
  await cdp.nav(authUrl, 5000);
  for (let step = 0; step < STATE_MACHINE_MAX_STEPS; step++) {
    const st = await cdp.state();
    if (!st) return { landed: false, why: 'ページ応答なし' };
    if (st.pw) return { abort: 'PASSWORD_SCREEN' };

    // callback 着地（フロント /settings へのリダイレクト）
    if (/[?&]mf=connected/.test(st.u)) return { landed: true };
    if (/[?&]mf=error/.test(st.u)) {
      const m = st.u.match(/[?&]reason=([^&]+)/);
      return { landed: false, why: `mf=error(${m ? decodeURIComponent(m[1]) : 'unknown'})` };
    }

    if (st.u.includes('account_selector')) {
      const r = await cdp.ev(
        `(()=>{const els=[...document.querySelectorAll('a,button,[role=button],div,li')];
          const t=els.find(el=>(el.textContent||'').includes(${JSON.stringify(CFG.accountEmail)}));
          if(!t)return 'no-tile';const b=[...t.querySelectorAll('a,button')].find(x=>/ログイン|選択|続ける|Continue/.test(x.textContent))||t.closest('a')||t;b.click();return 'ok';})()`,
      );
      if (r !== 'ok') return { landed: false, why: `account_selector:${r}` };
      await sleep(5000);
      continue;
    }

    if (st.u.includes('/tenants')) {
      // 検索ボックスに事業者番号を実キー入力 → Enter → radio(value=code) 選択 → 次へ
      const focused = await cdp.ev(`(()=>{
        const inp=[...document.querySelectorAll('input')].find(i=>(i.placeholder||'').includes('検索'));
        if(!inp)return 'no-search';inp.focus();inp.select&&inp.select();return 'ok';
      })()`);
      if (focused !== 'ok') return { landed: false, why: `tenants:${focused}` };
      await cdp.send('Input.insertText', { text: code });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await sleep(3000);
      const sel = await cdp.ev(`(()=>{
        const r=document.querySelector('input[name="identification_code"][value=${JSON.stringify(code)}]');
        if(!r)return 'no-radio';
        r.click();r.checked=true;r.dispatchEvent(new Event('change',{bubbles:true}));
        const btn=[...document.querySelectorAll('button,input[type=submit]')].find(b=>/次へ/.test(b.textContent||b.value||''));
        if(!btn)return 'no-next';if(btn.disabled)return 'next-disabled';btn.click();return 'ok';
      })()`);
      // radio 不在はコード完全一致ゲート未達 → この社はスキップ（名前フォールバック禁止）
      if (sel !== 'ok') return { landed: false, why: `tenants:${sel}` };
      await sleep(5000);
      continue;
    }

    // 同意/許可画面
    const consent = await cdp.ev(`(()=>{
      const b=[...document.querySelectorAll('button,input[type=submit],a')]
        .find(x=>/^(許可|同意|承認|Authorize|許可する|同意する)/.test((x.textContent||x.value||'').trim()));
      if(!b)return 'no-consent-btn';b.click();return 'ok';
    })()`);
    if (consent !== 'ok') return { landed: false, why: `不明画面:${st.u.slice(0, 70)}` };
    await sleep(5000);
  }
  return { landed: false, why: 'ステップ上限で未着地' };
}

// ── 1org: authorize→browser→status→office 二重ゲート ─────
// 戻り値: { ok:true } | { ok:false, why } | { abort, why }
async function reauthOne(cdp, token, org) {
  const authRes = await api(`/auth/mf/authorize?orgId=${encodeURIComponent(org.id)}`, { token });
  if (!authRes.ok || !authRes.data?.authUrl) {
    return { ok: false, why: `authorize失敗:${authRes.status}` };
  }

  const drive = await driveBrowser(cdp, authRes.data.authUrl, org.code);
  if (drive.abort === 'PASSWORD_SCREEN') {
    return { abort: 'PASSWORD_SCREEN', why: 'パスワード画面検知' };
  }
  if (!drive.landed) return { ok: false, why: drive.why };

  // 着地検証: status connected かつ expiry>現在+50分
  await sleep(1500);
  const status = await getStatus(token, org.id);
  if (!isFreshlyConnected(status)) {
    return {
      ok: false,
      why: `status未確定(connected=${status?.connected},expiry=${status?.expiresAt || '-'})`,
    };
  }

  // 二重ゲート: MF 側事業者コード == org.code（別会社接続事故の検知）
  const office = await api(`/organizations/${encodeURIComponent(org.id)}/mf/office`, { token });
  if (!office.ok) {
    return { ok: false, why: `office取得失敗:${office.status}（接続はしたがコード照合不可）` };
  }
  const mfCode = office.data?.code;
  if (norm(mfCode) !== norm(org.code)) {
    return {
      abort: 'OFFICE_MISMATCH',
      why: `別会社の帳簿に接続: org.code=${org.code} だが MF office.code=${mfCode}`,
    };
  }
  return { ok: true };
}

// ── plan 出力 ───────────────────────────────────────────
function printConfig() {
  console.log('# mf-reauth-all');
  console.log(`# apiBase=${CFG.apiBase}  cdpPort=${CFG.cdpPort}  account=${CFG.accountEmail}`);
  console.log(
    `# options: dryRun=${CFG.dryRun} skipConnected=${CFG.skipConnected} max=${CFG.max} ` +
      `only=[${CFG.only.join(',') || '-'}] cooldownRounds=${CFG.cooldownRounds}`,
  );
  console.log(`# auth: ${CFG.jwt ? 'SB_JWT(直指定)' : CFG.email ? `login(${CFG.email})` : '未設定'}`);
}

// ── main ────────────────────────────────────────────────
async function main() {
  printConfig();

  // dry-run は API 不通でも計画を出して正常終了する
  if (CFG.dryRun) {
    let token;
    try {
      token = await acquireJwt();
    } catch (e) {
      console.log(`\n[dry-run] JWT 取得スキップ: ${e.message}`);
      console.log('[dry-run] API 未接続のため対象一覧は表示できません。引数/計画のみ検証しました。');
      return;
    }
    let targets;
    try {
      targets = await listTargets(token);
    } catch (e) {
      console.log(`\n[dry-run] org 一覧取得スキップ: ${e.message}`);
      return;
    }
    console.log(`\n[dry-run] 対象 ${targets.length} 社（code 設定済み・フィルタ適用後）:`);
    let idx = 0;
    for (const o of targets) {
      idx++;
      let note = '';
      if (CFG.skipConnected) {
        const st = await getStatus(token, o.id);
        note = isFreshlyConnected(st) ? ' → skip(接続済み)' : ' → 再認証対象';
      }
      console.log(`  ${String(idx).padStart(3)} ${o.code}  ${o.name}${note}`);
    }
    console.log('\n[dry-run] ブラウザは起動していません。本番は --dry-run を外して実行。');
    return;
  }

  const token = await acquireJwt();
  const allTargets = await listTargets(token);
  console.log(`\n対象 ${allTargets.length} 社（code 設定済み）`);

  // --skip-connected: 事前に接続済みを除外
  let pending = allTargets;
  if (CFG.skipConnected) {
    const keep = [];
    for (const o of allTargets) {
      const st = await getStatus(token, o.id);
      if (isFreshlyConnected(st)) {
        console.log(`  - skip ${o.code} ${o.name}（接続済み・expiry OK）`);
      } else {
        keep.push(o);
      }
    }
    pending = keep;
    console.log(`skip後の対象: ${pending.length} 社`);
  }

  const cdp = await connectCdp(CFG.cdpPort);
  let ok = 0;
  let consecutiveFail = 0;
  const failWhy = new Map(); // orgId → 直近の失敗理由（成功したら消す）
  let aborted = null;

  const maxRounds = 1 + CFG.cooldownRounds;
  for (let round = 1; round <= maxRounds && pending.length && !aborted; round++) {
    if (round > 1) {
      console.log(`\n--- cooldown ${COOLDOWN_MS / 60000}分 待機して round ${round}（再試行 ${pending.length}社）---`);
      await sleep(COOLDOWN_MS);
    }
    const stillFailed = [];
    let i = 0;
    for (const org of pending) {
      i++;
      process.stdout.write(`[r${round} ${i}/${pending.length}] ${org.code} ${org.name} … `);
      let res;
      try {
        res = await reauthOne(cdp, token, org);
      } catch (e) {
        res = { ok: false, why: `例外:${String(e.message || e).slice(0, 80)}` };
      }

      if (res.abort) {
        console.log(`✗✗ ${res.why}`);
        aborted = { org, ...res };
        break;
      }
      if (res.ok) {
        console.log('✓');
        ok++;
        consecutiveFail = 0;
        failWhy.delete(org.id);
      } else {
        console.log(`✗ ${res.why}`);
        consecutiveFail++;
        failWhy.set(org.id, { code: org.code, name: org.name, why: res.why });
        stillFailed.push(org);
        if (consecutiveFail >= CONSECUTIVE_FAIL_ABORT) {
          aborted = { reason: `連続失敗${CONSECUTIVE_FAIL_ABORT}回`, ...res };
          console.error(`連続失敗${CONSECUTIVE_FAIL_ABORT}回 → 中断（状況確認要）`);
          break;
        }
      }
      await sleep(PER_ORG_GAP_MS);
    }
    // 次ラウンドは今回失敗分のみ（cooldown 用）。中断時は再試行しない。
    pending = aborted ? [] : stillFailed;
  }

  await cdp.close();

  const failures = [...failWhy.values()];
  console.log(`\n===== 完了: 成功 ${ok} / 失敗 ${failures.length} =====`);
  if (aborted) {
    if (aborted.abort === 'OFFICE_MISMATCH' || aborted.abort === 'PASSWORD_SCREEN') {
      console.error(`\n!!! 全体中断: ${aborted.why} !!!`);
      if (aborted.abort === 'OFFICE_MISMATCH') {
        console.error('別会社の帳簿に接続した可能性。当該orgの接続を手動で解除し、事業者選択を確認すること。');
      }
    } else {
      console.error(`\n中断: ${aborted.reason || aborted.why}`);
    }
  }
  if (failures.length) {
    console.log('失敗一覧:');
    for (const f of failures) console.log(`  - ${f.code} ${f.name}: ${f.why}`);
  }

  // OFFICE_MISMATCH は事故なので非0終了で明示
  process.exitCode = aborted?.abort === 'OFFICE_MISMATCH' ? 2 : 0;
}

main().catch((err) => {
  console.error('fatal:', err?.message ?? err);
  process.exit(1);
});
