-- chosho_cell_comments を「1セル1コメント」から「スレッド (root + 返信) + 解決管理」へ拡張
-- (Phase 2 / Unit 2-3)
--
-- 旧: 1 (rowId, month) に 1 コメント (UNIQUE 制約)、anomaly_type 必須
-- 新: 同 (rowId, month) に複数 root コメント可能、各 root に返信可能、解決状態を持つ
--
-- 既存データ: Phase 1 では本番運用前のため、データは少数 or 0 件想定。
-- 既存行はそのまま root (parent_comment_id NULL) として扱う。

-- 1. 新カラム追加
ALTER TABLE "chosho_cell_comments"
  ADD COLUMN "parent_comment_id" UUID,
  ADD COLUMN "resolved_at" TIMESTAMP(3),
  ADD COLUMN "resolved_by_id" UUID;

-- 2. UNIQUE(row_id, month) を削除 (複数 root を許す)
DROP INDEX IF EXISTS "chosho_cell_comments_row_id_month_key";

-- 3. 親コメント FK (返信は親の削除でカスケード)
ALTER TABLE "chosho_cell_comments"
  ADD CONSTRAINT "chosho_cell_comments_parent_comment_id_fkey"
  FOREIGN KEY ("parent_comment_id") REFERENCES "chosho_cell_comments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chosho_cell_comments"
  ADD CONSTRAINT "chosho_cell_comments_resolved_by_id_fkey"
  FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. lookup index (memo タブで rowId+month 軸に検索する用)
CREATE INDEX "chosho_cell_comments_row_id_month_idx"
  ON "chosho_cell_comments"("row_id", "month");
CREATE INDEX "chosho_cell_comments_parent_idx"
  ON "chosho_cell_comments"("parent_comment_id");
