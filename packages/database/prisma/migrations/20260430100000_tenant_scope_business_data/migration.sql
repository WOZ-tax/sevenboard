-- Tenant-scope business data rows.
--
-- This migration moves org-owned business tables from org_id-only ownership to
-- explicit tenant_id + org_id ownership. The route-level permission migration
-- already prevents cross-org access; this gives the database a tenant boundary
-- that query code and future RLS policies can enforce directly.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Add and backfill tenant_id for tables that already have org_id.
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "account_masters" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "fiscal_years" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "actual_entries" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "kpi_definitions" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "kpi_values" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "cash_flow_categories" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "cash_flow_entries" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "cash_flow_forecasts" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "collection_profiles" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "runway_snapshots" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "loan_simulations" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "actions" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "business_events" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "briefing_snapshots" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "monthly_review_approvals" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "monthly_closes" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;

UPDATE "departments" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "account_masters" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "fiscal_years" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "actual_entries" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "journal_entries" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "kpi_definitions" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "kpi_values" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "reports" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "cash_flow_categories" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "cash_flow_entries" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "cash_flow_forecasts" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "collection_profiles" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "runway_snapshots" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "loan_simulations" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "integrations" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "notifications" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "audit_logs" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "calendar_events" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "actions" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "business_events" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "briefing_snapshots" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "monthly_review_approvals" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;
UPDATE "monthly_closes" t SET "tenant_id" = o."tenant_id" FROM "organizations" o WHERE t."org_id" = o."id" AND t."tenant_id" IS NULL;

ALTER TABLE "departments" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "account_masters" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "fiscal_years" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "actual_entries" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "journal_entries" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "kpi_definitions" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "kpi_values" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "reports" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "cash_flow_categories" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "cash_flow_entries" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "cash_flow_forecasts" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "collection_profiles" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "runway_snapshots" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "loan_simulations" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "integrations" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "notifications" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "audit_logs" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "calendar_events" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "actions" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "business_events" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "briefing_snapshots" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "monthly_review_approvals" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "monthly_closes" ALTER COLUMN "tenant_id" SET NOT NULL;

-- Replace direct org_id FKs with composite org_id + tenant_id FKs.
ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "departments_org_id_fkey";
ALTER TABLE "account_masters" DROP CONSTRAINT IF EXISTS "account_masters_org_id_fkey";
ALTER TABLE "fiscal_years" DROP CONSTRAINT IF EXISTS "fiscal_years_org_id_fkey";
ALTER TABLE "actual_entries" DROP CONSTRAINT IF EXISTS "actual_entries_org_id_fkey";
ALTER TABLE "journal_entries" DROP CONSTRAINT IF EXISTS "journal_entries_org_id_fkey";
ALTER TABLE "kpi_definitions" DROP CONSTRAINT IF EXISTS "kpi_definitions_org_id_fkey";
ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "reports_org_id_fkey";
ALTER TABLE "cash_flow_categories" DROP CONSTRAINT IF EXISTS "cash_flow_categories_org_id_fkey";
ALTER TABLE "cash_flow_entries" DROP CONSTRAINT IF EXISTS "cash_flow_entries_org_id_fkey";
ALTER TABLE "cash_flow_forecasts" DROP CONSTRAINT IF EXISTS "cash_flow_forecasts_org_id_fkey";
ALTER TABLE "collection_profiles" DROP CONSTRAINT IF EXISTS "collection_profiles_org_id_fkey";
ALTER TABLE "runway_snapshots" DROP CONSTRAINT IF EXISTS "runway_snapshots_org_id_fkey";
ALTER TABLE "loan_simulations" DROP CONSTRAINT IF EXISTS "loan_simulations_org_id_fkey";
ALTER TABLE "integrations" DROP CONSTRAINT IF EXISTS "integrations_org_id_fkey";
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_org_id_fkey";
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_org_id_fkey";
ALTER TABLE "calendar_events" DROP CONSTRAINT IF EXISTS "calendar_events_org_id_fkey";
ALTER TABLE "actions" DROP CONSTRAINT IF EXISTS "actions_org_id_fkey";
ALTER TABLE "business_events" DROP CONSTRAINT IF EXISTS "business_events_org_id_fkey";
ALTER TABLE "briefing_snapshots" DROP CONSTRAINT IF EXISTS "briefing_snapshots_org_id_fkey";
ALTER TABLE "monthly_review_approvals" DROP CONSTRAINT IF EXISTS "monthly_review_approvals_org_id_fkey";
ALTER TABLE "monthly_closes" DROP CONSTRAINT IF EXISTS "monthly_closes_org_id_fkey";

ALTER TABLE "departments" ADD CONSTRAINT "departments_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "account_masters" ADD CONSTRAINT "account_masters_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "actual_entries" ADD CONSTRAINT "actual_entries_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_flow_categories" ADD CONSTRAINT "cash_flow_categories_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_flow_entries" ADD CONSTRAINT "cash_flow_entries_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_flow_forecasts" ADD CONSTRAINT "cash_flow_forecasts_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "collection_profiles" ADD CONSTRAINT "collection_profiles_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "runway_snapshots" ADD CONSTRAINT "runway_snapshots_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loan_simulations" ADD CONSTRAINT "loan_simulations_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "actions" ADD CONSTRAINT "actions_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_events" ADD CONSTRAINT "business_events_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "briefing_snapshots" ADD CONSTRAINT "briefing_snapshots_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "monthly_review_approvals" ADD CONSTRAINT "monthly_review_approvals_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "monthly_closes" ADD CONSTRAINT "monthly_closes_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant-aware unique constraints and indexes.
DROP INDEX IF EXISTS "account_masters_org_id_code_key";
DROP INDEX IF EXISTS "fiscal_years_org_id_year_key";
DROP INDEX IF EXISTS "actual_entry_with_dept";
DROP INDEX IF EXISTS "cash_flow_forecasts_org_id_forecast_date_granularity_scenario_type_key";
DROP INDEX IF EXISTS "collection_profiles_org_id_trade_partner_key";
DROP INDEX IF EXISTS "integrations_org_id_provider_key";
DROP INDEX IF EXISTS "monthly_review_approvals_org_id_fiscal_year_month_key";
DROP INDEX IF EXISTS "monthly_closes_org_id_fiscal_year_month_key";

CREATE UNIQUE INDEX IF NOT EXISTS "account_masters_tenant_id_org_id_code_key" ON "account_masters"("tenant_id", "org_id", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_years_tenant_id_org_id_year_key" ON "fiscal_years"("tenant_id", "org_id", "year");
CREATE UNIQUE INDEX IF NOT EXISTS "actual_entry_with_dept" ON "actual_entries"("tenant_id", "org_id", "account_id", "department_id", "month");
CREATE UNIQUE INDEX IF NOT EXISTS "cash_flow_forecasts_tenant_id_org_id_forecast_date_granularity_scenario_type_key" ON "cash_flow_forecasts"("tenant_id", "org_id", "forecast_date", "granularity", "scenario_type");
CREATE UNIQUE INDEX IF NOT EXISTS "collection_profiles_tenant_id_org_id_trade_partner_key" ON "collection_profiles"("tenant_id", "org_id", "trade_partner");
CREATE UNIQUE INDEX IF NOT EXISTS "integrations_tenant_id_org_id_provider_key" ON "integrations"("tenant_id", "org_id", "provider");
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_review_approvals_tenant_id_org_id_fiscal_year_month_key" ON "monthly_review_approvals"("tenant_id", "org_id", "fiscal_year", "month");
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_closes_tenant_id_org_id_fiscal_year_month_key" ON "monthly_closes"("tenant_id", "org_id", "fiscal_year", "month");

CREATE INDEX IF NOT EXISTS "departments_tenant_id_org_id_idx" ON "departments"("tenant_id", "org_id");
CREATE INDEX IF NOT EXISTS "account_masters_tenant_id_org_id_idx" ON "account_masters"("tenant_id", "org_id");
CREATE INDEX IF NOT EXISTS "fiscal_years_tenant_id_org_id_idx" ON "fiscal_years"("tenant_id", "org_id");
CREATE INDEX IF NOT EXISTS "actual_entries_tenant_id_org_id_month_idx" ON "actual_entries"("tenant_id", "org_id", "month");
CREATE INDEX IF NOT EXISTS "journal_entries_tenant_id_org_id_journal_date_idx" ON "journal_entries"("tenant_id", "org_id", "journal_date");
CREATE INDEX IF NOT EXISTS "kpi_definitions_tenant_id_org_id_idx" ON "kpi_definitions"("tenant_id", "org_id");
CREATE INDEX IF NOT EXISTS "kpi_values_tenant_id_org_id_month_idx" ON "kpi_values"("tenant_id", "org_id", "month");
CREATE INDEX IF NOT EXISTS "reports_tenant_id_org_id_idx" ON "reports"("tenant_id", "org_id");
CREATE INDEX IF NOT EXISTS "cash_flow_categories_tenant_id_org_id_idx" ON "cash_flow_categories"("tenant_id", "org_id");
CREATE INDEX IF NOT EXISTS "cash_flow_entries_tenant_id_org_id_entry_date_idx" ON "cash_flow_entries"("tenant_id", "org_id", "entry_date");
CREATE INDEX IF NOT EXISTS "cash_flow_forecasts_tenant_id_org_id_idx" ON "cash_flow_forecasts"("tenant_id", "org_id");
CREATE INDEX IF NOT EXISTS "collection_profiles_tenant_id_org_id_idx" ON "collection_profiles"("tenant_id", "org_id");
CREATE INDEX IF NOT EXISTS "runway_snapshots_tenant_id_org_id_snapshot_date_idx" ON "runway_snapshots"("tenant_id", "org_id", "snapshot_date");
CREATE INDEX IF NOT EXISTS "loan_simulations_tenant_id_org_id_idx" ON "loan_simulations"("tenant_id", "org_id");
CREATE INDEX IF NOT EXISTS "integrations_tenant_id_org_id_idx" ON "integrations"("tenant_id", "org_id");
CREATE INDEX IF NOT EXISTS "notifications_tenant_id_org_id_created_at_idx" ON "notifications"("tenant_id", "org_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_tenant_id_org_id_created_at_idx" ON "audit_logs"("tenant_id", "org_id", "created_at");
CREATE INDEX IF NOT EXISTS "calendar_events_tenant_id_org_id_date_idx" ON "calendar_events"("tenant_id", "org_id", "date");
CREATE INDEX IF NOT EXISTS "actions_tenant_id_org_id_status_idx" ON "actions"("tenant_id", "org_id", "status");
CREATE INDEX IF NOT EXISTS "actions_tenant_id_org_id_due_date_idx" ON "actions"("tenant_id", "org_id", "due_date");
CREATE INDEX IF NOT EXISTS "actions_tenant_id_org_id_source_screen_idx" ON "actions"("tenant_id", "org_id", "source_screen");
CREATE INDEX IF NOT EXISTS "business_events_tenant_id_org_id_event_date_idx" ON "business_events"("tenant_id", "org_id", "event_date");
CREATE INDEX IF NOT EXISTS "briefing_snapshots_tenant_id_org_id_generated_at_idx" ON "briefing_snapshots"("tenant_id", "org_id", "generated_at");
CREATE INDEX IF NOT EXISTS "monthly_review_approvals_tenant_id_org_id_fiscal_year_idx" ON "monthly_review_approvals"("tenant_id", "org_id", "fiscal_year");
CREATE INDEX IF NOT EXISTS "monthly_closes_tenant_id_org_id_fiscal_year_idx" ON "monthly_closes"("tenant_id", "org_id", "fiscal_year");
CREATE INDEX IF NOT EXISTS "monthly_closes_tenant_id_org_id_status_idx" ON "monthly_closes"("tenant_id", "org_id", "status");
