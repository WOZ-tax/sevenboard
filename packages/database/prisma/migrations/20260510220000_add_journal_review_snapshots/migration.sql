-- 仕訳レビュー: MF 仕訳の表示用 snapshot cache
--
-- memo タブは会計期間全体を表示するため、MF API から毎回 12 ヶ月分の
-- 仕訳を取り直すと初回表示が重い。月単位で取得済みマーカーを持ち、
-- 未取得月だけ MF から取得して journal_review_snapshots に累積保存する。

CREATE TABLE "journal_review_snapshots" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"      UUID NOT NULL,
  "org_id"         UUID NOT NULL,
  "fiscal_year"    INTEGER NOT NULL,
  "month"          INTEGER NOT NULL,
  "journal_id"     TEXT NOT NULL,
  "number"         TEXT,
  "issue_date"     TEXT,
  "description"    TEXT,
  "partner_name"   TEXT,
  "debit_summary"  JSONB NOT NULL DEFAULT '[]',
  "credit_summary" JSONB NOT NULL DEFAULT '[]',
  "total_amount"   DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "fetched_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "journal_review_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "journal_review_snapshot_months" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"   UUID NOT NULL,
  "org_id"      UUID NOT NULL,
  "fiscal_year" INTEGER NOT NULL,
  "month"       INTEGER NOT NULL,
  "fetched_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "journal_review_snapshot_months_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "journal_review_snapshots_tenant_org_journal_key"
  ON "journal_review_snapshots"("tenant_id", "org_id", "journal_id");
CREATE INDEX "journal_review_snapshots_tenant_org_period_idx"
  ON "journal_review_snapshots"("tenant_id", "org_id", "fiscal_year", "month");

CREATE UNIQUE INDEX "journal_review_snapshot_months_tenant_org_period_key"
  ON "journal_review_snapshot_months"("tenant_id", "org_id", "fiscal_year", "month");
CREATE INDEX "journal_review_snapshot_months_tenant_org_fy_idx"
  ON "journal_review_snapshot_months"("tenant_id", "org_id", "fiscal_year");

ALTER TABLE "journal_review_snapshots"
  ADD CONSTRAINT "journal_review_snapshots_org_id_tenant_id_fkey"
  FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "journal_review_snapshot_months"
  ADD CONSTRAINT "journal_review_snapshot_months_org_id_tenant_id_fkey"
  FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
