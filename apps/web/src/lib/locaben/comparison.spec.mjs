// Run: node --test apps/web/src/lib/locaben/comparison.spec.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const apiRequire = createRequire(
  new URL("../../../../api/package.json", import.meta.url),
);
apiRequire("ts-node").register({
  transpileOnly: true,
  skipProject: true,
  compilerOptions: { module: "CommonJS", moduleResolution: "node" },
});
const {
  mergeSourceData,
  sanitizeOverrides,
  legacyManualOverrides,
  normalizeMetric,
  buildRadarData,
  sourceScope,
} = require("./comparison.ts");
const { computeLocabenMetrics, emptySourceData } = require("./metrics.ts");
const { getBenchmarkFor } = require("./constants.ts");

test("explicit zero and blanks override MF, while missing values stay missing", () => {
  const values = mergeSourceData(
    { revenueCurrent: 100, employeeCount: 8 },
    { revenueCurrent: 0, employeeCount: null },
  );
  assert.equal(values.revenueCurrent, 0);
  assert.equal(values.employeeCount, null);
  assert.equal(values.totalAssets, null);
  assert.deepEqual(
    sanitizeOverrides({
      totalAssets: Infinity,
      employeeCount: "8",
      unexpected: 12,
    }),
    {},
  );
});

test("each period keeps its own financial inputs and workforce", () => {
  const current = computeLocabenMetrics(
    mergeSourceData({ operatingProfit: 15000 }, { employeeCount: 5 }),
  );
  const prior = computeLocabenMetrics(
    mergeSourceData({ operatingProfit: 8000 }, { employeeCount: 2 }),
  );
  assert.equal(current.laborProductivity, 3000);
  assert.equal(prior.laborProductivity, 4000);
  assert.notEqual(sourceScope(2026, 8), sourceScope(2025, 8));
  assert.notEqual(sourceScope(2026, 8), sourceScope(2026));
});

test("legacy import includes only intentional manual inputs, never old MF snapshots", () => {
  assert.deepEqual(
    legacyManualOverrides({
      values: { employeeCount: 4, revenueCurrent: 200 },
      manualKeys: { employeeCount: true },
    }),
    { employeeCount: 4 },
  );
});

test("missing and nonfinite metrics never turn into zero on the radar", () => {
  assert.equal(normalizeMetric("equityRatio", null, 40), null);
  assert.equal(normalizeMetric("equityRatio", NaN, 40), null);
  assert.equal(normalizeMetric("equityRatio", 30, 0), null);
  assert.equal(normalizeMetric("equityRatio", 0, 40), 0);
});

test("all periods share a benchmark and scale, with inverse metrics and clipping preserved", () => {
  assert.equal(normalizeMetric("equityRatio", 60, 40), 150);
  assert.equal(normalizeMetric("workingCapitalTurnoverPeriod", 1, 2), 150);
  assert.equal(normalizeMetric("equityRatio", 100, 40), 200);
  assert.equal(normalizeMetric("equityRatio", -10, 40), 0);
  const empty = computeLocabenMetrics(emptySourceData());
  const data = buildRadarData(
    [empty, { ...empty, equityRatio: 38 }, { ...empty, equityRatio: 19 }],
    getBenchmarkFor("卸売業"),
  );
  const equity = data.find((row) => row.key === "equityRatio");
  assert.deepEqual(
    [equity.period0, equity.period1, equity.period2, equity.benchmark],
    [null, 100, 50, 100],
  );
});
