"use client";

/**
 * 経理レビュー — tb-review エンジン (REVIEW_ENGINE=tbreview) ネイティブ表示。
 *
 * データ元は API レスポンスの `tbreview`（tb-review-api の生レスポンス）。
 * 構成は tb-review-web の調書 (app/templates/result.html) に合わせ、見た目は
 * sevenboard の既存流儀（shadcn/ui + page.tsx のトーン）に寄せている。
 *
 * 表示規約（tb-review CLAUDE.md「数値と性質の出典必須」）:
 *   - 金額・件数・理由・対応はすべて findings JSON からの**転記のみ**。
 *     再計算・要約・言い換えはしない（fmtYen の桁区切りだけが唯一の加工）。
 *   - 明細の並びと採否は triage（統合トリアージ）の結果に従う。
 *     dedup で統合された指摘は明細に復活させず、開示セクションで件数を示す。
 *   - エンジン失敗・部分失敗は必ず可視化する（失敗 ≠ 指摘ゼロ）。
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Play } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionizeButton } from "@/components/ui/actionize-button";
import { cn } from "@/lib/utils";
import { ReviewAlertsList } from "./review-alerts-list";
import {
  buildTbReviewView,
  findingDetail,
  findingTitle,
  fmtYen,
  sourceLabel,
} from "@/lib/tbreview-view";
import type { ReviewResult, TbReviewDisclosure } from "@/lib/mf-types";

type ActionSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

const TB_SEVERITY: Record<
  string,
  { label: string; badge: string; action: ActionSeverity }
> = {
  A: {
    label: "A 修正提案",
    badge: "bg-red-100 text-red-800 border-red-300",
    action: "HIGH",
  },
  B: {
    label: "B 要確認",
    badge: "bg-yellow-100 text-yellow-800 border-yellow-300",
    action: "MEDIUM",
  },
  INFO: {
    label: "参考",
    badge: "bg-gray-100 text-gray-600 border-gray-300",
    action: "LOW",
  },
};

function severityConfig(severity: string | undefined) {
  return TB_SEVERITY[String(severity || "INFO")] || TB_SEVERITY.INFO;
}

function SevBadge({ severity }: { severity: string | undefined }) {
  const config = severityConfig(severity);
  return (
    <Badge className={cn("shrink-0 border text-[10px] whitespace-nowrap", config.badge)}>
      {config.label}
    </Badge>
  );
}

function AccountCell({ account, subAccount }: { account: string; subAccount?: string }) {
  return (
    <div className="min-w-[110px]">
      <div className="font-medium text-[var(--color-text-primary)]">{account || "—"}</div>
      {subAccount ? (
        <div className="text-[10px] text-muted-foreground">{subAccount}</div>
      ) : null}
    </div>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-sm text-muted-foreground">
        {message}
      </CardContent>
    </Card>
  );
}

export function TbReviewResult({
  data,
  onRerun,
  isRerunning,
}: {
  data: ReviewResult;
  onRerun: () => void;
  isRerunning?: boolean;
}) {
  const tb = data.tbreview;
  const view = useMemo(() => buildTbReviewView(tb || {}), [tb]);
  const [section, setSection] = useState<string>("top");

  if (!tb) return null;

  const engines = tb.engines || [];
  const failedEngines = engines.filter((e) => e?.returncode !== 0);
  const triage = tb.triage || {};
  const counts = triage.counts || {};
  const monthlyScore = triage.scores?.monthly_score;
  const top = triage.top || [];
  const dedup = triage.dedup || [];
  const disclosures = triage.disclosures || [];
  const warnings = tb.warnings || [];
  const hasDisclosure =
    failedEngines.length > 0 ||
    dedup.length > 0 ||
    disclosures.length > 0 ||
    warnings.length > 0;

  const sections: { key: string; label: string }[] = [
    { key: "top", label: `要対応TOP${top.length || ""}` },
    ...view.sourceKeys.map((s) => ({
      key: `src:${s}`,
      label: `${sourceLabel(s)}(${view.bySource[s]?.length ?? 0})`,
    })),
    ...(hasDisclosure ? [{ key: "disclosure", label: "開示" }] : []),
    { key: "alerts", label: `指摘一覧(${data.alerts?.length || 0})` },
  ];
  const activeSection = sections.some((s) => s.key === section) ? section : "top";

  const tiles: { key: string; label: string; value: string; unit: string; className: string; valueClassName: string; labelClassName: string }[] = [
    {
      key: "A",
      label: "A 修正提案",
      value: String(counts.A ?? 0),
      unit: "件",
      className: "border-red-200 bg-red-50",
      valueClassName: "text-red-700",
      labelClassName: "text-red-600",
    },
    {
      key: "B",
      label: "B 要確認",
      value: String(counts.B ?? 0),
      unit: "件",
      className: "border-yellow-200 bg-yellow-50",
      valueClassName: "text-yellow-700",
      labelClassName: "text-yellow-600",
    },
    {
      key: "INFO",
      label: "参考",
      value: String(counts.INFO ?? 0),
      unit: "件",
      className: "border-gray-200 bg-gray-50",
      valueClassName: "text-gray-700",
      labelClassName: "text-gray-500",
    },
  ];
  if (monthlyScore !== undefined && monthlyScore !== null) {
    tiles.push({
      key: "score",
      label: "月次スコア",
      value: String(monthlyScore),
      unit: "点",
      className: "bg-muted/20",
      valueClassName: "",
      labelClassName: "text-muted-foreground",
    });
  }

  return (
    <div className="space-y-4">
      {/* エンジン失敗の帯 — 「失敗 ≠ 指摘ゼロ」を最上段で明示する */}
      {failedEngines.map((e, i) => (
        <Card key={i} className="border-red-300 bg-red-50" data-print-block>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4" />
              {e.label || e.key || "エンジン"} レビュー未完了
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-red-700">
              このエンジンは異常終了しました（exit code {e.returncode ?? "unknown"}）。
              下記の指摘に {e.label || e.key} の結果は含まれていません。
              <strong>指摘ゼロではありません。</strong>
            </p>
            {e.stderr_tail ? (
              <details className="text-xs text-red-700">
                <summary className="cursor-pointer">エラー出力（末尾）</summary>
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded border border-red-200 bg-white/70 p-2 text-[10px] text-muted-foreground">
                  {e.stderr_tail}
                </pre>
              </details>
            ) : null}
          </CardContent>
        </Card>
      ))}

      {/* ヘッダ行: エンジンチップ + 分析日時 + vendor rev */}
      <div className="flex flex-wrap items-center gap-2">
        {engines.map((e, i) => {
          const ok = e?.returncode === 0;
          return (
            <span
              key={i}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
                ok ? "border-input" : "border-red-300 bg-red-50",
              )}
            >
              <span className={cn("font-medium", ok ? "text-[var(--color-text-primary)]" : "text-red-700")}>
                {e?.label || sourceLabel(String(e?.key || ""))}
              </span>
              <span className={cn("font-semibold", ok ? "text-green-700" : "text-red-700")}>
                {ok ? "完了" : "失敗"}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {typeof e?.findings_count === "number" ? `${e.findings_count}件` : "—"}
                {typeof e?.seconds === "number" ? ` / ${e.seconds}秒` : ""}
                {ok ? "" : ` / exit ${e?.returncode ?? "?"}`}
              </span>
            </span>
          );
        })}
        <div className="ml-auto text-right text-[11px] text-muted-foreground">
          <div>
            分析日時: {data.analyzedAt ? new Date(data.analyzedAt).toLocaleString("ja-JP") : "—"}
          </div>
          {tb.vendor?.rev ? (
            <div className="text-[10px]">
              tb-review rev {tb.vendor.rev}
              {tb.vendor.synced_at ? ` / 同期 ${tb.vendor.synced_at}` : ""}
            </div>
          ) : null}
        </div>
      </div>

      {/* 統計タイル */}
      <div
        className={cn(
          "grid grid-cols-2 gap-3",
          tiles.length === 4 ? "md:grid-cols-4" : "md:grid-cols-3",
        )}
      >
        {tiles.map((t) => (
          <div key={t.key} className={cn("rounded-lg border p-3 text-center", t.className)}>
            <div className={cn("text-2xl font-bold tabular-nums", t.valueClassName)}>
              {t.value}
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">{t.unit}</span>
            </div>
            <div className={cn("text-[10px]", t.labelClassName)}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* セクションナビ */}
      <div role="tablist" aria-label="経理レビューのセクション" className="flex gap-1 overflow-x-auto">
        {sections.map((s) => {
          const selected = activeSection === s.key;
          return (
            <button
              key={s.key}
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setSection(s.key)}
              className={cn(
                "whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium",
                selected
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                  : "border-input text-muted-foreground hover:bg-muted/50",
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* 要対応TOP */}
      {activeSection === "top" && (
        top.length === 0 ? (
          <EmptyCard message="表示対象の指摘はありません。エンジンが失敗している場合は上部の帯を確認してください。" />
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                <span>要対応TOP{top.length}</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  重要度 → 金額影響の順
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      {["#", "重要度", "ソース", "科目 / 補助", "対象金額", "影響額", "理由（エンジン出力原文）", "対応", ""].map((h, i) => (
                        <th
                          key={i}
                          className={cn(
                            "py-1.5 font-semibold",
                            i === 4 || i === 5 ? "text-right" : "text-left",
                          )}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {top.map((t, i) => {
                      const source = String(t?.source || "");
                      const finding =
                        view.index.get(`${source}::${String(t?.finding_id || "")}`) || {};
                      return (
                        <tr key={t?.finding_id || i} className="border-b align-top">
                          <td
                            className={cn(
                              "py-2 pr-2 text-right tabular-nums text-muted-foreground",
                              String(t?.severity) === "A" && "border-l-2 border-l-red-500 pl-1",
                            )}
                          >
                            {t?.rank ?? i + 1}
                          </td>
                          <td className="py-2 pr-2"><SevBadge severity={t?.severity} /></td>
                          <td className="py-2 pr-2 whitespace-nowrap text-muted-foreground">
                            {t?.source_label || sourceLabel(source)}
                          </td>
                          <td className="py-2 pr-2">
                            <AccountCell
                              account={t?.account || finding.target?.account || ""}
                              subAccount={finding.target?.sub_account}
                            />
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums whitespace-nowrap">
                            {fmtYen(t?.target_amount)}
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums whitespace-nowrap">
                            {t?.impact_amount ? fmtYen(t.impact_amount) : "—"}
                          </td>
                          <td className="min-w-[260px] py-2 pr-2 whitespace-pre-wrap">
                            {finding.reason || ""}
                          </td>
                          <td className="min-w-[180px] py-2 pr-2 whitespace-pre-wrap text-muted-foreground">
                            {finding.action || ""}
                          </td>
                          <td className="py-2 text-right">
                            <ActionizeButton
                              sourceScreen="MONTHLY_REVIEW"
                              sourceRef={{
                                kind: "tbreview-finding",
                                source,
                                findingId: t?.finding_id,
                                ruleId: t?.rule_id,
                              }}
                              defaultTitle={findingTitle(finding)}
                              defaultDescription={findingDetail(finding)}
                              defaultSeverity={severityConfig(t?.severity).action}
                              defaultOwnerRole="ADVISOR"
                              size="sm"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )
      )}

      {/* ソース別 指摘明細 */}
      {view.sourceKeys.map((source) => {
        if (activeSection !== `src:${source}`) return null;
        const items = view.bySource[source] || [];
        const merged = view.mergedBySource[source] || 0;
        if (items.length === 0) {
          return (
            <div key={source} className="space-y-2">
              <EmptyCard message={`${sourceLabel(source)}エンジンからの指摘はありません。`} />
              {merged > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  ※ {merged}件は仕訳異常の原因診断に統合済み（開示タブ参照）
                </p>
              )}
            </div>
          );
        }
        return (
          <Card key={source}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                <span>{sourceLabel(source)} 指摘明細</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  {items.length}件
                  {merged > 0 ? ` / 統合済み ${merged}件は開示タブ` : ""}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      {["重要度", "科目 / 補助", "対象金額", "現状", "期待", "理由（エンジン出力原文）", "対応", "検出ルール", ""].map((h, i) => (
                        <th
                          key={i}
                          className={cn("py-1.5 font-semibold", i === 2 ? "text-right" : "text-left")}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => {
                      const f = item.finding;
                      return (
                        <tr key={item.findingId || i} className="border-b align-top">
                          <td
                            className={cn(
                              "py-2 pr-2",
                              item.severity === "A" && "border-l-2 border-l-red-500 pl-1",
                            )}
                          >
                            <SevBadge severity={item.severity} />
                          </td>
                          <td className="py-2 pr-2">
                            <AccountCell
                              account={f.target?.account || ""}
                              subAccount={f.target?.sub_account}
                            />
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums whitespace-nowrap">
                            {fmtYen(f.target?.amount)}
                            {f.impact?.amount ? (
                              <div className="text-[10px] text-muted-foreground">
                                影響額 {fmtYen(f.impact.amount)}
                              </div>
                            ) : null}
                          </td>
                          <td className="min-w-[110px] py-2 pr-2 whitespace-pre-wrap">{f.current || ""}</td>
                          <td className="min-w-[120px] py-2 pr-2 whitespace-pre-wrap">{f.expected || ""}</td>
                          <td className="min-w-[260px] py-2 pr-2 whitespace-pre-wrap">{f.reason || ""}</td>
                          <td className="min-w-[180px] py-2 pr-2 whitespace-pre-wrap text-muted-foreground">
                            {f.action || ""}
                          </td>
                          <td className="py-2 pr-2 whitespace-nowrap font-mono text-[10px] text-muted-foreground">
                            <div>{item.ruleId || "—"}</div>
                            {item.findingId ? <div className="opacity-70">{item.findingId}</div> : null}
                          </td>
                          <td className="py-2 text-right">
                            <ActionizeButton
                              sourceScreen="MONTHLY_REVIEW"
                              sourceRef={{
                                kind: "tbreview-finding",
                                source: item.source,
                                findingId: item.findingId,
                                ruleId: item.ruleId,
                              }}
                              defaultTitle={findingTitle(f)}
                              defaultDescription={findingDetail(f)}
                              defaultSeverity={severityConfig(item.severity).action}
                              defaultOwnerRole="ADVISOR"
                              size="sm"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* 開示 */}
      {activeSection === "disclosure" && (
        <div className="space-y-4">
          {failedEngines.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">エンジンの実行失敗</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {failedEngines.map((e, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {e.label || e.key}: exit {e.returncode ?? "unknown"}
                    {e.stderr_tail ? ` / ${e.stderr_tail}` : ""}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}

          {disclosures.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>少額除外・抑止</span>
                  <span className="text-[10px] font-normal text-muted-foreground">
                    エンジンが記録した値の転記
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        {["ソース", "少額のため対象外", "機械チェック生指摘", "その他"].map((h, i) => (
                          <th
                            key={i}
                            className={cn("py-1.5 font-semibold", i === 1 || i === 2 ? "text-right" : "text-left")}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {disclosures.map((d: TbReviewDisclosure, i: number) => {
                        const others: string[] = [];
                        const suppressed = d.suppressed_by_rule;
                        if (suppressed && Object.keys(suppressed).length > 0) {
                          others.push(
                            `抑止: ${Object.entries(suppressed)
                              .map(([rule, n]) => `${rule}=${n}`)
                              .join(", ")}`,
                          );
                        }
                        if (d.skipped_rows) others.push(`スキップ行: ${d.skipped_rows}`);
                        if (d.errors) {
                          others.push(
                            `エラー: ${Array.isArray(d.errors) ? d.errors.join(" / ") : d.errors}`,
                          );
                        }
                        return (
                          <tr key={i} className="border-b align-top">
                            <td className="py-2 pr-2 whitespace-nowrap">
                              {d.source_label || sourceLabel(String(d.source || ""))}
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums whitespace-nowrap">
                              {typeof d.dropped_count === "number"
                                ? `${d.dropped_count}件 ${fmtYen(d.dropped_amount)}`
                                : "—"}
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums">
                              {typeof d.raw_findings === "number" ? `${d.raw_findings}件` : "—"}
                            </td>
                            <td className="py-2 whitespace-pre-wrap text-muted-foreground">
                              {others.join(" / ") || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {dedup.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>統合された指摘 ({dedup.length}件)</span>
                  <span className="text-[10px] font-normal text-muted-foreground">
                    月次のマイナス残高指摘を仕訳異常の原因診断に統合
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        {["統合先（仕訳異常）", "統合された指摘", "科目", "対象金額"].map((h, i) => (
                          <th
                            key={i}
                            className={cn("py-1.5 font-semibold", i === 3 ? "text-right" : "text-left")}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dedup.map((d, i) => (
                        <tr key={i} className="border-b">
                          <td className="py-2 pr-2 font-mono text-[10px]">
                            {d.merged_into?.rule_id || "—"}
                          </td>
                          <td className="py-2 pr-2 font-mono text-[10px]">
                            {d.dropped?.rule_id || "—"}
                          </td>
                          <td className="py-2 pr-2">{d.dropped?.account || "—"}</td>
                          <td className="py-2 text-right tabular-nums whitespace-nowrap">
                            {fmtYen(d.dropped?.target_amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {warnings.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">入力変換の警告</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {warnings.map((w, i) => (
                  <p key={i} className="text-xs text-muted-foreground">{String(w)}</p>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 指摘一覧（alerts ベース・legacy と同じ見た目） */}
      {activeSection === "alerts" && <ReviewAlertsList alerts={data.alerts} />}

      {/* 再実行 */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="gap-1 text-xs"
          onClick={onRerun}
          disabled={isRerunning}
        >
          <Play className="h-3 w-3" />再実行
        </Button>
      </div>
    </div>
  );
}
