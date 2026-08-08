/**
 * tb-review-api のレスポンス → sevenboard の ReviewResult / ReviewAlert 変換。
 *
 * 変換方針（tb-review CLAUDE.md「数値と性質の出典必須」に従う）:
 *   - 金額・件数・文言はすべて findings JSON からの**転記のみ**。再計算・言い換えはしない。
 *   - 表示順は tb-review 側の統合トリアージ (triage.displayed) をそのまま使う。
 *     triage は重複指摘の統合（月次のマイナス残高 → 仕訳異常の原因診断）で
 *     一部 finding を落とすため、findings_by_source を直接なめると落としたはずの
 *     指摘が復活する。
 *   - エンジン失敗・エンジン自身が記録した部分失敗は指摘として可視化する
 *     （「失敗 ≠ 指摘ゼロ」契約）。
 */
import type { ReviewAlert, ReviewResult } from './review.service';

export interface TbReviewFinding {
  finding_id?: string;
  rule_id?: string;
  severity?: string;
  target?: {
    account?: string;
    sub_account?: string;
    amount?: number;
    count?: number;
    date_range?: string;
    partner_or_description?: string;
    journal_numbers?: (string | number)[];
  };
  current?: string;
  expected?: string;
  reason?: string;
  action?: string;
  impact?: { amount?: number; basis?: string };
}

export interface TbReviewEngineStatus {
  key?: string;
  label?: string;
  returncode?: number | null;
  seconds?: number;
  stderr_tail?: string;
  findings_count?: number;
}

export interface TbReviewResponse {
  engines?: TbReviewEngineStatus[];
  findings_by_source?: Record<string, { findings?: TbReviewFinding[]; summary?: any }>;
  triage?: {
    counts?: Record<string, number>;
    scores?: Record<string, any>;
    displayed?: { source?: string; finding_id?: string; rule_id?: string; severity?: string }[];
    top?: any[];
    dedup?: any[];
    disclosures?: any[];
  };
  vendor?: { rev?: string; synced_at?: string };
  warnings?: string[];
}

/** tb-review の source キー → 画面上のカテゴリ名（app/triage.py SOURCE_LABEL と同じ語彙）。 */
const SOURCE_LABEL: Record<string, string> = {
  monthly: '月次チェック',
  jct: '消費税',
  anomaly: '仕訳異常',
};
const SOURCE_ORDER = ['monthly', 'jct', 'anomaly'];

/** severity: A=修正提案 / B=確認アラート / INFO=参考 → 画面の3段階。 */
const SEVERITY_MAP: Record<string, ReviewAlert['severity']> = {
  A: 'HIGH',
  B: 'MEDIUM',
  INFO: 'LOW',
};

function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] || source || 'tb-review';
}

/** 金額表記は app/triage.py fmt_yen と同一（整数の書式化のみ。計算はしない）。 */
function fmtYen(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `¥${Math.trunc(value).toLocaleString('en-US')}`;
}

function findingTitle(f: TbReviewFinding): string {
  const account = (f.target?.account || '').trim();
  const sub = (f.target?.sub_account || '').trim();
  const ruleId = (f.rule_id || '').trim();
  const subject = account && sub ? `${account}/${sub}` : account;
  if (!subject) return ruleId || '指摘';
  return ruleId ? `${subject} [${ruleId}]` : subject;
}

/**
 * detail は reason 原文が先頭。以降は finding の他フィールドを**そのまま**ラベル付きで
 * 連結する（言い換え・要約はしない）。ReviewTab は detail を1行の <p> で描くため
 * 改行ではなく " / " で区切る。
 */
function findingDetail(f: TbReviewFinding): string {
  const parts: string[] = [];
  const reason = (f.reason || '').trim();
  if (reason) parts.push(reason);
  const current = (f.current || '').trim();
  if (current) parts.push(`現状: ${current}`);
  const expected = (f.expected || '').trim();
  if (expected) parts.push(`期待: ${expected}`);
  const action = (f.action || '').trim();
  if (action) parts.push(`対応: ${action}`);
  const impact = fmtYen(f.impact?.amount);
  if (impact && f.impact?.amount) parts.push(`影響額: ${impact}`);
  const targetAmount = fmtYen(f.target?.amount);
  if (targetAmount) parts.push(`対象金額: ${targetAmount}`);
  const findingId = (f.finding_id || '').trim();
  if (findingId) parts.push(`ID: ${findingId}`);
  return parts.join(' / ');
}

function toAlert(source: string, f: TbReviewFinding): ReviewAlert {
  return {
    severity: SEVERITY_MAP[String(f.severity || 'INFO')] || 'LOW',
    category: sourceLabel(source),
    title: findingTitle(f),
    detail: findingDetail(f),
  };
}

/** triage.displayed の順で finding 本体を引くための索引。 */
function indexFindings(
  bySource: Record<string, { findings?: TbReviewFinding[] }> | undefined,
): Map<string, TbReviewFinding> {
  const map = new Map<string, TbReviewFinding>();
  for (const [source, payload] of Object.entries(bySource || {})) {
    for (const f of payload?.findings || []) {
      const id = (f?.finding_id || '').trim();
      if (id) map.set(`${source}::${id}`, f);
    }
  }
  return map;
}

/** エンジン失敗・エンジン自身が記録した部分失敗を指摘化する（沈黙させない）。 */
function engineAlerts(res: TbReviewResponse): ReviewAlert[] {
  const alerts: ReviewAlert[] = [];

  for (const e of res.engines || []) {
    if (e?.returncode === 0) continue;
    const label = e?.label || e?.key || 'エンジン';
    const tail = (e?.stderr_tail || '').trim();
    alerts.push({
      severity: 'HIGH',
      category: 'システム',
      title: `${label}エンジンの実行に失敗`,
      detail:
        `このエンジンの指摘は結果に含まれていません（指摘ゼロではありません）。` +
        ` returncode=${e?.returncode ?? 'unknown'}` +
        (tail ? ` / ${tail}` : ''),
    });
  }

  for (const d of res.triage?.disclosures || []) {
    const label = d?.source_label || sourceLabel(String(d?.source || ''));
    const errors: unknown = d?.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      alerts.push({
        severity: 'HIGH',
        category: 'システム',
        title: `${label}エンジンの一部チェックが失敗`,
        detail: `エンジンが記録したエラー: ${errors.map((x) => String(x)).join(' / ')}`,
      });
    } else if (errors && typeof errors === 'string') {
      alerts.push({
        severity: 'HIGH',
        category: 'システム',
        title: `${label}エンジンの一部チェックが失敗`,
        detail: `エンジンが記録したエラー: ${errors}`,
      });
    }
    if (typeof d?.dropped_count === 'number' && d.dropped_count > 0) {
      const amount = fmtYen(d?.dropped_amount);
      alerts.push({
        severity: 'LOW',
        category: sourceLabel(String(d?.source || '')),
        title: '重要性基準未満で非表示にした指摘あり',
        detail:
          `${d.dropped_count}件` + (amount ? `（金額計 ${amount}）` : '') +
          ' が materiality_floor 未満のため表示対象外です。',
      });
    }
    if (typeof d?.skipped_rows === 'number' && d.skipped_rows > 0) {
      alerts.push({
        severity: 'MEDIUM',
        category: sourceLabel(String(d?.source || '')),
        title: '金額を読めず走査から外れた仕訳行あり',
        detail: `${d.skipped_rows}行が金額パース失敗でスキップされました。`,
      });
    }
  }

  for (const w of res.warnings || []) {
    const text = String(w || '').trim();
    if (text) {
      alerts.push({
        severity: 'LOW',
        category: 'システム',
        title: 'エンジンへの入力変換で警告',
        detail: text,
      });
    }
  }

  return alerts;
}

/**
 * tb-review-api レスポンスを ReviewTab がそのまま描ける ReviewResult へ変換する。
 *
 * pl / bs / tax / journal / crossCheck は legacy(analyze.py) 固有のセクションで
 * tb-review には対応物が無い。捏造せず空オブジェクトを返す（ReviewTab 側は
 * すべて optional chaining で読むため描画は壊れない）。
 */
export function adaptTbReviewResponse(
  res: TbReviewResponse,
  companyName: string,
  analyzedAt: string = new Date().toISOString(),
): ReviewResult {
  const index = indexFindings(res.findings_by_source);
  const alerts: ReviewAlert[] = [];

  const displayed = res.triage?.displayed;
  if (Array.isArray(displayed) && displayed.length > 0) {
    for (const d of displayed) {
      const source = String(d?.source || '');
      const key = `${source}::${String(d?.finding_id || '')}`;
      const finding = index.get(key);
      if (finding) alerts.push(toAlert(source, finding));
    }
  } else {
    // triage が無い/空のレスポンス（旧版 or 全エンジン失敗）でも指摘は落とさない
    for (const source of SOURCE_ORDER) {
      for (const f of res.findings_by_source?.[source]?.findings || []) {
        alerts.push(toAlert(source, f));
      }
    }
  }

  alerts.push(...engineAlerts(res));

  return {
    companyName,
    analyzedAt,
    alerts,
    // 生レスポンスをそのまま添付する（フロントの tb-review ネイティブ表示用）。
    // ここでも加工・再計算はしない。alerts は後方互換のため従来どおり残す。
    tbreview: res,
    pl: {},
    bs: {},
    tax: {},
    journal: {},
    crossCheck: {},
    summary: {
      highCount: alerts.filter((a) => a.severity === 'HIGH').length,
      mediumCount: alerts.filter((a) => a.severity === 'MEDIUM').length,
      lowCount: alerts.filter((a) => a.severity === 'LOW').length,
      totalAlerts: alerts.length,
    },
  };
}
