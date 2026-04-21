"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Mic, Bot, Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import { useAiTalkScript } from "@/hooks/use-mf-data";
import { isMfNotConnected } from "@/lib/api";
import { MfEmptyState } from "@/components/ui/mf-empty-state";

// --- モックデータ ---
const mockTalkScript = {
  opening:
    "先月もお忙しい中、月次のお打ち合わせのお時間をいただきありがとうございます。3月度の業績をご報告いたします。",
  sections: [
    {
      title: "売上・利益の状況",
      content:
        "売上高は前月比5.2%増の12,500万円で推移しております。計画比では98.4%とほぼ達成水準です。ただし営業利益率は22.4%と前期比でやや低下しており、主因は人件費の増加です。",
      qa: [
        {
          q: "人件費はどれくらい増えましたか？",
          a: "前月比で約8.3%の増加です。新規採用の2名分の人件費が反映されています。",
        },
      ],
    },
    {
      title: "資金繰り・キャッシュ",
      content:
        "現預金残高は17,800万円で、ランウェイは18.5ヶ月を維持しています。来月に設備投資2,000万円を予定していますが、資金余力は十分にございます。",
      qa: [],
    },
    {
      title: "今後の課題と提案",
      content:
        "販管費の最適化が今後の課題です。特に広告宣伝費のROIを分析し、効果の低い施策は停止することを推奨いたします。また、A社への売上依存度が35%に達しているため、新規顧客の開拓も並行して進めていきましょう。",
      qa: [
        {
          q: "新規顧客はどう開拓すべきですか？",
          a: "既存顧客からの紹介プログラムの整備と、ターゲットを絞ったセミナー開催が効果的と考えます。",
        },
      ],
    },
  ],
  closing:
    "以上が3月度のご報告です。来月は採用計画の見直しと広告宣伝費のROI分析結果をご報告いたします。",
  generatedAt: "2026-04-05 09:00",
};

type TalkScriptView = typeof mockTalkScript;

function buildPlainText(script: TalkScriptView): string {
  const parts: string[] = [];
  parts.push(`【オープニング】\n${script.opening}\n`);
  for (const sec of script.sections) {
    parts.push(`【${sec.title}】\n${sec.content}`);
    if (sec.qa.length > 0) {
      parts.push("  ― 想定Q&A ―");
      for (const item of sec.qa) {
        parts.push(`  Q: ${item.q}\n  A: ${item.a}`);
      }
    }
    parts.push("");
  }
  parts.push(`【クロージング】\n${script.closing}`);
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
      className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-[var(--color-text-primary)]"
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

function QaAccordion({
  qa,
}: {
  qa: { q: string; a: string }[];
}) {
  const [open, setOpen] = useState(false);

  if (qa.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        className="flex items-center gap-1 text-xs font-medium text-[var(--color-text-primary)] hover:underline"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        想定Q&A
      </button>
      {open && (
        <div className="mt-2 space-y-2 pl-5">
          {qa.map((item, i) => (
            <div key={i}>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                Q: {item.q}
              </p>
              <p className="text-sm text-muted-foreground">A: {item.a}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TalkScriptPage() {
  const { data: apiData, refetch, isFetching, error } = useAiTalkScript();
  const [generated, setGenerated] = useState(false);
  const mfNotConnected = isMfNotConnected(error);

  const script: TalkScriptView | null = generated && !mfNotConnected
    ? (apiData as unknown as TalkScriptView | undefined) ?? mockTalkScript
    : null;

  const handleGenerate = async () => {
    setGenerated(true);
    refetch();
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Mic className="h-6 w-6 text-[var(--color-tertiary)]" />
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
              トークスクリプト
            </h1>
            <p className="text-sm text-muted-foreground">
              月次報告用の話す原稿
            </p>
          </div>
        </div>

        {/* Generate Button */}
        {!generated && !mfNotConnected && (
          <Button
            className="gap-2 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
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
                AIが月次データを分析しています
              </p>
            </CardContent>
          </Card>
        )}

        {/* Generated Script */}
        {script && (
          <>
            {/* Full Copy Button */}
            <div className="flex justify-end">
              <CopyButton
                text={buildPlainText(script)}
                label="全文コピー"
              />
            </div>

            {/* Opening */}
            <Card className="border-l-4 border-l-[var(--color-tertiary)]">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base font-semibold text-[var(--color-text-primary)]">
                  オープニング
                  <CopyButton text={script.opening} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <blockquote className="border-l-2 border-muted-foreground/20 pl-4 text-base italic leading-relaxed text-muted-foreground">
                  {script.opening}
                </blockquote>
              </CardContent>
            </Card>

            {/* Sections */}
            {script.sections.map((section, index) => (
              <div key={index} className="space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-[var(--color-text-primary)]">
                    {section.title}
                  </h3>
                  <CopyButton
                    text={`${section.title}\n\n${section.content}${
                      section.qa.length > 0
                        ? "\n\n想定Q&A\n" +
                          section.qa
                            .map((item) => `Q: ${item.q}\nA: ${item.a}`)
                            .join("\n")
                        : ""
                    }`}
                  />
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {section.content}
                </p>
                <QaAccordion qa={section.qa} />
              </div>
            ))}

            {/* Closing */}
            <Card className="border-l-4 border-l-[var(--color-tertiary)]">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base font-semibold text-[var(--color-text-primary)]">
                  クロージング
                  <CopyButton text={script.closing} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <blockquote className="border-l-2 border-muted-foreground/20 pl-4 text-base italic leading-relaxed text-muted-foreground">
                  {script.closing}
                </blockquote>
              </CardContent>
            </Card>

            {/* Metadata */}
            <p className="text-right text-xs text-muted-foreground/60">
              生成日時: {script.generatedAt}
            </p>

            {/* Regenerate */}
            <div className="flex justify-end">
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
