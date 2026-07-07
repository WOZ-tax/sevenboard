import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Bot, RefreshCw, Sparkles } from "lucide-react";
import { useAiIndicatorsCommentary } from "@/hooks/use-mf-data";
import { ThinkingIndicator } from "@/components/ai/thinking-indicator";
import { PRINT_EXACT_CLASS } from "./indicator-tokens";
import { TONE_PILL_STYLE } from "./tone-styles";

/**
 * AI CFO 解説ブロック（トリガーカード + 解説カード）。
 * ボタン押下式・生成/カテゴリ表示ロジックは従来のまま。トーンのみ新デザインに合わせて調整。
 */
export function AiCfoBlock() {
  const [triggered, setTriggered] = useState(false);

  if (!triggered) {
    return (
      <Card className="border-dashed border-[var(--color-secondary)]/40 bg-gradient-to-br from-[#ede7f6]/30 via-white to-white">
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <Sparkles className="h-8 w-8 text-[var(--color-secondary)]" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">AI CFO 解説</p>
            <p className="text-xs text-muted-foreground">
              ボタンを押すと AI が安全性 / 収益性 / 効率性の指標を CFO 視点で総評します（数秒〜十数秒）。
            </p>
          </div>
          <Button
            onClick={() => setTriggered(true)}
            className="bg-[var(--color-secondary)] text-white hover:bg-[var(--color-secondary)]/90"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            AI 分析を実行
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <AiCommentaryCard />;
}

function AiCommentaryCard() {
  // useAiIndicatorsCommentary は render 時点で fetch する（トリガー後のみ mount される）。
  const commentary = useAiIndicatorsCommentary();

  // 色は indicator-tokens（TONE_PILL_STYLE）を参照。ラベルのみ AI 解説用に持つ。
  const levelBadge: Record<"good" | "caution" | "warning", { label: string }> = {
    good: { label: "良好" },
    caution: { label: "注意" },
    warning: { label: "要対応" },
  };

  return (
    <Card className="border-[var(--color-border)]">
      <CardContent className="p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-[var(--color-primary)]" />
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">AI CFO 解説</h2>
              <p className="text-xs text-muted-foreground">
                財務指標を CFO 視点で総評
                {commentary.data?.generatedAt && (
                  <>
                    {" / 生成: "}
                    {new Date(commentary.data.generatedAt).toLocaleString("ja-JP", {
                      hour: "2-digit",
                      minute: "2-digit",
                      month: "numeric",
                      day: "numeric",
                    })}
                  </>
                )}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => commentary.refetch()}
            disabled={commentary.isFetching}
            className="h-8 gap-1.5 px-2.5 text-xs"
            title="再生成"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", commentary.isFetching && "animate-spin")} />
            再生成
          </Button>
        </div>

        {commentary.isLoading ? (
          <ThinkingIndicator
            stages={[
              "MFデータ取得中",
              "財務指標を計算中",
              "AI CFO が指標を読み解き中",
              "総評と打ち手を整理中",
            ]}
          />
        ) : commentary.isError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            AI 解説の取得に失敗しました。再生成ボタンでリトライしてください。
          </div>
        ) : commentary.data ? (
          <div className="space-y-4">
            {/* 総評 */}
            <div className="rounded-md border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 p-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-primary)]">
                総評
              </div>
              <p className="text-sm leading-relaxed text-[var(--color-text-primary)]">
                {commentary.data.overallSummary}
              </p>
            </div>

            {/* カテゴリ別 */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {commentary.data.categories.map((cat) => {
                const badge = levelBadge[cat.level];
                return (
                  <div
                    key={cat.name}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                        {cat.name}
                      </span>
                      <Badge
                        className={cn("border-transparent text-[10px]", PRINT_EXACT_CLASS)}
                        style={TONE_PILL_STYLE[cat.level]}
                      >
                        {badge.label}
                      </Badge>
                    </div>
                    <p className="mb-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                      {cat.summary}
                    </p>
                    <div className="border-t border-[var(--color-border)] pt-2">
                      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        打ち手
                      </div>
                      <p className="text-xs leading-relaxed text-[var(--color-text-primary)]">
                        {cat.advice}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {commentary.data.fallbackReason && (
              <p className="text-[10px] text-muted-foreground">※ {commentary.data.fallbackReason}</p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
