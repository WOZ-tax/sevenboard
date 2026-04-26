"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Mic,
  Bot,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  MessageCircleQuestion,
  Lightbulb,
  FileText,
  CheckCheck,
} from "lucide-react";
import { useAiTalkScript, useMfOffice } from "@/hooks/use-mf-data";
import { isMfNotConnected } from "@/lib/api";
import { MfEmptyState } from "@/components/ui/mf-empty-state";
import { PrintButton } from "@/components/ui/print-button";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";
import type { TalkScript, TalkScriptSection } from "@/lib/api-types";

function buildPlainText(script: TalkScript): string {
  const parts: string[] = [];
  parts.push(`【導入】\n${script.opening}\n`);
  for (const sec of script.sections) {
    parts.push(`【${sec.title}】${sec.material ? `（資料: ${sec.material}）` : ""}`);
    parts.push(sec.content);
    if (sec.hearings && sec.hearings.length > 0) {
      parts.push("  ― ヒアリング ―");
      for (const q of sec.hearings) parts.push(`  ・${q}`);
    }
    if (sec.proposals && sec.proposals.length > 0) {
      parts.push("  ― 提案・アクション ―");
      for (const p of sec.proposals) parts.push(`  ・${p}`);
    }
    if (sec.qa && sec.qa.length > 0) {
      parts.push("  ― 想定Q&A ―");
      for (const item of sec.qa) parts.push(`  Q: ${item.q}\n  A: ${item.a}`);
    }
    parts.push("");
  }
  parts.push(`【結び】\n${script.closing}`);
  if (script.nextActionsForAdvisor?.length) {
    parts.push("");
    parts.push("【次回までの宿題（担当者）】");
    for (const a of script.nextActionsForAdvisor) parts.push(`  ・${a}`);
  }
  if (script.nextActionsForExecutive?.length) {
    parts.push("");
    parts.push("【次回までの宿題（経営者）】");
    for (const a of script.nextActionsForExecutive) parts.push(`  ・${a}`);
  }
  return parts.join("\n");
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button
      variant="ghost"
      size="sm"
      className="screen-only h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-[var(--color-text-primary)]"
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {label || "コピー"}
    </Button>
  );
}

function QaAccordion({ qa }: { qa: { q: string; a: string }[] }) {
  const [open, setOpen] = useState(false);
  if (qa.length === 0) return null;
  return (
    <div className="mt-3">
      <button
        className="screen-only flex items-center gap-1 text-xs font-medium text-[var(--color-text-primary)] hover:underline"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        想定Q&A
      </button>
      <div className={`mt-2 space-y-2 pl-5 ${open ? "" : "print-only"}`}>
        {qa.map((item, i) => (
          <div key={i}>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              Q: {item.q}
            </p>
            <p className="text-sm text-muted-foreground">A: {item.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionCard({ section, index }: { section: TalkScriptSection; index: number }) {
  const copyText = [
    `${section.title}${section.material ? `（資料: ${section.material}）` : ""}`,
    "",
    section.content,
    section.hearings?.length
      ? "\n― ヒアリング ―\n" + section.hearings.map((h) => `・${h}`).join("\n")
      : "",
    section.proposals?.length
      ? "\n― 提案・アクション ―\n" + section.proposals.map((p) => `・${p}`).join("\n")
      : "",
    section.qa?.length
      ? "\n― 想定Q&A ―\n" +
        section.qa.map((i) => `Q: ${i.q}\nA: ${i.a}`).join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">
                {index + 1}
              </span>
              {section.title}
            </CardTitle>
            {section.material && (
              <div className="mt-1 inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                <FileText className="h-3 w-3" />
                資料: {section.material}
              </div>
            )}
          </div>
          <CopyButton text={copyText} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 担当者の発言 */}
        <blockquote className="border-l-2 border-[var(--color-primary)]/40 bg-muted/20 py-2 pl-4 text-sm leading-relaxed text-[var(--color-text-primary)]">
          {section.content}
        </blockquote>

        {/* 想定される経営者の反応 */}
        {section.anticipatedResponses && section.anticipatedResponses.length > 0 && (
          <div className="rounded-md border border-dashed border-[var(--color-border)] bg-background px-3 py-2 text-xs text-muted-foreground">
            <div className="mb-1 font-semibold uppercase tracking-wide">想定される社長の反応</div>
            <ul className="space-y-1">
              {section.anticipatedResponses.map((r, i) => (
                <li key={i}>— {r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ヒアリング */}
        {section.hearings && section.hearings.length > 0 && (
          <div className="rounded-md border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 px-3 py-2">
            <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-[var(--color-warning)]">
              <MessageCircleQuestion className="h-3.5 w-3.5" />
              ヒアリング
            </div>
            <ul className="space-y-1 text-sm text-[var(--color-text-primary)]">
              {section.hearings.map((h, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-warning)]" />
                  <span className="leading-relaxed">{h}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 提案 */}
        {section.proposals && section.proposals.length > 0 && (
          <div className="rounded-md border border-[var(--color-tertiary)]/30 bg-[var(--color-tertiary)]/5 px-3 py-2">
            <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-[var(--color-tertiary)]">
              <Lightbulb className="h-3.5 w-3.5" />
              提案・アクション設定
            </div>
            <ul className="space-y-1 text-sm text-[var(--color-text-primary)]">
              {section.proposals.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-tertiary)]" />
                  <span className="leading-relaxed">{p}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <QaAccordion qa={section.qa ?? []} />
      </CardContent>
    </Card>
  );
}

export default function TalkScriptPage() {
  const { data: apiData, refetch, isFetching, error } = useAiTalkScript();
  const [generated, setGenerated] = useState(false);
  const mfNotConnected = isMfNotConnected(error);
  const office = useMfOffice();
  const { fiscalYear, month, periods } = usePeriodStore();
  const periodLabel = getPeriodLabel(fiscalYear, month, periods);

  const script: TalkScript | null = generated && !mfNotConnected
    ? ((apiData as TalkScript | undefined) ?? null)
    : null;

  const handleGenerate = async () => {
    setGenerated(true);
    refetch();
  };

  return (
    <DashboardShell>
      <div className="space-y-4">
        {/* Print-only header */}
        <div className="print-only mb-4">
          <h1 className="text-xl font-bold">トークスクリプト（月次報告）</h1>
          <p className="text-sm">事業所: {office.data?.name || "—"}</p>
          <p className="text-sm">対象期間: {periodLabel}</p>
          <p className="text-sm">出力日: {new Date().toLocaleDateString("ja-JP")}</p>
          {script?.generatedAt && (
            <p className="text-sm">AI生成日時: {script.generatedAt}</p>
          )}
        </div>

        {/* Header */}
        <div className="screen-only flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Mic className="h-6 w-6 text-[var(--color-tertiary)]" />
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
                トークスクリプト
              </h1>
              <p className="text-sm text-muted-foreground">
                巡回監査・月次報告の会話原稿（導入→業績→P/L→B/S→予測→課題ヒアリング→結び）
              </p>
            </div>
          </div>
          {script && <PrintButton />}
        </div>

        {/* Generate Button */}
        {!generated && !mfNotConnected && (
          <Button
            className="screen-only gap-2 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
            onClick={handleGenerate}
          >
            <Mic className="h-4 w-4" />
            原稿を生成
          </Button>
        )}

        {mfNotConnected && <MfEmptyState />}

        {/* Loading */}
        {generated && isFetching && !script && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Bot className="h-12 w-12 animate-pulse text-[var(--color-tertiary)]" />
              <p className="mt-4 text-sm font-medium text-[var(--color-text-primary)]">
                原稿を生成中...
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                AI CFOが月次データを分析しています
              </p>
            </CardContent>
          </Card>
        )}

        {/* Error / empty response */}
        {generated && !isFetching && !script && !mfNotConnected && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">
                原稿の生成に失敗しました
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                サーバーから原稿を取得できませんでした。時間を置いて再試行してください。
              </p>
              <Button className="mt-4" variant="outline" onClick={() => refetch()}>
                再試行
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Generated Script */}
        {script && (
          <>
            {/* Full Copy Button */}
            <div className="screen-only flex justify-end">
              <CopyButton text={buildPlainText(script)} label="全文コピー" />
            </div>

            {/* 導入 */}
            <Card className="border-l-4 border-l-[var(--color-tertiary)]">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base font-semibold text-[var(--color-text-primary)]">
                  導入 — 本日の目的の共有
                  <CopyButton text={script.opening} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <blockquote className="border-l-2 border-[var(--color-primary)]/40 bg-muted/20 py-2 pl-4 text-sm leading-relaxed text-[var(--color-text-primary)]">
                  {script.opening}
                </blockquote>
              </CardContent>
            </Card>

            {/* 5ステップ */}
            <div className="space-y-4">
              {script.sections.map((section, i) => (
                <SectionCard key={i} section={section} index={i} />
              ))}
            </div>

            {/* 結び */}
            <Card className="border-l-4 border-l-[var(--color-tertiary)]">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base font-semibold text-[var(--color-text-primary)]">
                  結び — 次回までの宿題確認
                  <CopyButton text={script.closing} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <blockquote className="border-l-2 border-[var(--color-primary)]/40 bg-muted/20 py-2 pl-4 text-sm leading-relaxed text-[var(--color-text-primary)]">
                  {script.closing}
                </blockquote>

                {(script.nextActionsForAdvisor?.length || script.nextActionsForExecutive?.length) ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {script.nextActionsForAdvisor && script.nextActionsForAdvisor.length > 0 && (
                      <div className="rounded-md border bg-background p-3">
                        <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-[var(--color-text-primary)]">
                          <CheckCheck className="h-3.5 w-3.5" />
                          次回までの宿題（担当者側）
                        </div>
                        <ul className="space-y-1 text-sm text-[var(--color-text-primary)]">
                          {script.nextActionsForAdvisor.map((a, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" />
                              <span>{a}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {script.nextActionsForExecutive && script.nextActionsForExecutive.length > 0 && (
                      <div className="rounded-md border bg-background p-3">
                        <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-[var(--color-text-primary)]">
                          <CheckCheck className="h-3.5 w-3.5" />
                          次回までの宿題（経営者側）
                        </div>
                        <ul className="space-y-1 text-sm text-[var(--color-text-primary)]">
                          {script.nextActionsForExecutive.map((a, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" />
                              <span>{a}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {/* Metadata */}
            <p className="text-right text-xs text-muted-foreground/60">
              生成日時: {script.generatedAt}
            </p>

            {/* Regenerate */}
            <div className="screen-only flex justify-end">
              <Button
                className="gap-2 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <Mic className={cn("h-4 w-4", isFetching && "animate-pulse")} />
                {isFetching ? "生成中..." : "原稿を再生成"}
              </Button>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
