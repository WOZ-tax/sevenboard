import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { HelpCircle } from "lucide-react";
import {
  formatBenchmark,
  getJudgment,
  type IndicatorDef,
} from "./derive-overview";
import { TONE_ACCENT_BORDER, TONE_LABEL, TONE_SOLID_BG, TONE_TEXT } from "./tone-styles";
import { ZoneScaleBar } from "./zone-scale-bar";

/**
 * 指標カード（刷新版）。
 * - 左端 4px の状態アクセントボーダーで良好/注意/要改善を静かに示す
 * - 大バッジを廃し、値の隣に小さな色ドット＋状態テキストのみ
 * - プログレスバーの代わりにゾーンスケールバー
 * - HelpCircle ツールチップ（計算式/意味/目安/注意点）は完全維持
 */
export function IndicatorCard({ def, value }: { def: IndicatorDef; value: number }) {
  const { tone } = getJudgment(def, value);

  return (
    <Card
      className={cn(
        "border-l-4 py-3 transition-shadow hover:shadow-md",
        TONE_ACCENT_BORDER[tone],
      )}
    >
      <CardContent className="space-y-2.5 p-4">
        {/* ラベル + ヘルプ */}
        <div className="flex items-center gap-1.5">
          <div className="text-sm font-medium text-[var(--color-text-primary)]">
            {def.label}
          </div>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={`${def.label}の説明`}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/70 hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              }
            />
            <TooltipContent
              side="top"
              className="max-w-sm whitespace-normal bg-[var(--color-text-primary)] p-3 text-left text-[11px] leading-relaxed"
            >
              <div className="space-y-2">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-background/60">計算式</div>
                  <div className="font-[family-name:var(--font-inter)]">{def.help.formula}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-background/60">意味</div>
                  <div>{def.help.meaning}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-background/60">目安</div>
                  <div>{def.help.benchmark}</div>
                </div>
                {def.help.caveat && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-background/60">注意点</div>
                    <div>{def.help.caveat}</div>
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* 値 + 状態（値の隣に小ドット＋状態テキスト） */}
        <div className="flex items-end justify-between gap-2">
          <div className="text-3xl font-bold tabular-nums leading-none text-[var(--color-text-primary)]">
            {value.toFixed(1)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">{def.unit}</span>
          </div>
          <div className="flex items-center gap-1.5 pb-0.5">
            <span className={cn("h-2 w-2 rounded-full", TONE_SOLID_BG[tone])} />
            <span className={cn("text-xs font-medium", TONE_TEXT[tone])}>{TONE_LABEL[tone]}</span>
          </div>
        </div>

        {/* ゾーンスケールバー */}
        <ZoneScaleBar def={def} value={value} />

        {/* 目安（機械生成の1行） */}
        <div className="text-xs text-muted-foreground">{formatBenchmark(def)}</div>
      </CardContent>
    </Card>
  );
}
