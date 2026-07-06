/**
 * 補助金アンテナ マッチャー（純関数）。
 *
 * ルール定義は subsidy-escalation-rules.json（SSOT）。このモジュールは判定ロジックのみを持ち、
 * 公募期限・金額基準はいっさいハードコードしない（すべてルールJSON側で完結する設計）。
 *
 * 単位:
 *   - investmentOku / revenueOku … 億円
 *   - employees … 人（アルバイト・パート含む）
 *   - industryClass … "commerce_service"（商業・サービス業、宿泊・娯楽除く）| "other"
 *
 * 判定の流れ（rule ごと）:
 *   1. topics: rule.topics を全て満たすか（AND）。満たさなければ対象外。
 *   2. validity.to: 期限切れ（today > to）なら非表示。
 *   3. constraints: 数値/区分条件。
 *        - 参照フィールドに未入力があれば status="pending"（入力があれば判定可）。
 *        - 全て入力済で条件を満たさなければ非表示。
 *   4. validity.from が未来なら status="pendingStart"（公募開始待ち）。
 *
 * 優先解決（applyPriority）:
 *   - S5 と S6 が同時成立 → S6 を primary、S5 は代替。
 *   - S3 は S2 または S4（新事業進出枠）が返る場合に代替へ降格。
 *   - S7 は独立（他と primary 併存可）。
 *   - pending / pendingStart は primary にしない。
 */

export type TopicId =
  | "shoryokuka"
  | "capex"
  | "custom_dev"
  | "global"
  | "sales_expansion"
  | "new_business"
  | "large_investment";

export type IndustryClass = "commerce_service" | "other";

export type CompareOp = "gte" | "gt" | "lte" | "lt" | "eq";

export type ConstraintField =
  | "investmentOku"
  | "revenueOku"
  | "employees"
  | "industryClass";

export interface Condition {
  field: ConstraintField;
  op: CompareOp;
  value: number | string;
}

export interface Constraints {
  anyOf: { allOf: Condition[] }[];
}

export interface SubsidyRule {
  id: string;
  program: string;
  topics: TopicId[];
  constraints?: Constraints;
  notes: string[];
  validity: { from?: string; to?: string };
  escalationTeam: string;
}

export interface MatchInput {
  topics: Set<TopicId>;
  investmentOku?: number | null;
  revenueOku?: number | null;
  employees?: number | null;
  industryClass?: IndustryClass | null;
  today: Date;
}

export type MatchStatus = "matched" | "pending" | "pendingStart";

export interface MatchResult {
  rule: SubsidyRule;
  primary: boolean;
  /** matched=条件成立 / pending=数値未入力で判定保留 / pendingStart=公募開始待ち */
  status: MatchStatus;
  warnings: string[];
  /**
   * status="pending" のとき、判定に不足している入力フィールド（未入力のもの）。
   * UI 側で「○○を入力すると判定できます」の誘導に使う。pending 以外では常に空配列。
   */
  missing: ConstraintField[];
}

/** constraints フィールドの日本語ラベル（UI の入力誘導文に使う）。 */
export const FIELD_LABEL: Record<ConstraintField, string> = {
  investmentOku: "投資額",
  revenueOku: "年商",
  employees: "従業員数",
  industryClass: "業種区分",
};

/** 日付を YYYYMMDD の整数に落とす（タイムゾーン非依存で日単位比較する）。 */
function toDayNumber(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function isoToDayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map((p) => Number(p));
  return y * 10000 + m * 100 + d;
}

function getField(
  input: MatchInput,
  field: ConstraintField,
): number | string | null | undefined {
  switch (field) {
    case "investmentOku":
      return input.investmentOku ?? null;
    case "revenueOku":
      return input.revenueOku ?? null;
    case "employees":
      return input.employees ?? null;
    case "industryClass":
      return input.industryClass ?? null;
  }
}

function isMissing(v: number | string | null | undefined): boolean {
  return v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v));
}

function compareNumber(a: number, op: CompareOp, b: number): boolean {
  switch (op) {
    case "gte":
      return a >= b;
    case "gt":
      return a > b;
    case "lte":
      return a <= b;
    case "lt":
      return a < b;
    case "eq":
      return a === b;
  }
}

function evalCondition(cond: Condition, input: MatchInput): boolean {
  const v = getField(input, cond.field);
  if (isMissing(v)) return false;
  if (typeof cond.value === "string") {
    return String(v) === cond.value;
  }
  return compareNumber(Number(v), cond.op, cond.value);
}

function evalConstraints(c: Constraints, input: MatchInput): boolean {
  return c.anyOf.some((clause) =>
    clause.allOf.every((cond) => evalCondition(cond, input)),
  );
}

/** constraints が参照する全フィールド（重複排除）。pending 判定に使う。 */
function constraintFields(c: Constraints): ConstraintField[] {
  const set = new Set<ConstraintField>();
  for (const clause of c.anyOf) {
    for (const cond of clause.allOf) set.add(cond.field);
  }
  return [...set];
}

/**
 * 補助金ルール群を入力条件でマッチングする。
 * @param rules ルールJSONの rules 配列
 * @param input 面談で拾った条件
 */
export function matchSubsidies(
  rules: SubsidyRule[],
  input: MatchInput,
): MatchResult[] {
  const todayNum = toDayNumber(input.today);
  const results: MatchResult[] = [];

  for (const rule of rules) {
    // 1. トピックゲート（全て満たす）
    if (!rule.topics.every((t) => input.topics.has(t))) continue;

    // 2. 期限切れは非表示（JSON には残る）
    if (rule.validity.to && todayNum > isoToDayNumber(rule.validity.to)) continue;

    const awaitingOpen =
      !!rule.validity.from && todayNum < isoToDayNumber(rule.validity.from);

    // 3. constraints
    let status: MatchStatus;
    const warnings: string[] = [];
    let missing: ConstraintField[] = [];
    if (rule.constraints) {
      const fields = constraintFields(rule.constraints);
      missing = fields.filter((f) => isMissing(getField(input, f)));
      if (missing.length > 0) {
        status = "pending";
        warnings.push(
          `${missing.map((f) => FIELD_LABEL[f]).join("・")}を入力すると判定できます`,
        );
      } else if (!evalConstraints(rule.constraints, input)) {
        continue; // 数値は揃っているが条件を満たさない
      } else {
        status = awaitingOpen ? "pendingStart" : "matched";
      }
    } else {
      status = awaitingOpen ? "pendingStart" : "matched";
    }

    results.push({ rule, primary: false, status, warnings, missing });
  }

  applyPriority(results);
  return results;
}

function applyPriority(results: MatchResult[]): void {
  const byId = new Map(results.map((r) => [r.rule.id, r]));

  // 既定: 条件成立（matched）のみ primary。pending / pendingStart は candidate。
  for (const r of results) {
    r.primary = r.status === "matched";
  }

  // S5 と S6 が両方成立 → S6 を primary、S5 を代替に降格
  const s5 = byId.get("S5");
  const s6 = byId.get("S6");
  if (s5 && s6 && s5.status === "matched" && s6.status === "matched") {
    s5.primary = false;
  }

  // S3 は S2 または S4系（新事業進出枠）が返る場合に代替へ降格
  const s3 = byId.get("S3");
  if (s3) {
    const s2Present = byId.has("S2");
    const s4Present = results.some(
      (r) => r.rule.id === "S4" || r.rule.id === "S4-legacy",
    );
    if (s2Present || s4Present) s3.primary = false;
  }
}
