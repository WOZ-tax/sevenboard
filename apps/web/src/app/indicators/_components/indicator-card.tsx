import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { HelpCircle } from "lucide-react";
import {
  buildScale,
  formatBenchmark,
  getJudgment,
  type IndicatorDef,
} from "./derive-overview";
import { PRINT_EXACT_CLASS, SLATE } from "./indicator-tokens";
import { TONE_LABEL, TONE_PILL_STYLE, TONE_SOLID_STYLE } from "./tone-styles";

/**
 * 指標カード（スピードメーター刷新版）。
 * - 左端アクセントボーダーは廃止（pill と重複するため）
 * - ゾーンスケールバー廃止 → ミニステータスバー（中立トラック + 状態色フィル + しきい値ティック）
 * - 状態 pill を値の右上に復活（rounded-full・淡背景 + 濃文字）
 * - HelpCircle ツールチップ（計算式 / 意味 / 目安 / 注意点）は完全維持
 */
export function IndicatorCard({ def, value }: { def: IndicatorDef; value: number }) {
  const { tone } = getJudgment(def, value);
  const { ticks, marker } = buildScale(def, value);

  return (
    <Card className="py-3 transition-shadow hover:shadow-md">
      <CardContent className="space-y-2.5 p-4">
        {/* ラベル + ヘルプ ......... 状態 pill（右上） */}
        <div className="flex items-start justify-between gap-2">
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
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
              PRINT_EXACT_CLASS,
            )}
            style={TONE_PILL_STYLE[tone]}
          >
            {TONE_LABEL[tone]}
          </span>
        </div>

        {/* 値 */}
        <div className="text-3xl font-bold tabular-nums leading-none text-[var(--color-text-primary)]">
          {value.toFixed(1)}
          <span className="ml-1 text-sm font-normal text-muted-foreground">{def.unit}</span>
        </div>

        {/* ミニステータスバー: 中立トラック + 状態色フィル + しきい値ティック 2 本 */}
        <div
          className="relative h-1.5 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: SLATE.barTrack }}
          aria-hidden="true"
        >
          <div
            className={cn("absolute inset-y-0 left-0 rounded-full", PRINT_EXACT_CLASS)}
            style={{ width: `${marker.pct}%`, ...TONE_SOLID_STYLE[tone] }}
          />
          {ticks.map((tick, i) => (
            <div
              key={i}
              className="absolute inset-y-0 w-px"
              style={{ left: `${tick.pct}%`, backgroundColor: SLATE.tick }}
            />
          ))}
        </div>

        {/* 目安（機械生成の1行） */}
        <div className="text-xs text-muted-foreground">{formatBenchmark(def)}</div>
      </CardContent>
    </Card>
  );
}
