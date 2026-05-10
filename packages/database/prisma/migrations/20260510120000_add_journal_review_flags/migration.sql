-- 仕訳レビュー: 「要確認」フラグ (Phase 2 / Unit 2-1)
--
-- 動作:
--   - 仕訳行クリックで toggle: 既存なし → INSERT (未解決状態で flagged_at セット)
--                              既存あり → resolved_at を toggle
--   - 未解決 (resolved_at IS NULL) なら UI で赤ハイライト
--   - 同 (org, journal_id) で 1 件 (UNIQUE 制約)

CREATE TABLE "journal_review_flags" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"      UUID NOT NULL,
  "org_id"         UUID NOT NULL,
  "fiscal_year"    INTEGER NOT NULL,
  "month"          INTEGER NOT NULL,
  -- MF 仕訳の id (UUID 形式の場合もあるが TEXT で受ける、API レスポンスをそのまま保存)
  "journal_id"     TEXT NOT NULL,
  "flagged_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "flagged_by_id"  UUID,
  "resolved_at"    TIMESTAMP(3),
  "resolved_by_id" UUID,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "journal_review_flags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "journal_review_flags_tenant_org_journal_key"
  ON "journal_review_flags"("tenant_id", "org_id", "journal_id");
CREATE INDEX "journal_review_flags_tenant_org_period_idx"
  ON "journal_review_flags"("tenant_id", "org_id", "fiscal_year", "month");
CREATE INDEX "journal_review_flags_unresolved_idx"
  ON "journal_review_flags"("tenant_id", "org_id")
  WHERE "resolved_at" IS NULL;

ALTER TABLE "journal_review_flags"
  ADD CONSTRAINT "journal_review_flags_org_id_tenant_id_fkey"
  FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "journal_review_flags"
  ADD CONSTRAINT "journal_review_flags_flagged_by_id_fkey"
  FOREIGN KEY ("flagged_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "journal_review_flags"
  ADD CONSTRAINT "journal_review_flags_resolved_by_id_fkey"
  FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
