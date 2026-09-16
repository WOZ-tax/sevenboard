import assert from "node:assert/strict";
import { test } from "node:test";
import {
  retryKintoneProgress,
  kintoneProgressKey,
} from "./kintone-progress-query.ts";

test("authorization and input errors are never automatically retried", () => {
  for (const statusCode of [400, 401, 403, 404, 422]) {
    assert.equal(retryKintoneProgress(0, { statusCode }), false);
  }
});

test("temporary server/network failures get at most one retry", () => {
  for (const error of [
    new Error("network"),
    { statusCode: 408 },
    { statusCode: 429 },
    { statusCode: 503 },
  ]) {
    assert.equal(retryKintoneProgress(0, error), true);
    assert.equal(retryKintoneProgress(1, error), false);
    assert.equal(retryKintoneProgress(4, error), false);
  }
});

test("cache keys are shared for one company/year and isolated across companies and years", () => {
  assert.deepEqual(kintoneProgressKey("a", 2026), [
    "kintone",
    "progress",
    "a",
    2026,
  ]);
  assert.notDeepEqual(
    kintoneProgressKey("a", 2026),
    kintoneProgressKey("b", 2026),
  );
  assert.notDeepEqual(
    kintoneProgressKey("a", 2026),
    kintoneProgressKey("a", 2025),
  );
});
