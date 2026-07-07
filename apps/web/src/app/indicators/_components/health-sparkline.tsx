import type { HealthSnapshotItem } from "@/lib/api";

/**
 * 健康スコアの推移スパークライン + 最新スコア。
 * データ無し / 2 点未満なら何も描かない（権限・データ無しでも黙って非表示）。
 */
export function HealthSparkline({ history }: { history?: HealthSnapshotItem[] }) {
  if (!history || history.length < 2) return null;

  const points = [...history]
    .sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate))
    .map((h) => h.score)
    .filter((s) => typeof s === "number" && Number.isFinite(s));

  if (points.length < 2) return null;

  const latest = points[points.length - 1];
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  const W = 96;
  const H = 28;
  const PAD = 3;
  const coords = points.map((p, i) => {
    const x = PAD + (i / (points.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - (p - min) / span) * (H - PAD * 2);
    return [x, y] as const;
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <div className="flex items-center gap-2">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="overflow-visible"
        role="img"
        aria-label="健康スコアの推移"
      >
        <path
          d={path}
          fill="none"
          stroke="var(--color-secondary)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={lastX} cy={lastY} r={2.5} fill="var(--color-secondary)" />
      </svg>
      <div className="leading-tight">
        <div className="text-lg font-bold tabular-nums text-[var(--color-text-primary)]">
          {Math.round(latest)}
        </div>
        <div className="text-[10px] text-muted-foreground">健康スコア</div>
      </div>
    </div>
  );
}
