/**
 * 財務指標ページの派生計算（純関数）の境界値テスト。
 *
 * apps/web にテスト基盤（jest/vitest）が無いため、node 実行可能な軽量スクリプトとして実装。
 * package.json は変更しない。
 *
 * 実行:
 *   node apps/web/src/app/indicators/_components/derive-overview.spec.mjs
 *   （Node 22+ は .ts を型ストリップして読み込める。実験的機能の警告が stderr に出るが正常。）
 */

import assert from "node:assert/strict";
import {
  getJudgment,
  deriveOverview,
  buildScale,
  formatBenchmark,
  formatThreshold,
} from "./derive-overview.ts";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL  ${name}`);
    console.error(`      ${e.message}`);
  }
}

// --- getJudgment: higherIsBetter -------------------------------------------
const hib = { good: 200, caution: 100, higherIsBetter: true };
test("higherIsBetter: value == good → 良好", () => {
  assert.equal(getJudgment(hib, 200).tone, "good");
});
test("higherIsBetter: value == caution → 注意 (境界は注意側)", () => {
  assert.equal(getJudgment(hib, 100).tone, "caution");
});
test("higherIsBetter: caution 未満 → 要改善", () => {
  assert.equal(getJudgment(hib, 99.9).tone, "warning");
});

// --- getJudgment: lowerIsBetter --------------------------------------------
const lib = { good: 100, caution: 200, higherIsBetter: false };
test("lowerIsBetter: value == good → 良好", () => {
  assert.equal(getJudgment(lib, 100).tone, "good");
});
test("lowerIsBetter: value == caution → 注意", () => {
  assert.equal(getJudgment(lib, 200).tone, "caution");
});
test("lowerIsBetter: caution 超過 → 要改善", () => {
  assert.equal(getJudgment(lib, 201).tone, "warning");
});
test("lowerIsBetter: 純資産マイナス(負値)は良好にしない", () => {
  assert.equal(getJudgment(lib, -50).tone, "warning");
});

// --- deriveOverview: 優先順位 要改善 > 注意 > 良好 --------------------------
const S = { category: "safety", good: 200, caution: 100, higherIsBetter: true };
const P = { category: "profit", good: 10, caution: 3, higherIsBetter: true };
const E = { category: "efficiency", good: 1, caution: 0.5, higherIsBetter: true };

test("deriveOverview: 全良好 → good", () => {
  const r = deriveOverview([
    { def: S, value: 250 },
    { def: P, value: 20 },
    { def: E, value: 2 },
  ]);
  assert.equal(r.overall, "good");
  assert.equal(r.overallLabel, "良好");
  assert.deepEqual(r.counts, { good: 3, caution: 0, warning: 0 });
});

test("deriveOverview: 注意のみ → caution / 注意あり", () => {
  const r = deriveOverview([
    { def: S, value: 150 }, // caution
    { def: P, value: 20 }, // good
  ]);
  assert.equal(r.overall, "caution");
  assert.equal(r.overallLabel, "注意あり");
});

test("deriveOverview: 要改善が1つでもあれば warning（注意より優先）", () => {
  const r = deriveOverview([
    { def: S, value: 150 }, // caution
    { def: P, value: 1 }, // warning
    { def: E, value: 2 }, // good
  ]);
  assert.equal(r.overall, "warning");
  assert.equal(r.overallLabel, "要改善あり");
  assert.deepEqual(r.counts, { good: 1, caution: 1, warning: 1 });
});

test("deriveOverview: カテゴリ別は最悪 tone を採用", () => {
  const r = deriveOverview([
    { def: S, value: 250 }, // safety good
    { def: S, value: 150 }, // safety caution → safety = caution
    { def: P, value: 1 }, // profit warning
    { def: E, value: 2 }, // efficiency good
  ]);
  assert.equal(r.categories.safety, "caution");
  assert.equal(r.categories.profit, "warning");
  assert.equal(r.categories.efficiency, "good");
});

test("deriveOverview: 指標が無いカテゴリは null", () => {
  const r = deriveOverview([{ def: S, value: 250 }]);
  assert.equal(r.categories.safety, "good");
  assert.equal(r.categories.profit, null);
  assert.equal(r.categories.efficiency, null);
});

test("deriveOverview: 空入力 → 全 good / null", () => {
  const r = deriveOverview([]);
  assert.equal(r.overall, "good");
  assert.deepEqual(r.counts, { good: 0, caution: 0, warning: 0 });
  assert.equal(r.categories.safety, null);
});

// --- formatThreshold / formatBenchmark -------------------------------------
test("formatThreshold: 整数は末尾 .0 を付けない", () => {
  assert.equal(formatThreshold(200), "200");
  assert.equal(formatThreshold(1.0), "1");
  assert.equal(formatThreshold(0.5), "0.5");
});

test("formatBenchmark: higherIsBetter", () => {
  assert.equal(
    formatBenchmark({ good: 200, caution: 100, unit: "%", higherIsBetter: true }),
    "良好 ≥200% / 注意 <100%",
  );
});

test("formatBenchmark: lowerIsBetter", () => {
  assert.equal(
    formatBenchmark({ good: 100, caution: 200, unit: "%", higherIsBetter: false }),
    "良好 ≤100% / 注意 >200%",
  );
});

test("formatBenchmark: 回 単位 (小数しきい値)", () => {
  assert.equal(
    formatBenchmark({ good: 1, caution: 0.5, unit: "回", higherIsBetter: true }),
    "良好 ≥1回 / 注意 <0.5回",
  );
});

// --- buildScale ------------------------------------------------------------
test("buildScale higherIsBetter: ゾーン順 赤→黄→緑, 目盛りは caution/good", () => {
  const m = buildScale({ good: 200, caution: 100, unit: "%", higherIsBetter: true }, 200);
  assert.deepEqual(
    m.zones.map((z) => z.tone),
    ["warning", "caution", "good"],
  );
  // scaleMax = 300 → caution100=33.3%, good200=66.6%
  assert.ok(Math.abs(m.ticks[0].pct - 33.333) < 0.01);
  assert.ok(Math.abs(m.ticks[1].pct - 66.666) < 0.01);
  assert.equal(m.ticks[0].label, "100%");
  assert.equal(m.ticks[1].label, "200%");
});

test("buildScale lowerIsBetter: ゾーン順 緑→黄→赤", () => {
  const m = buildScale({ good: 100, caution: 200, unit: "%", higherIsBetter: false }, 100);
  assert.deepEqual(
    m.zones.map((z) => z.tone),
    ["good", "caution", "warning"],
  );
});

test("buildScale: marker は 0..100 にクランプし clampedHigh を立てる", () => {
  const m = buildScale({ good: 200, caution: 100, unit: "%", higherIsBetter: true }, 999);
  assert.equal(m.marker.pct, 100);
  assert.equal(m.marker.clampedHigh, true);
  assert.equal(m.marker.clampedLow, false);
});

test("buildScale: 負値 marker は 0 にクランプし clampedLow を立てる", () => {
  const m = buildScale({ good: 100, caution: 200, unit: "%", higherIsBetter: false }, -10);
  assert.equal(m.marker.pct, 0);
  assert.equal(m.marker.clampedLow, true);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
