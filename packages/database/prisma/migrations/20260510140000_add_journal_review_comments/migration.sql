-- 仕訳レビュー: コメント + 返信ツリー (Phase 2 / Unit 2-2)
--
-- 構造:
--   - 1 仕訳に複数のコメントスレッド (root) を持てる
--   - 各 root に対して返信 (parent_comment_id != NULL) をぶら下げられる
--   - 解決状態は journal_review_flags 側で管理 (1 仕訳 1 フラグ)
--
-- journal_id は MF v3 の id (UUID 文字列) をそのまま受ける。FK なし
-- (MF 側のデータが正本のため、SevenBoard 側で参照整合制約は持たない)。

CREATE TABLE "journal_review_comments" (
  "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"          UUID NOT NULL,
  "org_id"             UUID NOT NULL,
  "journal_id"         TEXT NOT NULL,
  -- NULL = root コメント、UUID = 返信 (root へのスレッド)
  "parent_comment_id"  UUID,
  "body"               TEXT NOT NULL,
  -- 添付 URL の配列 (string[])
  "urls"               JSONB NOT NULL DEFAULT '[]',
  "author_id"          UUID,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "journal_review_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "journal_review_comments_tenant_org_journal_idx"
  ON "journal_review_comments"("tenant_id", "org_id", "journal_id", "created_at");
CREATE INDEX "journal_review_comments_parent_idx"
  ON "journal_review_comments"("parent_comment_id");

ALTER TABLE "journal_review_comments"
  ADD CONSTRAINT "journal_review_comments_org_id_tenant_id_fkey"
  FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 親コメントが消されたら返信もカスケード削除
ALTER TABLE "journal_review_comments"
  ADD CONSTRAINT "journal_review_comments_parent_comment_id_fkey"
  FOREIGN KEY ("parent_comment_id") REFERENCES "journal_review_comments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "journal_review_comments"
  ADD CONSTRAINT "journal_review_comments_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
