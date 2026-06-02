-- 部門なし行 (department_id IS NULL) の重複を根本的に防止する (#3 / #4 根本対応)
--
-- 背景:
--   actual_entries / budget_entries には複合 UNIQUE INDEX
--   (actual_entry_with_dept / budget_entry_with_dept) が張られているが、
--   department_id を含むため PostgreSQL の NULL DISTINCT 仕様により
--   「部門なし行 (department_id IS NULL)」同士の重複を一切防げていない。
--   これが二重計上バグの根本原因。
--
-- 方式: partial unique index 方式 (センチネルUUIDは不採用)
--   department_id は ON DELETE SET NULL / ON UPDATE CASCADE 付きの実FKであり、
--   センチネルUUID方式は (1) 参照先 Department のseedが必須でマルチテナントで重い、
--   (2) 実部門削除時の SET NULL でセンチネル前提が破れる、という二重の危険がある。
--   そのため department_id は nullable のまま据え置き、
--   「department_id IS NULL の行」だけを対象にした partial unique index を追加する。
--   既存の複合 UNIQUE INDEX は NOT NULL 部門の重複防止として有効なので DROP しない (最小差分)。
--
-- 実行順序 (厳守):
--   手順1: 既存の重複行を集約・削除 (代表1行を残す)
--   手順2: partial unique index を作成 (重複が残っていると CREATE UNIQUE INDEX が失敗するため必ず手順1の後)
--
-- 金額の扱い:
--   同一キー (同一テナント/組織/科目/部門/月) の重複行は本来1値であるべきで、
--   重複は二重計上を意味する。合算すると二重計上を固定化してしまうため合算しない。
--   代表行 = 最新 updated_at (同値なら id 最小) を残し、それ以外を削除する (amount は代表行の値をそのまま採用)。
--   本 migration では金額の再計算 (消費税・端数等) は一切発生しない。
--   万一再計算が必要になった場合も切り捨て (floor) のみとし四捨五入は禁止 (国内会計実務)。

-- ============================================================
-- 手順1: 既存の重複行を集約・削除
-- ============================================================

-- 1-a. actual_entries の「部門なし行 (department_id IS NULL)」の重複を削除
--      グループキー = (tenant_id, org_id, account_id, month)
--      代表行 (最新 updated_at, 同値は id 最小) 以外を削除する。
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "tenant_id", "org_id", "account_id", "month"
      ORDER BY "updated_at" DESC NULLS LAST, "id" ASC
    ) AS rn
  FROM "actual_entries"
  WHERE "department_id" IS NULL
)
DELETE FROM "actual_entries" a
USING ranked r
WHERE a."id" = r."id" AND r.rn > 1;

-- 1-b. actual_entries の「部門あり行 (department_id IS NOT NULL)」の重複を削除
--      グループキー = (tenant_id, org_id, account_id, department_id, month)
--      既存 actual_entry_with_dept が NULL DISTINCT の影響を受けず本来防げているはずだが、
--      過去に index 不在期間があった場合の残存重複を念のため集約しておく
--      (重複が残っていると後続の partial unique index 作成が失敗するため)。
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "tenant_id", "org_id", "account_id", "department_id", "month"
      ORDER BY "updated_at" DESC NULLS LAST, "id" ASC
    ) AS rn
  FROM "actual_entries"
  WHERE "department_id" IS NOT NULL
)
DELETE FROM "actual_entries" a
USING ranked r
WHERE a."id" = r."id" AND r.rn > 1;

-- 1-c. budget_entries の「部門なし行 (department_id IS NULL)」の重複を削除
--      グループキー = (budget_version_id, account_id, month)
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "budget_version_id", "account_id", "month"
      ORDER BY "updated_at" DESC NULLS LAST, "id" ASC
    ) AS rn
  FROM "budget_entries"
  WHERE "department_id" IS NULL
)
DELETE FROM "budget_entries" b
USING ranked r
WHERE b."id" = r."id" AND r.rn > 1;

-- 1-d. budget_entries の「部門あり行 (department_id IS NOT NULL)」の重複を削除
--      グループキー = (budget_version_id, account_id, department_id, month)
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "budget_version_id", "account_id", "department_id", "month"
      ORDER BY "updated_at" DESC NULLS LAST, "id" ASC
    ) AS rn
  FROM "budget_entries"
  WHERE "department_id" IS NOT NULL
)
DELETE FROM "budget_entries" b
USING ranked r
WHERE b."id" = r."id" AND r.rn > 1;

-- ============================================================
-- 手順2: partial unique index を作成 (本件の核心)
-- ============================================================

-- 2-a. actual_entries: 部門なし行の重複を塞ぐ
--      既存 actual_entry_with_dept が NULL DISTINCT で漏らしていたケースを補完する。
CREATE UNIQUE INDEX IF NOT EXISTS "actual_entry_no_dept_uniq"
  ON "actual_entries" ("tenant_id", "org_id", "account_id", "month")
  WHERE "department_id" IS NULL;

-- 2-b. budget_entries: 部門なし行の重複を塞ぐ
CREATE UNIQUE INDEX IF NOT EXISTS "budget_entry_no_dept_uniq"
  ON "budget_entries" ("budget_version_id", "account_id", "month")
  WHERE "department_id" IS NULL;
