"use client";

/**
 * 補助金アンテナ カード。
 *
 * 面談で拾ったトピック・規模感から、該当しうる補助金候補を提示し、
 * 補助金・助成金チームへのエスカレーション文面を生成する。
 *
 * 判定は match-subsidy.ts（純関数）、ルールは subsidy-escalation-rules.json（SSOT）。
 * 年商・従業員数は既存のロカベンデータ（クライアント側フック）から自動プリセットする。
 * 入力状態は orgId 単位で localStorage に保存する。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Lightbulb,
  Copy,
  Check,
  Target,
  CalendarClock,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useCurrentOrg } from "@/contexts/current-org";
import { useMfOffice, useLocabenSourceData } from "@/hooks/use-mf-data";
import { useLocabenState } from "@/hooks/use-year-end-state";
import { normalizeIndustry } from "@/lib/industries";
import {
  matchSubsidies,
  FIELD_LABEL,
  type TopicId,
  type IndustryClass,
  type SubsidyRule,
  type MatchResult,
} from "./match-subsidy";
import rulesetJson from "./subsidy-escalation-rules.json";

const RULESET = rulesetJson as unknown as {
  escalationTeam: string;
  rules: SubsidyRule[];
};
const RULES = RULESET.rules;

/**
 * トピックチップ（6種）→ topic の対応。省力化は shoryokuka + custom_dev の2 topic を張る。
 * label は面談者が判断しやすい平易な表現、hint は判断の目安。
 */
const TOPIC_CHECKBOXES: {
  key: string;
  label: string;
  hint?: string;
  topics: TopicId[];
}[] = [
  { key: "capex", label: "設備投資・新規投資", topics: ["capex"] },
  {
    key: "sales_expansion",
    label: "販路開拓",
    hint: "新しい売り先・製品・サービス",
    topics: ["sales_expansion"],
  },
  {
    key: "global",
    label: "グローバル",
    hint: "海外展開・輸出",
    topics: ["global"],
  },
  {
    key: "shoryokuka",
    label: "省力化・自動化",
    hint: "オーダーメイド／スクラッチ開発。SaaS・パッケージ導入のみは対象外",
    topics: ["shoryokuka", "custom_dev"],
  },
  { key: "new_business", label: "新事業・組織拡大", topics: ["new_business"] },
  {
    key: "large_investment",
    label: "大型投資",
    hint: "目安1億円以上",
    topics: ["large_investment"],
  },
];

/**
 * 小規模持続化（S7）の業種二択。しきい値をラベルに見せて専門用語を排す。
 * 内部表現（industryClass）とルールJSONは不変で、UI ラベルだけ平易化する。
 */
const INDUSTRY_OPTIONS: {
  value: IndustryClass;
  label: string;
  hint: string;
  threshold: number;
}[] = [
  {
    value: "commerce_service",
    label: "卸売・小売・サービス業（宿泊業・娯楽業は除く）",
    hint: "従業員5人以下で該当",
    threshold: 5,
  },
  {
    value: "other",
    label: "製造業・建設業・宿泊業・娯楽業 など上記以外",
    hint: "従業員20人以下で該当",
    threshold: 20,
  },
];

/**
 * 業種 → 小規模持続化の区分。
 * 商業・サービス業（宿泊業・娯楽業を除く）を commerce_service、それ以外を other とする。
 * 宿泊業・飲食サービス業 / 生活関連サービス業・娯楽業 は「宿泊・娯楽」を含むため other。
 */
const COMMERCE_SERVICE_INDUSTRIES = new Set([
  "卸売業",
  "小売業",
  "情報通信業",
  "学術研究・専門・技術サービス業",
  "教育・学習支援業",
  "医療・福祉",
  "その他サービス業",
]);

function industryToClass(industry: string | null | undefined): IndustryClass {
  const n = normalizeIndustry(industry);
  return n && COMMERCE_SERVICE_INDUSTRIES.has(n) ? "commerce_service" : "other";
}

type SubsidyState = {
  checked: Record<string, boolean>;
  investmentOku: string;
  revenueOku: string;
  employees: string;
  industryClass: IndustryClass;
  lbScore: string;
};

function defaultState(industryClass: IndustryClass): SubsidyState {
  return {
    checked: {},
    investmentOku: "",
    revenueOku: "",
    employees: "",
    industryClass,
    lbScore: "",
  };
}

const STORAGE_PREFIX = "sb_subsidy_antenna_v1_";

function parseNum(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 該当ルールが LB 点数の底上げを推奨しているか（notes に「LB」を含む）。 */
function ruleWantsLb(rule: SubsidyRule): boolean {
  return rule.notes.some((n) => n.includes("LB"));
}

/** 入力誘導文で使う単位サフィックス（例: 投資額（億円）を入力すると…）。 */
function missingUnit(field: string): string {
  if (field === "investmentOku" || field === "revenueOku") return "（億円）";
  if (field === "employees") return "（人）";
  return "";
}

export function SubsidyAntennaCard() {
  const { currentOrg } = useCurrentOrg();
  const orgId = currentOrg?.orgId ?? "";
  const orgName = currentOrg?.orgName ?? "";
  const office = useMfOffice();
  const officeName = office.data?.name ?? "";

  // プリセット元（ロカベンの既存クライアントフック）
  const locabenState = useLocabenState();
  const locabenSource = useLocabenSourceData();

  const presetIndustryClass = useMemo(
    () => industryToClass(currentOrg?.industry),
    [currentOrg?.industry],
  );

  /** 年商プリセット（千円 → 億円）。ロカベン手入力値 > MF 取得値 の優先。 */
  const presetRevenueOku = useMemo<number | null>(() => {
    const sen =
      locabenState.data?.values?.revenueCurrent ??
      locabenSource.data?.revenueCurrent;
    if (sen == null || !Number.isFinite(sen)) return null;
    return Math.round((sen / 100000) * 100) / 100;
  }, [locabenState.data, locabenSource.data]);

  const presetEmployees = useMemo<number | null>(() => {
    const e =
      locabenState.data?.values?.employeeCount ??
      locabenSource.data?.employeeCount;
    return e != null && Number.isFinite(e) ? e : null;
  }, [locabenState.data, locabenSource.data]);

  const [state, setState] = useState<SubsidyState>(() =>
    defaultState(presetIndustryClass),
  );
  const [copied, setCopied] = useState(false);

  // orgId 切替時に localStorage から hydrate（1 回）
  const hydratedOrgRef = useRef<string | null>(null);
  const autofilledRef = useRef<{ revenue: boolean; employees: boolean }>({
    revenue: false,
    employees: false,
  });
  useEffect(() => {
    if (hydratedOrgRef.current === orgId) return;
    hydratedOrgRef.current = orgId;
    autofilledRef.current = { revenue: false, employees: false };
    let next = defaultState(presetIndustryClass);
    if (typeof window !== "undefined" && orgId) {
      try {
        const raw = window.localStorage.getItem(STORAGE_PREFIX + orgId);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<SubsidyState>;
          next = {
            ...next,
            ...parsed,
            checked: parsed.checked ?? {},
            industryClass:
              parsed.industryClass === "commerce_service" ||
              parsed.industryClass === "other"
                ? parsed.industryClass
                : presetIndustryClass,
          };
          // 保存済みの数値はユーザー確定値として扱い、自動上書きしない
          if (next.revenueOku.trim() !== "")
            autofilledRef.current.revenue = true;
          if (next.employees.trim() !== "")
            autofilledRef.current.employees = true;
        }
      } catch {
        // 破損データは無視して初期値
      }
    }
    setState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- orgId 毎に 1 回だけ hydrate する
  }, [orgId]);

  // ロカベンデータ到着後、空欄の年商・従業員だけを一度プリセット
  useEffect(() => {
    setState((prev) => {
      let changed = false;
      const next = { ...prev };
      if (
        !autofilledRef.current.revenue &&
        prev.revenueOku.trim() === "" &&
        presetRevenueOku != null
      ) {
        next.revenueOku = String(presetRevenueOku);
        autofilledRef.current.revenue = true;
        changed = true;
      }
      if (
        !autofilledRef.current.employees &&
        prev.employees.trim() === "" &&
        presetEmployees != null
      ) {
        next.employees = String(presetEmployees);
        autofilledRef.current.employees = true;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [presetRevenueOku, presetEmployees]);

  // 変更を localStorage に保存
  useEffect(() => {
    if (typeof window === "undefined" || !orgId) return;
    if (hydratedOrgRef.current !== orgId) return;
    try {
      window.localStorage.setItem(
        STORAGE_PREFIX + orgId,
        JSON.stringify(state),
      );
    } catch {
      // 保存失敗は致命ではない（画面には残る）
    }
  }, [state, orgId]);

  const topics = useMemo(() => {
    const s = new Set<TopicId>();
    for (const cb of TOPIC_CHECKBOXES) {
      if (state.checked[cb.key]) cb.topics.forEach((t) => s.add(t));
    }
    return s;
  }, [state.checked]);

  const largeInvestment = !!state.checked.large_investment;

  const results = useMemo<MatchResult[]>(
    () =>
      matchSubsidies(RULES, {
        topics,
        investmentOku: largeInvestment ? parseNum(state.investmentOku) : null,
        revenueOku: parseNum(state.revenueOku),
        employees: parseNum(state.employees),
        industryClass: state.industryClass,
        today: new Date(),
      }),
    [
      topics,
      largeInvestment,
      state.investmentOku,
      state.revenueOku,
      state.employees,
      state.industryClass,
    ],
  );

  const lb = parseNum(state.lbScore);
  const lbBelowThreshold = lb != null && lb < 23;

  // 条件付きブロックの表示制御（largeInvestment は上で定義済み）
  const salesChecked = !!state.checked.sales_expansion;

  // 大型補助金（S5/S6）がマッチしたら LB 点数欄を出す（LB23点の目安が効くのはこの時だけ）
  const largeMatched = results.some(
    (r) =>
      (r.rule.id === "S5" || r.rule.id === "S6") && r.status === "matched",
  );

  // 小規模持続化のしきい値超過判定（超過なら静かに対象外表示）
  const s7Threshold =
    INDUSTRY_OPTIONS.find((o) => o.value === state.industryClass)?.threshold ??
    20;
  const employeesNum = parseNum(state.employees);
  const s7Over = employeesNum != null && employeesNum > s7Threshold;

  // 業種の自動プリセット根拠（登録業種があるときだけ表示）
  const presetIndustryLabel = normalizeIndustry(currentOrg?.industry);

  const rank = (r: MatchResult) =>
    r.primary
      ? 0
      : r.status === "matched"
        ? 1
        : r.status === "pendingStart"
          ? 2
          : 3;
  const sortedResults = useMemo(
    () => [...results].sort((a, b) => rank(a) - rank(b)),
    [results],
  );

  const checkedTopicLabels = TOPIC_CHECKBOXES.filter(
    (cb) => state.checked[cb.key],
  ).map((cb) => cb.label);

  const toggleTopic = (key: string) =>
    setState((prev) => ({
      ...prev,
      checked: { ...prev.checked, [key]: !prev.checked[key] },
    }));

  const escalationText = useMemo(() => {
    const primaries = results.filter((r) => r.primary).map((r) => r.rule.program);
    // 代替 = primary 以外の候補（pending=判定保留は除外）
    const alternatives = results
      .filter((r) => !r.primary && r.status !== "pending")
      .map((r) =>
        r.status === "pendingStart"
          ? `${r.rule.program}（公募開始待ち）`
          : r.rule.program,
      );
    const relevantNotes = Array.from(
      new Set(
        results
          .filter((r) => r.status !== "pending")
          .flatMap((r) => r.rule.notes),
      ),
    );
    const today = new Date().toLocaleDateString("ja-JP");
    const companyLine = officeName
      ? `${orgName || "（会社名未取得）"}（${officeName}）`
      : orgName || "（会社名未取得）";

    return [
      `【補助金エスカレーション】${companyLine}`,
      `面談日: ${today}`,
      `該当候補: ${primaries.length ? primaries.join("、") : "（primaryなし）"}（代替: ${
        alternatives.length ? alternatives.join("、") : "なし"
      }）`,
      `根拠トピック: ${
        checkedTopicLabels.length ? checkedTopicLabels.join("、") : "（未選択）"
      }`,
      `規模感: 投資額 約${largeInvestment && state.investmentOku ? state.investmentOku : "—"}億円 / 年商 ${
        state.revenueOku || "—"
      }億円 / 従業員 ${state.employees || "—"}人（パート含む） / LB ${
        state.lbScore || "—"
      }点`,
      `留意: ${relevantNotes.length ? relevantNotes.join(" / ") : "特になし"}`,
      `次アクション: ${RULESET.escalationTeam}で公募要領との適合確認をお願いします`,
    ].join("\n");
  }, [
    results,
    officeName,
    orgName,
    checkedTopicLabels,
    largeInvestment,
    state.investmentOku,
    state.revenueOku,
    state.employees,
    state.lbScore,
  ]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(escalationText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasAnyResult = results.length > 0;

  return (
    <Card className="screen-only border-l-4 border-l-[var(--color-tertiary)]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
          <Lightbulb className="h-5 w-5 text-[var(--color-tertiary)]" />
          補助金アンテナ
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          面談で拾った投資・成長のトピックから、該当しうる補助金を検知します。判定は目安です（最終確認は補助金・助成金チーム）。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 1. トピックチップ（常時表示） */}
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            面談で該当したトピックを選んでください
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {TOPIC_CHECKBOXES.map((cb) => {
              const on = !!state.checked[cb.key];
              return (
                <button
                  key={cb.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleTopic(cb.key)}
                  className={
                    "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors " +
                    (on
                      ? "border-[var(--color-tertiary)] bg-[var(--color-tertiary)]/10"
                      : "border-[var(--color-border)] bg-background hover:bg-muted/50")
                  }
                >
                  <span
                    className={
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border " +
                      (on
                        ? "border-[var(--color-tertiary)] bg-[var(--color-tertiary)] text-white"
                        : "border-[var(--color-border)] bg-background")
                    }
                  >
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                      {cb.label}
                    </span>
                    {cb.hint && (
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                        {cb.hint}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2A. 大型投資の判定（大型投資チェック時のみ） */}
        {largeInvestment && (
          <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-muted/30 p-3">
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">
              大型投資の判定
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              投資額1億円〜／15億円〜／20億円〜と年商レンジで該当する補助金が変わります。
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                  投資額（億円）
                </label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={state.investmentOku}
                  onChange={(e) =>
                    setState((p) => ({ ...p, investmentOku: e.target.value }))
                  }
                  placeholder="--"
                  className="text-right tabular-nums"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                  年商（億円）
                  <span className="ml-1 font-normal text-muted-foreground">
                    ・ロカベンから自動入力
                  </span>
                </label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={state.revenueOku}
                  onChange={(e) =>
                    setState((p) => ({ ...p, revenueOku: e.target.value }))
                  }
                  placeholder="--"
                  className="text-right tabular-nums"
                />
              </div>
            </div>
            {largeMatched && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                  LB点数（ロカベン・任意）
                </label>
                <Input
                  type="number"
                  inputMode="numeric"
                  step="1"
                  value={state.lbScore}
                  onChange={(e) =>
                    setState((p) => ({ ...p, lbScore: e.target.value }))
                  }
                  placeholder="--"
                  className="max-w-[8rem] text-right tabular-nums"
                />
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  大型補助金は LB（ロカベン）23点以上が望ましいため、点数があれば入力してください。
                </p>
              </div>
            )}
          </div>
        )}

        {/* 2B. 小規模事業者チェック（販路開拓チェック時のみ） */}
        {salesChecked && (
          <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-muted/30 p-3">
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">
              小規模事業者チェック（持続化補助金）
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                従業員数（パート・アルバイト含む）
                <span className="ml-1 font-normal text-muted-foreground">
                  ・ロカベンから自動入力
                </span>
              </label>
              <Input
                type="number"
                inputMode="numeric"
                step="1"
                value={state.employees}
                onChange={(e) =>
                  setState((p) => ({ ...p, employees: e.target.value }))
                }
                placeholder="--"
                className="max-w-[8rem] text-right tabular-nums"
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-[var(--color-text-secondary)]">
                業種
              </div>
              <div className="grid gap-2">
                {INDUSTRY_OPTIONS.map((o) => {
                  const on = state.industryClass === o.value;
                  return (
                    <label
                      key={o.value}
                      className={
                        "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors " +
                        (on
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
                          : "border-[var(--color-border)] bg-background hover:bg-muted/50")
                      }
                    >
                      <input
                        type="radio"
                        name="s7-industry"
                        checked={on}
                        onChange={() =>
                          setState((p) => ({ ...p, industryClass: o.value }))
                        }
                        className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm text-[var(--color-text-primary)]">
                          {o.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {o.hint}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {presetIndustryLabel && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  登録業種「{presetIndustryLabel}」から自動選択しました（変更可）
                </p>
              )}
            </div>
            {s7Over && (
              <p className="text-xs text-muted-foreground">
                従業員数が基準を超えるため持続化補助金は対象外です。
              </p>
            )}
          </div>
        )}

        {/* 3. 結果 */}
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            該当候補
          </div>
          {!hasAnyResult ? (
            <p className="rounded-md border border-dashed border-[var(--color-border)] bg-background px-3 py-3 text-xs text-muted-foreground">
              面談で該当したトピックを選ぶと、該当しうる補助金が表示されます。
            </p>
          ) : (
            <ul className="space-y-2">
              {sortedResults.map((r) => {
                const showLbWarning =
                  ruleWantsLb(r.rule) &&
                  lbBelowThreshold &&
                  r.status !== "pending";
                const actionText =
                  r.status === "pending" && r.missing.length > 0
                    ? `${r.missing
                        .map((f) => FIELD_LABEL[f] + missingUnit(f))
                        .join("・")}を入力すると判定できます`
                    : null;
                return (
                  <li
                    key={r.rule.id}
                    className={
                      "rounded-md border px-3 py-2 " +
                      (r.primary
                        ? "border-[var(--color-tertiary)]/40 bg-[var(--color-tertiary)]/5"
                        : "border-[var(--color-border)] bg-background")
                    }
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {r.primary ? (
                        <Target className="h-4 w-4 shrink-0 text-[var(--color-tertiary)]" />
                      ) : r.status === "pendingStart" ? (
                        <CalendarClock className="h-4 w-4 shrink-0 text-[var(--color-warning)]" />
                      ) : null}
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                        {r.rule.program}
                      </span>
                      {r.primary && (
                        <Badge className="bg-[var(--color-tertiary)] text-[10px] text-white">
                          本命
                        </Badge>
                      )}
                      {!r.primary && r.status === "matched" && (
                        <Badge variant="outline" className="text-[10px]">
                          候補
                        </Badge>
                      )}
                      {r.status === "pendingStart" && (
                        <Badge
                          variant="outline"
                          className="border-[var(--color-warning)]/40 text-[10px] text-[var(--color-warning)]"
                        >
                          公募開始待ち
                        </Badge>
                      )}
                      {r.status === "pending" && (
                        <Badge variant="outline" className="text-[10px]">
                          要入力
                        </Badge>
                      )}
                    </div>
                    {actionText && (
                      <p className="mt-1 flex items-start gap-1 pl-6 text-xs text-[var(--color-text-secondary)]">
                        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {actionText}
                      </p>
                    )}
                    {r.rule.notes.length > 0 && (
                      <ul className="mt-1 space-y-0.5 pl-6 text-xs text-muted-foreground">
                        {r.rule.notes.map((n, i) => (
                          <li key={i}>・{n}</li>
                        ))}
                      </ul>
                    )}
                    {showLbWarning && (
                      <p className="mt-1 flex items-center gap-1 pl-6 text-xs text-[var(--color-error)]">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        LB {lb}点（23点未満・要底上げ）
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 4. エスカレーション（折りたたみプレビュー + コピー） */}
        {hasAnyResult && (
          <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
            <details className="group rounded-md border border-[var(--color-border)] bg-background">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)]">
                <span>エスカレーション文面をプレビュー</span>
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <pre className="max-h-64 overflow-auto border-t border-[var(--color-border)] px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap text-[var(--color-text-secondary)]">
                {escalationText}
              </pre>
            </details>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {RULESET.escalationTeam}へ共有する文面です
              </span>
              <Button size="sm" className="gap-1.5" onClick={handleCopy}>
                {copied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? "コピーしました" : "エスカレーション文面をコピー"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
