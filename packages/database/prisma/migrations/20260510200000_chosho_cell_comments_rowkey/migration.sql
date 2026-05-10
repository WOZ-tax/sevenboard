-- Phase: preview/saved モード概念の撤去 — セルコメントを (org, fy, month, row_key) 紐付けに移行
--
-- 既存設計:
--   chosho_cell_comments.row_id (FK → chosho_rows.id) で saved version の特定 row に紐付き
--   → version をまたぐと孤立。 preview モードからはコメント不可。
--
-- 新設計:
--   row_key TEXT + fiscal_year INT + month INT を追加し、 (org, fy, month, row_key) で識別。
--   preview / saved 両方で同じ rowKey を共有するため、コメントが version 横断で見える。
--
-- 互換性:
--   row_id を nullable にしつつ既存データは保持。 saved 経由の旧コメントも引き続き list/delete 可能。
--   row_key + fiscal_year は best-effort で既存行に埋める (chosho_rows + chosho_versions JOIN)。
--   既存 row_key が埋まらないケースは NULL で残し、新 API では対象外になる (旧 saved API なら引ける)。

-- 1) カラム追加 (NULL 許容で開始)
ALTER TABLE "chosho_cell_comments"
  ADD COLUMN "fiscal_year" INTEGER,
  ADD COLUMN "row_key" TEXT;

-- 2) 既存データ best-effort 埋め (saved version 経由のコメントを新キーに移行)
--    row_key の合成は preview builder の makeRowKey と同じロジックを SQL で再現するのが理想だが、
--    階層的 path が必要で複雑なので、 簡易合成 (account_code:subaccount:partner:account_name) で代替。
--    この値は新 API では使わず、 旧 API (DELETE /chosho/cell-comments/:id) だけ動けば良い。
UPDATE "chosho_cell_comments" cc
SET
  "fiscal_year" = cv."fiscal_year",
  "row_key" = COALESCE(cr."account_code", '') || ':'
            || COALESCE(cr."subaccount_name", '') || ':'
            || COALESCE(cr."partner_name", '') || ':'
            || COALESCE(cr."account_name", '')
FROM "chosho_rows" cr
JOIN "chosho_versions" cv ON cv."id" = cr."version_id"
WHERE cc."row_id" = cr."id";

-- 3) row_id を nullable に (新規 preview コメントは row_id NULL で書く)
ALTER TABLE "chosho_cell_comments"
  ALTER COLUMN "row_id" DROP NOT NULL;

-- 4) INDEX 追加 (新 API の主検索パス)
CREATE INDEX "chosho_cell_comments_org_fy_month_rowkey_idx"
  ON "chosho_cell_comments" ("tenant_id", "org_id", "fiscal_year", "month", "row_key");
