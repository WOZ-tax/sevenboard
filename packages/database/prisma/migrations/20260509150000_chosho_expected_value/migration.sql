-- 期待残高ルールを 0 固定から任意の数値に一般化。
--
-- 旧: ZERO ("0が正") のみ
-- 新: EXPECTED_VALUE + expected_value (numeric, NULL 許容) で 0 / 300万 / 55,000 等任意の値を扱える
--
-- 移行:
--   - 既存 ZERO 値の行は EXPECTED_VALUE にリネーム + expected_value=0 backfill
--     (Phase 1 で UI から ZERO を付ける経路がなく実データ 0 件想定だが念のため)
--   - PG10+ の ALTER TYPE RENAME VALUE は transaction 内で実行可能なので 1 migration に収まる
--
-- ChoshoAnomalyType も同様に ZERO_VIOLATION → EXPECTED_VALUE_VIOLATION にリネーム。

-- 1. expected_value カラムを先に追加 (NULL 許容、後で ZERO 行に 0 を backfill する用)
ALTER TABLE "chosho_rows"
  ADD COLUMN "expected_value" NUMERIC;

-- 2. 既存 ZERO 行に expected_value=0 を backfill
UPDATE "chosho_rows"
  SET "expected_value" = 0
  WHERE "expected_rule" = 'ZERO';

-- 3. enum リネーム (ZERO → EXPECTED_VALUE)
ALTER TYPE "ChoshoExpectedRule" RENAME VALUE 'ZERO' TO 'EXPECTED_VALUE';

-- 4. cell anomaly_type も対応するリネーム (ZERO_VIOLATION → EXPECTED_VALUE_VIOLATION)
ALTER TYPE "ChoshoAnomalyType" RENAME VALUE 'ZERO_VIOLATION' TO 'EXPECTED_VALUE_VIOLATION';
