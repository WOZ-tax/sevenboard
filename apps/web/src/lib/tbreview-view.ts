/**
 * tb-review レスポンス → 画面表示用ビューの組み立て（純関数のみ・React 非依存）。
 *
 * 正本は tb-review-web/app/triage.py（TriageResult.to_json）と
 * sevenboard の apps/api/src/mf/tbreview-adapter.ts。
 * ここでするのは索引付けと並べ替えの再現だけで、金額の再計算・文言の言い換えはしない。
 */

import type { TbReviewFinding, TbReviewResponse } from "./mf-types";

/** source キー → 画面ラベル（app/triage.py SOURCE_LABEL と同語彙）。 */
export const SOURCE_LABEL: Record<string, string> = {
  monthly: "月次チェック",
  jct: "消費税",
  anomaly: "仕訳異常",
};

export const SOURCE_ORDER = ["monthly", "jct", "anomaly"];

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] || source || "tb-review";
}

/** 金額表記は app/triage.py fmt_yen と同一（整数の書式化のみ。計算はしない）。 */
export function fmtYen(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `¥${Math.trunc(value).toLocaleString("en-US")}`;
}

/** アクション化ダイアログの初期タイトル（tbreview-adapter.findingTitle と同一規則）。 */
export function findingTitle(f: TbReviewFinding): string {
  const account = (f.target?.account || "").trim();
  const sub = (f.target?.sub_account || "").trim();
  const ruleId = (f.rule_id || "").trim();
  const subject = account && sub ? `${account}/${sub}` : account;
  if (!subject) return ruleId || "指摘";
  return ruleId ? `${subject} [${ruleId}]` : subject;
}

/** アクション化ダイアログの初期説明（tbreview-adapter.findingDetail と同一規則＝転記のみ）。 */
export function findingDetail(f: TbReviewFinding): string {
  const parts: string[] = [];
  const reason = (f.reason || "").trim();
  if (reason) parts.push(reason);
  const current = (f.current || "").trim();
  if (current) parts.push(`現状: ${current}`);
  const expected = (f.expected || "").trim();
  if (expected) parts.push(`期待: ${expected}`);
  const action = (f.action || "").trim();
  if (action) parts.push(`対応: ${action}`);
  if (f.impact?.amount) parts.push(`影響額: ${fmtYen(f.impact.amount)}`);
  if (typeof f.target?.amount === "number") {
    parts.push(`対象金額: ${fmtYen(f.target.amount)}`);
  }
  const findingId = (f.finding_id || "").trim();
  if (findingId) parts.push(`ID: ${findingId}`);
  return parts.join(" / ");
}

export interface TbItem {
  source: string;
  sourceLabel: string;
  findingId: string;
  ruleId: string;
  severity: string;
  finding: TbReviewFinding;
}

export interface TbView {
  /** findings_by_source に存在する source キー（= 成功したエンジン）。 */
  sourceKeys: string[];
  /** source → 表示対象の指摘（triage の採否・並び順に従う）。 */
  bySource: Record<string, TbItem[]>;
  /** source → dedup で統合され明細から外れた件数。 */
  mergedBySource: Record<string, number>;
  /** `${source}::${finding_id}` → finding 本体（triage.top から引くため）。 */
  index: Map<string, TbReviewFinding>;
}

export function buildTbReviewView(res: TbReviewResponse): TbView {
  const bySourceRaw = res.findings_by_source || {};
  const sourceKeys = [
    ...SOURCE_ORDER.filter((s) => s in bySourceRaw),
    ...Object.keys(bySourceRaw).filter((s) => !SOURCE_ORDER.includes(s)),
  ];

  const index = new Map<string, TbReviewFinding>();
  for (const [source, payload] of Object.entries(bySourceRaw)) {
    for (const f of payload?.findings || []) {
      const id = (f?.finding_id || "").trim();
      if (id) index.set(`${source}::${id}`, f);
    }
  }

  const toItem = (source: string, f: TbReviewFinding): TbItem => ({
    source,
    sourceLabel: sourceLabel(source),
    findingId: (f.finding_id || "").trim(),
    ruleId: (f.rule_id || "").trim(),
    severity: String(f.severity || "INFO"),
    finding: f,
  });

  // 明細は triage.displayed（dedup 適用後・並び順確定済み）を正とする。
  // triage が無い / 空のレスポンス（旧版・全エンジン失敗）では findings を落とさない
  // ため findings_by_source をそのまま並べる（tbreview-adapter と同じフォールバック）。
  const displayed = res.triage?.displayed;
  const items: TbItem[] = [];
  if (Array.isArray(displayed) && displayed.length > 0) {
    for (const d of displayed) {
      const source = String(d?.source || "");
      const f = index.get(`${source}::${String(d?.finding_id || "")}`);
      if (f) items.push(toItem(source, f));
    }
  } else {
    for (const source of sourceKeys) {
      for (const f of bySourceRaw[source]?.findings || []) {
        items.push(toItem(source, f));
      }
    }
  }

  const bySource: Record<string, TbItem[]> = {};
  for (const source of sourceKeys) bySource[source] = [];
  for (const item of items) {
    if (!bySource[item.source]) bySource[item.source] = [];
    bySource[item.source].push(item);
  }

  const mergedBySource: Record<string, number> = {};
  for (const d of res.triage?.dedup || []) {
    const source = String(d?.dropped?.source || "");
    if (!source) continue;
    mergedBySource[source] = (mergedBySource[source] || 0) + 1;
  }

  return { sourceKeys, bySource, mergedBySource, index };
}
