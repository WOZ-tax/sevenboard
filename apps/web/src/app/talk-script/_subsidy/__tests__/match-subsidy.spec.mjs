/**
 * 補助金アンテナ マッチャーの境界値テスト（純関数）。
 *
 * apps/web にテスト基盤（jest/vitest）が無いため、node 実行可能な軽量スクリプトとして実装。
 * package.json は変更しない。
 *
 * 実行:
 *   node apps/web/src/app/talk-script/_subsidy/__tests__/match-subsidy.spec.mjs
 *   （Node 22+ は .ts を型ストリップして読み込める。実験的機能の警告が stderr に出るが正常。）
 *
 * 日付は new Date(year, monthIndex, day)（ローカル）で作り、TZ ずれを避ける。monthIndex は 0 始まり。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { matchSubsidies } from "../match-subsidy.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ruleset = JSON.parse(
  readFileSync(join(__dirname, "..", "subsidy-escalation-rules.json"), "utf8"),
);
const RULES = ruleset.rules;

const TODAY = new Date(2026, 6, 6); // 2026-07-06

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

/** 便利ヘルパ: 入力を組み立てる */
function input(topics, extra = {}) {
  return { topics: new Set(topics), today: TODAY, ...extra };
}
/** id で結果を引く */
function byId(results, id) {
  return results.find((r) => r.rule.id === id);
}
function ids(results) {
  return results.map((r) => r.rule.id).sort();
}

// ── S1: 省力化 ─────────────────────────────────────────────
test("S1 省力化: shoryokuka+capex+custom_dev で matched primary", () => {
  const r = matchSubsidies(RULES, input(["shoryokuka", "capex", "custom_dev"]));
  const s1 = byId(r, "S1");
  assert.ok(s1, "S1 が返る");
  assert.equal(s1.status, "matched");
  assert.equal(s1.primary, true);
  assert.ok(
    s1.rule.notes.some((n) => n.includes("オーダーメイド")),
    "notes に議事録注意が含まれる",
  );
});

test("S1: custom_dev 欠落で S1 は返らない", () => {
  const r = matchSubsidies(RULES, input(["shoryokuka", "capex"]));
  assert.equal(byId(r, "S1"), undefined);
});

// ── S5/S6: 大型投資 金額境界 ───────────────────────────────
test("S5 境界: 投資額1億・年商10億 → S5 のみ matched primary", () => {
  const r = matchSubsidies(
    RULES,
    input(["large_investment"], { investmentOku: 1, revenueOku: 10 }),
  );
  const s5 = byId(r, "S5");
  assert.ok(s5 && s5.status === "matched" && s5.primary);
  assert.equal(byId(r, "S6"), undefined, "S6 は不成立");
});

test("年商100億は < 100 なので S5 不成立（投資1億）", () => {
  const r = matchSubsidies(
    RULES,
    input(["large_investment"], { investmentOku: 1, revenueOku: 100 }),
  );
  assert.equal(byId(r, "S5"), undefined);
  assert.equal(byId(r, "S6"), undefined);
});

test("S5+S6 同時: 投資15億・年商10億 → S6 primary、S5 は代替", () => {
  const r = matchSubsidies(
    RULES,
    input(["large_investment"], { investmentOku: 15, revenueOku: 10 }),
  );
  const s5 = byId(r, "S5");
  const s6 = byId(r, "S6");
  assert.ok(s5 && s5.status === "matched", "S5 成立");
  assert.ok(s6 && s6.status === "matched", "S6 成立");
  assert.equal(s6.primary, true, "S6 が primary");
  assert.equal(s5.primary, false, "S5 は代替に降格");
});

test("S6 clause2 境界: 投資20億・年商50億 → S6 primary", () => {
  const r = matchSubsidies(
    RULES,
    input(["large_investment"], { investmentOku: 20, revenueOku: 50 }),
  );
  const s6 = byId(r, "S6");
  assert.ok(s6 && s6.status === "matched" && s6.primary);
});

test("投資20億・年商100億 → S6 のみ（S5 は年商<100で落ちる）", () => {
  const r = matchSubsidies(
    RULES,
    input(["large_investment"], { investmentOku: 20, revenueOku: 100 }),
  );
  assert.equal(byId(r, "S5"), undefined);
  const s6 = byId(r, "S6");
  assert.ok(s6 && s6.status === "matched" && s6.primary);
});

test("大型投資チェックのみ・金額未入力 → S5/S6 は pending で返す", () => {
  const r = matchSubsidies(RULES, input(["large_investment"]));
  const s5 = byId(r, "S5");
  const s6 = byId(r, "S6");
  assert.ok(s5 && s5.status === "pending" && !s5.primary);
  assert.ok(s6 && s6.status === "pending" && !s6.primary);
  assert.ok(s5.warnings.length > 0, "pending は入力誘導 warning を持つ");
});

// ── S7: 小規模持続化 従業員/業種境界 ──────────────────────
test("S7 商業・サービス業 従業員5人 → matched", () => {
  const r = matchSubsidies(
    RULES,
    input(["sales_expansion"], {
      industryClass: "commerce_service",
      employees: 5,
    }),
  );
  const s7 = byId(r, "S7");
  assert.ok(s7 && s7.status === "matched" && s7.primary);
});

test("S7 商業・サービス業 従業員6人 → 不成立", () => {
  const r = matchSubsidies(
    RULES,
    input(["sales_expansion"], {
      industryClass: "commerce_service",
      employees: 6,
    }),
  );
  assert.equal(byId(r, "S7"), undefined);
});

test("S7 その他 従業員20人 → matched / 21人 → 不成立", () => {
  const ok = matchSubsidies(
    RULES,
    input(["sales_expansion"], { industryClass: "other", employees: 20 }),
  );
  assert.ok(byId(ok, "S7"), "20人は成立");
  const ng = matchSubsidies(
    RULES,
    input(["sales_expansion"], { industryClass: "other", employees: 21 }),
  );
  assert.equal(byId(ng, "S7"), undefined, "21人は不成立");
});

test("S7 は独立（他 primary と併存）: 販路開拓のみで従業員未入力なら pending", () => {
  const r = matchSubsidies(RULES, input(["sales_expansion"]));
  const s7 = byId(r, "S7");
  assert.ok(s7 && s7.status === "pending");
});

// ── validity 境界: S4 / S4-legacy ─────────────────────────
test("2026-07-06: S4 は公募開始待ち(pendingStart)、S4-legacy は期限切れで非表示", () => {
  const r = matchSubsidies(
    RULES,
    input(["capex", "new_business", "sales_expansion"], {
      industryClass: "other",
      employees: 30,
    }),
  );
  const s4 = byId(r, "S4");
  assert.ok(s4 && s4.status === "pendingStart", "S4 は公募開始待ち");
  assert.equal(s4.primary, false, "pendingStart は primary にしない");
  assert.equal(byId(r, "S4-legacy"), undefined, "S4-legacy は期限切れ非表示");
});

test("validity 境界 2026-06-19: S4-legacy は当日ならまだ有効(matched)", () => {
  const r = matchSubsidies(RULES, {
    topics: new Set(["capex", "new_business", "sales_expansion"]),
    today: new Date(2026, 5, 19), // 2026-06-19
  });
  const legacy = byId(r, "S4-legacy");
  assert.ok(legacy && legacy.status === "matched", "当日は有効");
});

test("validity 境界 2026-08-01: S4 は当日から開場(matched)、S4-legacy は期限切れ", () => {
  const r = matchSubsidies(RULES, {
    topics: new Set(["capex", "new_business", "sales_expansion"]),
    today: new Date(2026, 7, 1), // 2026-08-01
  });
  const s4 = byId(r, "S4");
  assert.ok(s4 && s4.status === "matched", "8/1 から開場");
  assert.equal(byId(r, "S4-legacy"), undefined);
});

// ── S3 降格 ────────────────────────────────────────────────
test("S2+S3 同時: S2 primary、S3 は代替へ降格", () => {
  const r = matchSubsidies(
    RULES,
    input(["capex", "global", "sales_expansion"]),
  );
  const s2 = byId(r, "S2");
  const s3 = byId(r, "S3");
  assert.ok(s2 && s2.status === "matched" && s2.primary, "S2 primary");
  assert.ok(s3 && s3.status === "matched", "S3 は返る");
  assert.equal(s3.primary, false, "S3 は代替に降格");
});

test("S3 単独（capex+sales のみ）: S2/S4 無しなら S3 が primary", () => {
  const r = matchSubsidies(RULES, input(["capex", "sales_expansion"]));
  const s3 = byId(r, "S3");
  assert.ok(s3 && s3.status === "matched" && s3.primary);
  assert.equal(byId(r, "S2"), undefined);
});

test("S3 降格: S4 が公募開始待ちでも降格する", () => {
  const r = matchSubsidies(
    RULES,
    input(["capex", "new_business", "sales_expansion"], {
      industryClass: "other",
      employees: 30,
    }),
  );
  const s3 = byId(r, "S3");
  assert.ok(s3, "S3 は返る（capex+sales 成立）");
  assert.equal(s3.primary, false, "S4 pendingStart により S3 降格");
});

// ── missing（不足フィールド情報） ────────────────────────
test("missing: 大型投資チェックのみ → S5/S6 の missing に投資額・年商", () => {
  const r = matchSubsidies(RULES, input(["large_investment"]));
  const s5 = byId(r, "S5");
  assert.deepEqual(
    [...s5.missing].sort(),
    ["investmentOku", "revenueOku"].sort(),
  );
});

test("missing: 年商だけ入力済 → S5 の missing は投資額のみ", () => {
  const r = matchSubsidies(
    RULES,
    input(["large_investment"], { revenueOku: 10 }),
  );
  const s5 = byId(r, "S5");
  assert.ok(s5 && s5.status === "pending");
  assert.deepEqual(s5.missing, ["investmentOku"]);
});

test("missing: 販路開拓のみ → S7 の missing は従業員数（業種は既定入力あり）", () => {
  const r = matchSubsidies(
    RULES,
    input(["sales_expansion"], { industryClass: "commerce_service" }),
  );
  const s7 = byId(r, "S7");
  assert.ok(s7 && s7.status === "pending");
  assert.deepEqual(s7.missing, ["employees"]);
});

test("missing: matched の結果は missing 空配列", () => {
  const r = matchSubsidies(
    RULES,
    input(["sales_expansion"], {
      industryClass: "commerce_service",
      employees: 5,
    }),
  );
  const s7 = byId(r, "S7");
  assert.ok(s7 && s7.status === "matched");
  assert.deepEqual(s7.missing, []);
});

// ── トピック未選択 ────────────────────────────────────────
test("トピック未選択 → 何も返らない", () => {
  const r = matchSubsidies(RULES, input([]));
  assert.deepEqual(ids(r), []);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
