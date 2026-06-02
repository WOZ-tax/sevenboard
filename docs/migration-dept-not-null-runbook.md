# department_id 重複根本対応 適用 Runbook (#3 / #4)

migration: `packages/database/prisma/migrations/20260602180133_department_id_dedup_root_cause/migration.sql`

## 1. 採用方式と理由

### 採用: partial unique index 方式 (部分ユニークインデックス)

`actual_entries` / `budget_entries` の「部門なし行 (`department_id IS NULL`)」だけを対象にした
部分ユニークインデックスを 2 本追加する。

- `actual_entry_no_dept_uniq` ON `actual_entries`(`tenant_id`,`org_id`,`account_id`,`month`) WHERE `department_id IS NULL`
- `budget_entry_no_dept_uniq` ON `budget_entries`(`budget_version_id`,`account_id`,`month`) WHERE `department_id IS NULL`

`department_id` は **nullable のまま据え置く**。既存の複合 UNIQUE INDEX
(`actual_entry_with_dept` / `budget_entry_with_dept`) は NOT NULL 部門の重複防止として
有効なので **DROP しない** (最小差分)。

### 根本原因

既存の複合 UNIQUE INDEX は `department_id` を含むが、PostgreSQL は NULL を distinct 扱い
(NULLS DISTINCT) するため、`department_id IS NULL` の行同士の重複を **一切防げない**。
これが二重計上バグ (#3/#4) の根本原因。

### なぜセンチネルUUID方式を採らないか

`department_id` は実FK (`... REFERENCES departments(id) ON DELETE SET NULL ON UPDATE CASCADE`) であり、
センチネルUUID方式は二重に危険:

1. センチネル値を入れるには参照先 `departments` 行 (org×tenant ごとの「部門なし」Department) を
   必ず seed する必要があり、backfill が seed より先に走れば FK 違反で migration が落ちる。
   org 数だけ seed が要り、マルチテナントで運用が重い。
2. 致命的なのは `ON DELETE SET NULL` の挙動。実部門 Department を削除すると参照行が NULL に
   戻されるため、センチネル前提で張った NOT NULL / unique が破れ、再び NULL 重複が発生しうる。
   「NULL を撲滅したい設計」と `onDelete: SetNull` が原理的に矛盾する。

RiskFinding が使う空文字センチネル (`scopeKey @default("")`) は scopeKey が FK の無い plain String
だから成立しているのであって、FK列には転用不可。

partial unique index 方式は `departmentId` を nullable のまま据え置き、FK / onDelete の挙動に
一切触れず、seed も不要。PostgreSQL がネイティブサポートする。

## 2. 適用順序

> DB への適用 (prisma migrate deploy / db push) はユーザー判断。本タスクではファイル生成のみ。

### 2-0. 事前バックアップ (必須)

```bash
# 本番 DB の論理バックアップを取得 (Railway / Cloud SQL いずれも pg_dump で可)
pg_dump "$DATABASE_URL" -Fc -f sevenboard_before_dept_dedup_$(date +%Y%m%d%H%M%S).dump
```

### 2-1. デプロイ順序 (schema/コード と migration の前後どちらでも安全)

現行の全 writer は upsert ではなく `findFirst → create/update` 方式で統一済み
(`actuals.service.ts`, `sync.service.ts`, `onboarding.service.ts`, `seed-actual-entries.ts`)。
唯一 `budgets.service.ts:158` の `budgetEntry.create` は新規分岐の blind create (dedup なし) だが、
これは既存挙動であり、index 追加で「重複時に例外が出る」方向に厳格化するだけでデータは壊れない。

したがって **schema/コードのデプロイと migration 適用は前後どちらでも破綻しない**:

- index を先にデプロイ → アプリは upsert に依存していないので壊れない。
- アプリを先にデプロイ → index が無いだけで現状維持。

アプリコード (writer) の変更は **不要** (partial index 方式)。

### 2-2. migration 適用

```bash
# packages/database で実行
npx prisma migrate deploy
```

migration 内部の実行順序 (SQL内で固定済み):

1. 手順1: 既存重複行の集約・削除 (代表1行を残す)
2. 手順2: partial unique index 作成

重複が残った状態で `CREATE UNIQUE INDEX` すると失敗するため、必ずこの順。SQL内で順序固定済み。

### 2-3. 適用後の検証クエリ

```sql
-- (1) part. unique index が 2 本作成されたか
SELECT indexname FROM pg_indexes
WHERE indexname IN ('actual_entry_no_dept_uniq', 'budget_entry_no_dept_uniq');
-- → 2 行返ればOK

-- (2) 部門なし行の重複が 0 件か (actual_entries)
SELECT tenant_id, org_id, account_id, month, COUNT(*)
FROM actual_entries WHERE department_id IS NULL
GROUP BY tenant_id, org_id, account_id, month HAVING COUNT(*) > 1;
-- → 0 行ならOK

-- (3) 部門なし行の重複が 0 件か (budget_entries)
SELECT budget_version_id, account_id, month, COUNT(*)
FROM budget_entries WHERE department_id IS NULL
GROUP BY budget_version_id, account_id, month HAVING COUNT(*) > 1;
-- → 0 行ならOK
```

## 3. 適用前に確認すべき既存重複の調査SQL

migration の手順1 (削除) でどれだけの行が消えるかを **事前に**確認する。
削除されるのは「代表1行を除いた重複分」のみ。

```sql
-- actual_entries 部門なし重複グループ数と削除予定行数
SELECT
  COUNT(*) AS dup_groups,
  COALESCE(SUM(cnt - 1), 0) AS rows_to_delete
FROM (
  SELECT COUNT(*) AS cnt
  FROM actual_entries WHERE department_id IS NULL
  GROUP BY tenant_id, org_id, account_id, month HAVING COUNT(*) > 1
) t;

-- actual_entries 部門あり重複 (念のため)
SELECT COUNT(*) AS dup_groups, COALESCE(SUM(cnt - 1), 0) AS rows_to_delete
FROM (
  SELECT COUNT(*) AS cnt
  FROM actual_entries WHERE department_id IS NOT NULL
  GROUP BY tenant_id, org_id, account_id, department_id, month HAVING COUNT(*) > 1
) t;

-- budget_entries 部門なし重複
SELECT COUNT(*) AS dup_groups, COALESCE(SUM(cnt - 1), 0) AS rows_to_delete
FROM (
  SELECT COUNT(*) AS cnt
  FROM budget_entries WHERE department_id IS NULL
  GROUP BY budget_version_id, account_id, month HAVING COUNT(*) > 1
) t;

-- budget_entries 部門あり重複 (念のため)
SELECT COUNT(*) AS dup_groups, COALESCE(SUM(cnt - 1), 0) AS rows_to_delete
FROM (
  SELECT COUNT(*) AS cnt
  FROM budget_entries WHERE department_id IS NOT NULL
  GROUP BY budget_version_id, account_id, department_id, month HAVING COUNT(*) > 1
) t;

-- 実際にどの行が削除されるかを id 付きで事前確認したい場合 (actual NULL例)
WITH ranked AS (
  SELECT id, amount, updated_at, ROW_NUMBER() OVER (
    PARTITION BY tenant_id, org_id, account_id, month
    ORDER BY updated_at DESC NULLS LAST, id ASC) AS rn
  FROM actual_entries WHERE department_id IS NULL
)
SELECT * FROM ranked WHERE rn > 1 ORDER BY rn DESC;
```

### 金額についての注意

重複行は本来1値であるべきで、重複は二重計上を意味する。**合算しない** (合算は二重計上の固定化)。
代表行 = 最新 `updated_at` (同値なら `id` 最小) を残し、それ以外を削除する。
amount は代表行の値をそのまま採用する。本 migration で消費税・端数の再計算は発生しない。
万一再計算が必要になった場合も切り捨て (floor) のみ、四捨五入は禁止。

## 4. ロールバック手順

migration は (a) 重複行の物理削除 と (b) index 作成 の 2 つを行う。
**index は drop で戻せるが、削除した重複行は drop では戻らない** ため、2-0 のバックアップが復旧の唯一の手段。

```sql
-- index のみのロールバック (削除した行は戻らない)
DROP INDEX IF EXISTS "actual_entry_no_dept_uniq";
DROP INDEX IF EXISTS "budget_entry_no_dept_uniq";
```

削除行まで戻す必要がある場合:

```bash
# 2-0 で取得したバックアップから対象テーブルのみリストア (要メンテナンス時間)
pg_restore -d "$DATABASE_URL" --clean --table=actual_entries --table=budget_entries \
  sevenboard_before_dept_dedup_YYYYMMDDHHMMSS.dump
```

Prisma 管理上のロールバックを行う場合は `_prisma_migrations` から当該行を手動削除し、
上記 DROP INDEX を実行する (prisma に正式な down migration 機構は無いため手動)。

## 5. 想定リスク

| リスク | 内容 | 対策 |
|--------|------|------|
| 重複行の物理削除 | 二重計上の片割れを削除する。代表選定 (最新 updated_at) が意図と異なる可能性 | 3 章の調査SQLで削除対象を事前確認。2-0 でバックアップ |
| index 作成失敗 | 手順1で取りこぼした重複が残ると `CREATE UNIQUE INDEX` が失敗 | SQL内で手順1→手順2 を固定。失敗時はトランザクションごとロールバックされる |
| blind create の厳格化 | `budgets.service.ts:158` の新規 budgetEntry 作成で部門なし重複を投げると 500 になりうる | 既存挙動の厳格化であり破壊ではない。将来 `findFirst` dedup へ寄せるのは別タスク (本対応では現行維持) |
| seed の衝突 | `packages/database/prisma/seed.ts` の `budgetEntry.createMany` に重複データがあると新 index 作成後に弾かれる | seed データに同一キー重複が無いことを別途確認 |

## 6. 本対応で **変更しないもの** (意図)

- `departmentId` は nullable のまま (NOT NULL 化しない)。
- 既存複合 unique (`actual_entry_with_dept` / `budget_entry_with_dept`) は DROP しない。
- 全 writer の `findFirst → create/update` パターンは維持 (upsert へ戻さない)。
  partial index 方式では適用前後どちらでも安全であり、安全が確認できるまで簡素化しない。
- `prisma generate` / `migrate` / `db push` はこのタスクでは実行しない (ファイル生成のみ)。
