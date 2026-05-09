-- 残高調書 (Chosho) — 月次/決算レビュー用の月末残高一覧 + コメント機構。
--
-- 設計:
-- - chosho_versions  : 調書スナップショット (draft/approved/archived)。1組織×1会計年度内で
--                      selected_month (この調書がカバーする最新月) ごとに draft を持てる。
--                      approved は同(fy, month)で 1 件のみ。
-- - chosho_rows      : 調書の行。3階層 (勘定 → 補助 → 取引先) を level で表現。
--                      monthly_balances は {"4": 12345, ...} の jsonb で 1 行に 12 ヶ月格納。
-- - chosho_row_comments  : 行右端コメントボタン用。1行に複数コメント (1:N)。
-- - chosho_cell_comments : 赤セル (異常検知された月セル) クリックでのコメント。1セル1コメント。
--
-- マルチテナント: 既存パターンに合わせて (org_id, tenant_id) 複合 FK で organizations を参照。

CREATE TYPE "ChoshoStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');
CREATE TYPE "ChoshoExpectedRule" AS ENUM ('NONE', 'ZERO', 'AGING_3M');
CREATE TYPE "ChoshoAnomalyType" AS ENUM ('ZERO_VIOLATION', 'AGING_3M');

-- ============================================================
-- chosho_versions
-- ============================================================
CREATE TABLE "chosho_versions" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"      UUID NOT NULL,
  "org_id"         UUID NOT NULL,
  "fiscal_year"    INTEGER NOT NULL,
  -- この調書がカバーする「最新月」。1-12 のカレンダー月。
  -- 月次調書: 例 7 (= 7月度までを反映)。決算調書: 期末月。
  "selected_month" INTEGER NOT NULL,
  "status"         "ChoshoStatus" NOT NULL DEFAULT 'DRAFT',
  "title"          TEXT,
  "created_by_id"  UUID,
  "approved_by_id" UUID,
  "approved_at"    TIMESTAMP(3),
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "chosho_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chosho_versions_tenant_id_org_id_fiscal_year_idx"
  ON "chosho_versions"("tenant_id", "org_id", "fiscal_year");
CREATE INDEX "chosho_versions_tenant_id_org_id_status_idx"
  ON "chosho_versions"("tenant_id", "org_id", "status");

-- 子テーブル (ChoshoRow) からの複合 FK ターゲット。tenantId/orgId 整合を DB で保証する。
CREATE UNIQUE INDEX "chosho_versions_id_tenant_id_org_id_key"
  ON "chosho_versions"("id", "tenant_id", "org_id");

-- approved は (org, fy, month) で 1 件のみ。draft は複数許容。
CREATE UNIQUE INDEX "chosho_versions_one_approved_per_period"
  ON "chosho_versions"("tenant_id", "org_id", "fiscal_year", "selected_month")
  WHERE "status" = 'APPROVED';

ALTER TABLE "chosho_versions"
  ADD CONSTRAINT "chosho_versions_org_id_tenant_id_fkey"
  FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chosho_versions"
  ADD CONSTRAINT "chosho_versions_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "chosho_versions"
  ADD CONSTRAINT "chosho_versions_approved_by_id_fkey"
  FOREIGN KEY ("approved_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- chosho_rows
-- ============================================================
CREATE TABLE "chosho_rows" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "version_id"          UUID NOT NULL,
  "tenant_id"           UUID NOT NULL,
  "org_id"              UUID NOT NULL,
  -- 階層レベル: 0=大区分(資産の部 等) / 1=勘定 / 2=補助 / 3=取引先
  "level"               INTEGER NOT NULL,
  "display_order"       INTEGER NOT NULL DEFAULT 0,
  -- 親行 (上位 level) への ID 参照。最上位の大区分は NULL。
  "parent_row_id"       UUID,
  "account_code"        TEXT,
  "account_name"        TEXT NOT NULL,
  "subaccount_name"     TEXT,
  "partner_name"        TEXT,
  -- 月別残高: {"4": 12345.0, "5": 23456.0, ...}。MF 推移表 API の current 値。
  "monthly_balances"    JSONB NOT NULL DEFAULT '{}',
  -- 期待残高ルール: NONE=チェックなし / ZERO=0が正 / AGING_3M=3ヶ月以上滞留検知
  "expected_rule"       "ChoshoExpectedRule" NOT NULL DEFAULT 'NONE',
  "aging_check_enabled" BOOLEAN NOT NULL DEFAULT false,
  "evidence_text"       TEXT,
  "notes"               TEXT,
  -- 行単位の確認済フラグ (顧問が手動で✓)
  "confirmed"           BOOLEAN NOT NULL DEFAULT false,
  "confirmed_by_id"     UUID,
  "confirmed_at"        TIMESTAMP(3),
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "chosho_rows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chosho_rows_version_id_display_order_idx"
  ON "chosho_rows"("version_id", "display_order");
CREATE INDEX "chosho_rows_tenant_id_org_id_idx"
  ON "chosho_rows"("tenant_id", "org_id");
CREATE INDEX "chosho_rows_parent_row_id_idx"
  ON "chosho_rows"("parent_row_id");

-- 自己参照 (parent) からの 4 列複合 FK ターゲット。同一版内に親子関係を制限。
CREATE UNIQUE INDEX "chosho_rows_id_version_id_tenant_id_org_id_key"
  ON "chosho_rows"("id", "version_id", "tenant_id", "org_id");
-- 子テーブル (chosho_row_comments / chosho_cell_comments) からの 3 列複合 FK ターゲット。
CREATE UNIQUE INDEX "chosho_rows_id_tenant_id_org_id_key"
  ON "chosho_rows"("id", "tenant_id", "org_id");

-- 同一 (versionId, tenantId, orgId) でないと FK が成立しない複合参照。
ALTER TABLE "chosho_rows"
  ADD CONSTRAINT "chosho_rows_version_id_tenant_id_org_id_fkey"
  FOREIGN KEY ("version_id", "tenant_id", "org_id")
  REFERENCES "chosho_versions"("id", "tenant_id", "org_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chosho_rows"
  ADD CONSTRAINT "chosho_rows_org_id_tenant_id_fkey"
  FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 親行も同一 (versionId, tenantId, orgId) 内に制限。階層は同一スナップショット内のみ成立。
ALTER TABLE "chosho_rows"
  ADD CONSTRAINT "chosho_rows_parent_row_id_version_id_tenant_id_org_id_fkey"
  FOREIGN KEY ("parent_row_id", "version_id", "tenant_id", "org_id")
  REFERENCES "chosho_rows"("id", "version_id", "tenant_id", "org_id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "chosho_rows"
  ADD CONSTRAINT "chosho_rows_confirmed_by_id_fkey"
  FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- chosho_row_comments  (行右端コメントボタン: 1:N)
-- ============================================================
CREATE TABLE "chosho_row_comments" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "row_id"      UUID NOT NULL,
  "tenant_id"   UUID NOT NULL,
  "org_id"      UUID NOT NULL,
  "body"        TEXT NOT NULL,
  "urls"        JSONB NOT NULL DEFAULT '[]',
  "author_id"   UUID,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "chosho_row_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chosho_row_comments_row_id_created_at_idx"
  ON "chosho_row_comments"("row_id", "created_at");
CREATE INDEX "chosho_row_comments_tenant_id_org_id_idx"
  ON "chosho_row_comments"("tenant_id", "org_id");

-- 同一 (rowId, tenantId, orgId) でないと FK が成立しない複合参照。
ALTER TABLE "chosho_row_comments"
  ADD CONSTRAINT "chosho_row_comments_row_id_tenant_id_org_id_fkey"
  FOREIGN KEY ("row_id", "tenant_id", "org_id")
  REFERENCES "chosho_rows"("id", "tenant_id", "org_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chosho_row_comments"
  ADD CONSTRAINT "chosho_row_comments_org_id_tenant_id_fkey"
  FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chosho_row_comments"
  ADD CONSTRAINT "chosho_row_comments_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- chosho_cell_comments  (赤セルクリックコメント: 1セル1コメント)
-- ============================================================
CREATE TABLE "chosho_cell_comments" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "row_id"       UUID NOT NULL,
  "tenant_id"    UUID NOT NULL,
  "org_id"       UUID NOT NULL,
  -- 1-12 のカレンダー月。どのセルへのコメントか。
  "month"        INTEGER NOT NULL,
  "body"         TEXT NOT NULL,
  "urls"         JSONB NOT NULL DEFAULT '[]',
  "anomaly_type" "ChoshoAnomalyType" NOT NULL,
  "author_id"    UUID,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "chosho_cell_comments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chosho_cell_comments_row_id_month_key"
  ON "chosho_cell_comments"("row_id", "month");
CREATE INDEX "chosho_cell_comments_tenant_id_org_id_idx"
  ON "chosho_cell_comments"("tenant_id", "org_id");

-- 同一 (rowId, tenantId, orgId) でないと FK が成立しない複合参照。
ALTER TABLE "chosho_cell_comments"
  ADD CONSTRAINT "chosho_cell_comments_row_id_tenant_id_org_id_fkey"
  FOREIGN KEY ("row_id", "tenant_id", "org_id")
  REFERENCES "chosho_rows"("id", "tenant_id", "org_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chosho_cell_comments"
  ADD CONSTRAINT "chosho_cell_comments_org_id_tenant_id_fkey"
  FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chosho_cell_comments"
  ADD CONSTRAINT "chosho_cell_comments_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
