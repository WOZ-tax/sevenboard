-- 決算検討 & ロカベン 共有データの DB 化
--
-- 担当者が複数いる前提で顧問先全体で共有する必要があるもの:
--   - tax_saving_done_items: 04 節税策チェック完了状態
--   - bs_cleanup_tasks:       06 BS整理タスク
--   - year_end_schedule_item_states: 07 決算スケジュール item 状態
--   - locaben_states:         ロカベン (業種上書き + 6指標 + 非財務4シート)
--   - feature_states:         汎用 KV (上記以外のセクション)

CREATE TABLE "tax_saving_done_items" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"      UUID NOT NULL,
  "org_id"         UUID NOT NULL,
  "fiscal_year"    INTEGER NOT NULL,
  "item_id"        TEXT NOT NULL,
  "is_done"        BOOLEAN NOT NULL DEFAULT false,
  "done_at"        TIMESTAMP(3),
  "updated_by_id"  UUID,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tax_saving_done_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tax_saving_done_items_org_fy_item_key"
  ON "tax_saving_done_items"("org_id", "fiscal_year", "item_id");
CREATE INDEX "tax_saving_done_items_tenant_org_fy_idx"
  ON "tax_saving_done_items"("tenant_id", "org_id", "fiscal_year");

ALTER TABLE "tax_saving_done_items"
  ADD CONSTRAINT "tax_saving_done_items_org_tenant_fkey"
  FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_saving_done_items"
  ADD CONSTRAINT "tax_saving_done_items_updated_by_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ------------------------------------------------------------

CREATE TABLE "bs_cleanup_tasks" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"      UUID NOT NULL,
  "org_id"         UUID NOT NULL,
  "fiscal_year"    INTEGER NOT NULL,
  "template_key"   TEXT,
  "category"       TEXT NOT NULL,
  "label"          TEXT NOT NULL,
  "amount"         DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "hint"           TEXT NOT NULL DEFAULT '',
  "done"           BOOLEAN NOT NULL DEFAULT false,
  "memo"           TEXT NOT NULL DEFAULT '',
  "updated_by_id"  UUID,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bs_cleanup_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bs_cleanup_tasks_tenant_org_fy_idx"
  ON "bs_cleanup_tasks"("tenant_id", "org_id", "fiscal_year");
CREATE INDEX "bs_cleanup_tasks_org_fy_idx"
  ON "bs_cleanup_tasks"("org_id", "fiscal_year");

ALTER TABLE "bs_cleanup_tasks"
  ADD CONSTRAINT "bs_cleanup_tasks_org_tenant_fkey"
  FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bs_cleanup_tasks"
  ADD CONSTRAINT "bs_cleanup_tasks_updated_by_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ------------------------------------------------------------

CREATE TABLE "year_end_schedule_item_states" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"      UUID NOT NULL,
  "org_id"         UUID NOT NULL,
  "fiscal_year"    INTEGER NOT NULL,
  "item_id"        TEXT NOT NULL,
  "is_done"        BOOLEAN NOT NULL DEFAULT false,
  "custom_date"    TEXT,
  "updated_by_id"  UUID,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "year_end_schedule_item_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "year_end_schedule_item_states_org_fy_item_key"
  ON "year_end_schedule_item_states"("org_id", "fiscal_year", "item_id");
CREATE INDEX "year_end_schedule_item_states_tenant_org_fy_idx"
  ON "year_end_schedule_item_states"("tenant_id", "org_id", "fiscal_year");

ALTER TABLE "year_end_schedule_item_states"
  ADD CONSTRAINT "year_end_schedule_item_states_org_tenant_fkey"
  FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "year_end_schedule_item_states"
  ADD CONSTRAINT "year_end_schedule_item_states_updated_by_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ------------------------------------------------------------

CREATE TABLE "locaben_states" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"         UUID NOT NULL,
  "org_id"            UUID NOT NULL,
  "industry_override" TEXT,
  "values"            JSONB NOT NULL DEFAULT '{}',
  "non_financial"     JSONB NOT NULL DEFAULT '{}',
  "manual_keys"       JSONB NOT NULL DEFAULT '{}',
  "updated_by_id"     UUID,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "locaben_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "locaben_states_org_key" ON "locaben_states"("org_id");
CREATE UNIQUE INDEX "locaben_states_org_tenant_key"
  ON "locaben_states"("org_id", "tenant_id");
CREATE INDEX "locaben_states_tenant_org_idx"
  ON "locaben_states"("tenant_id", "org_id");

ALTER TABLE "locaben_states"
  ADD CONSTRAINT "locaben_states_org_tenant_fkey"
  FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "locaben_states"
  ADD CONSTRAINT "locaben_states_updated_by_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ------------------------------------------------------------

CREATE TABLE "feature_states" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"      UUID NOT NULL,
  "org_id"         UUID NOT NULL,
  "feature_key"    TEXT NOT NULL,
  "scope"          TEXT NOT NULL DEFAULT '',
  "value"          JSONB NOT NULL DEFAULT '{}',
  "updated_by_id"  UUID,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "feature_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feature_states_org_feature_scope_key"
  ON "feature_states"("org_id", "feature_key", "scope");
CREATE INDEX "feature_states_tenant_org_feature_idx"
  ON "feature_states"("tenant_id", "org_id", "feature_key");

ALTER TABLE "feature_states"
  ADD CONSTRAINT "feature_states_org_tenant_fkey"
  FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "feature_states"
  ADD CONSTRAINT "feature_states_updated_by_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
