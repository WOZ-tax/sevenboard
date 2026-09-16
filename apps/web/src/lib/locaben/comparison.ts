import {
  LOCABEN_METRICS,
  LOCABEN_METRIC_KEYS,
  SOURCE_DATA_KEYS,
  type LocabenMetricKey,
  type SourceDataKey,
} from "./constants";
import { emptySourceData, type SourceData } from "./metrics";

export type SourceOverrides = Partial<SourceData>;

export const COMPARISON_STYLES = [
  { color: "#2563eb", dash: undefined, label: "選択期" },
  { color: "#d97706", dash: "7 4", label: "前期" },
  { color: "#7c3aed", dash: "2 4", label: "前々期" },
] as const;

export function sourceScope(fiscalYear: number, month?: number): string {
  return `${fiscalYear}:${month ?? "full"}`;
}

/** Only explicit, finite inputs (including zero) or intentional blanks are stored. */
export function sanitizeOverrides(value: unknown): SourceOverrides {
  if (!value || typeof value !== "object") return {};
  const result: SourceOverrides = {};
  for (const key of SOURCE_DATA_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const v = (value as Record<string, unknown>)[key];
    if (v === null || (typeof v === "number" && Number.isFinite(v))) {
      result[key] = v;
    }
  }
  return result;
}

export function mergeSourceData(
  mf: Partial<SourceData> | undefined,
  overrides: SourceOverrides,
): SourceData {
  return { ...emptySourceData(), ...sanitizeOverrides(mf), ...overrides };
}

export function legacyManualOverrides(
  legacy:
    | {
        values?: Record<string, number | null>;
        manualKeys?: Record<string, true>;
      }
    | null
    | undefined,
): SourceOverrides {
  return sanitizeOverrides(
    Object.fromEntries(
      SOURCE_DATA_KEYS.filter((key) => legacy?.manualKeys?.[key]).map((key) => [
        key,
        legacy?.values?.[key],
      ]),
    ),
  );
}

/** Missing inputs stay missing; they must never become a zero-radius result. */
export function normalizeMetric(
  key: LocabenMetricKey,
  value: number | null,
  benchmark: number,
): number | null {
  if (
    value === null ||
    !Number.isFinite(value) ||
    !Number.isFinite(benchmark) ||
    benchmark === 0
  ) {
    return null;
  }
  const ratio = (value / benchmark) * 100;
  return Math.max(
    0,
    Math.min(200, LOCABEN_METRICS[key].higherIsBetter ? ratio : 200 - ratio),
  );
}

export function buildRadarData(
  metrics: Record<LocabenMetricKey, number | null>[],
  benchmarks: Record<LocabenMetricKey, number>,
) {
  return LOCABEN_METRIC_KEYS.map((key) => ({
    metric: LOCABEN_METRICS[key].label,
    key,
    benchmark: 100,
    ...Object.fromEntries(
      metrics.map((values, i) => [
        `period${i}`,
        normalizeMetric(key, values[key], benchmarks[key]),
      ]),
    ),
  }));
}

export function manualKeysFor(overrides: SourceOverrides) {
  return Object.fromEntries(
    Object.keys(overrides).map((key) => [key, true]),
  ) as Partial<Record<SourceDataKey, true>>;
}
