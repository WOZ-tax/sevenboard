import { cn } from "@/lib/utils";
import { buildScale, getJudgment, type IndicatorDef } from "./derive-overview";
import { TONE_SOLID_BG, ZONE_BG } from "./tone-styles";

/**
 * しきい値で 3 ゾーンに塗り分けたスケールバー。
 * 現在値の位置に濃色マーカー（縦線＋ドット）を置き、しきい値に目盛りラベルを付ける。
 * value/max の単純プログレスではなく「どのゾーンにいるか」を一目で示す。
 *
 * 印刷時も塗りが飛ばないよう、ゾーン/マーカーには print-color-adjust:exact を局所付与する
 * （グローバルの print CSS は変更しない）。
 */
export function ZoneScaleBar({ def, value }: { def: IndicatorDef; value: number }) {
  const { zones, ticks, marker } = buildScale(def, value);
  const tone = getJudgment(def, value).tone;

  return (
    <div className="space-y-1" aria-hidden="true">
      <div className="relative h-2.5 w-full">
        {/* 3 ゾーンの塗り */}
        <div className="absolute inset-0 flex overflow-hidden rounded-full ring-1 ring-inset ring-black/5 [-webkit-print-color-adjust:exact] [print-color-adjust:exact]">
          {zones.map((zone, i) => (
            <div
              key={i}
              className={cn("h-full", ZONE_BG[zone.tone])}
              style={{ width: `${zone.endPct - zone.startPct}%` }}
            />
          ))}
        </div>

        {/* 現在値マーカー: 縦線＋ドット（濃色） */}
        <div
          className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${marker.pct}%` }}
        >
          <div
            className={cn(
              "h-4 w-[3px] rounded-full ring-1 ring-white [-webkit-print-color-adjust:exact] [print-color-adjust:exact]",
              TONE_SOLID_BG[tone],
            )}
          />
          <div
            className={cn(
              "absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white [-webkit-print-color-adjust:exact] [print-color-adjust:exact]",
              TONE_SOLID_BG[tone],
            )}
          />
        </div>
      </div>

      {/* しきい値の目盛りラベル */}
      <div className="relative h-3.5 text-[10px] tabular-nums text-muted-foreground">
        {ticks.map((tick, i) => (
          <span
            key={i}
            className="absolute whitespace-nowrap"
            style={{
              left: `${tick.pct}%`,
              // 端の目盛りが見切れないよう寄せる（中央は -50%）
              transform:
                tick.pct <= 4
                  ? "translateX(0)"
                  : tick.pct >= 96
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
            }}
          >
            {tick.label}
          </span>
        ))}
        {(marker.clampedHigh || marker.clampedLow) && (
          <span
            className="absolute font-medium text-[var(--color-text-secondary)]"
            style={
              marker.clampedHigh
                ? { right: 0 }
                : { left: 0 }
            }
          >
            {marker.clampedHigh ? "＞" : "＜"}
          </span>
        )}
      </div>
    </div>
  );
}
