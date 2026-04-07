-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('STARTER', 'GROWTH', 'PRO');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CFO', 'VIEWER', 'ADVISOR');

-- CreateEnum
CREATE TYPE "AccountCategory" AS ENUM ('REVENUE', 'COST_OF_SALES', 'SELLING_EXPENSE', 'ADMIN_EXPENSE', 'NON_OPERATING_INCOME', 'NON_OPERATING_EXPENSE', 'EXTRAORDINARY_INCOME', 'EXTRAORDINARY_EXPENSE', 'ASSET', 'LIABILITY', 'EQUITY');

-- CreateEnum
CREATE TYPE "FiscalYearStatus" AS ENUM ('OPEN', 'CLOSED', 'LOCKED');

-- CreateEnum
CREATE TYPE "ScenarioType" AS ENUM ('BASE', 'UPSIDE', 'DOWNSIDE');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('MANUAL', 'MF_CLOUD', 'FREEE', 'CSV_IMPORT', 'BOOKKEEPING_PLUGIN');

-- CreateEnum
CREATE TYPE "KpiCategory" AS ENUM ('SAAS', 'SALES', 'HR', 'FINANCIAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('VARIANCE', 'PL', 'BS', 'CF', 'VARIABLE_COST', 'CUSTOM', 'CASHFLOW');

-- CreateEnum
CREATE TYPE "AiCommentStatus" AS ENUM ('PENDING', 'APPROVED', 'MODIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CashDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "CashFlowType" AS ENUM ('OPERATING', 'INVESTING', 'FINANCING');

-- CreateEnum
CREATE TYPE "ForecastGranularity" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "AlertLevel" AS ENUM ('SAFE', 'CAUTION', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RepaymentType" AS ENUM ('EQUAL_INSTALLMENT', 'EQUAL_PRINCIPAL', 'BULLET');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('MF_CLOUD', 'FREEE', 'BOOKKEEPING_PLUGIN');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('NEVER', 'SUCCESS', 'FAILED', 'IN_PROGRESS');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ANOMALY_ALERT', 'CASHFLOW_ALERT', 'SYNC_ERROR', 'AI_COMMENT', 'ADVISOR_COMMENT', 'SYSTEM');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "fiscal_month_end" INTEGER NOT NULL DEFAULT 3,
    "industry" TEXT,
    "employee_count" INTEGER,
    "plan_type" "PlanType" NOT NULL DEFAULT 'STARTER',
    "ai_opt_out" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "org_id" UUID,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advisor_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advisor_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" UUID,
    "type" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_masters" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "AccountCategory" NOT NULL,
    "is_variable_cost" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "external_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_masters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_years" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "FiscalYearStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_versions" (
    "id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "scenarioType" "ScenarioType" NOT NULL DEFAULT 'BASE',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_entries" (
    "id" UUID NOT NULL,
    "budget_version_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "department_id" UUID,
    "month" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actual_entries" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "department_id" UUID,
    "month" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actual_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "journal_date" DATE NOT NULL,
    "debit_account_id" UUID NOT NULL,
    "credit_account_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "description" TEXT,
    "external_id" TEXT,
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_definitions" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "formula" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'JPY',
    "category" "KpiCategory" NOT NULL DEFAULT 'CUSTOM',

    CONSTRAINT "kpi_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_values" (
    "id" UUID NOT NULL,
    "kpi_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "value" DECIMAL(15,4) NOT NULL,
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "kpi_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_comments" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "cell_ref" TEXT,
    "content" TEXT NOT NULL,
    "confidence_score" DOUBLE PRECISION,
    "reviewed_by" UUID,
    "status" "AiCommentStatus" NOT NULL DEFAULT 'PENDING',
    "reject_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_flow_categories" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "direction" "CashDirection" NOT NULL,
    "cfType" "CashFlowType" NOT NULL,
    "is_fixed" BOOLEAN NOT NULL DEFAULT false,
    "recurrence_rule" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_flow_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_flow_entries" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "entry_date" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "is_actual" BOOLEAN NOT NULL DEFAULT false,
    "trade_partner" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_flow_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_flow_forecasts" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "forecast_date" DATE NOT NULL,
    "granularity" "ForecastGranularity" NOT NULL,
    "opening_balance" DECIMAL(15,2) NOT NULL,
    "inflow" DECIMAL(15,2) NOT NULL,
    "outflow" DECIMAL(15,2) NOT NULL,
    "closing_balance" DECIMAL(15,2) NOT NULL,
    "scenario_type" "ScenarioType" NOT NULL DEFAULT 'BASE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_flow_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_profiles" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "trade_partner" TEXT NOT NULL,
    "avg_days_to_collect" INTEGER NOT NULL DEFAULT 60,
    "payment_pattern" TEXT,
    "risk_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runway_snapshots" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "cash_balance" DECIMAL(15,2) NOT NULL,
    "monthly_burn_rate" DECIMAL(15,2) NOT NULL,
    "runway_months" DOUBLE PRECISION NOT NULL,
    "alert_level" "AlertLevel" NOT NULL DEFAULT 'SAFE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "runway_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_simulations" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "principal" DECIMAL(15,2) NOT NULL,
    "interest_rate" DOUBLE PRECISION NOT NULL,
    "term_months" INTEGER NOT NULL,
    "grace_months" INTEGER NOT NULL DEFAULT 0,
    "repayment_type" "RepaymentType" NOT NULL DEFAULT 'EQUAL_INSTALLMENT',
    "monthly_repayment" DECIMAL(15,2),
    "start_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_simulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "token_expiry" TIMESTAMP(3),
    "config" JSONB NOT NULL DEFAULT '{}',
    "last_sync_at" TIMESTAMP(3),
    "sync_status" "SyncStatus" NOT NULL DEFAULT 'NEVER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" TEXT,
    "before_value" JSONB,
    "after_value" JSONB,
    "ip_address" TEXT,
    "is_impersonation" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "advisor_assignments_user_id_org_id_key" ON "advisor_assignments"("user_id", "org_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_masters_org_id_code_key" ON "account_masters"("org_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_years_org_id_year_key" ON "fiscal_years"("org_id", "year");

-- CreateIndex
CREATE INDEX "budget_entries_budget_version_id_month_idx" ON "budget_entries"("budget_version_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "budget_entries_budget_version_id_account_id_department_id_m_key" ON "budget_entries"("budget_version_id", "account_id", "department_id", "month");

-- CreateIndex
CREATE INDEX "actual_entries_org_id_month_idx" ON "actual_entries"("org_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "actual_entries_org_id_account_id_department_id_month_key" ON "actual_entries"("org_id", "account_id", "department_id", "month");

-- CreateIndex
CREATE INDEX "journal_entries_org_id_journal_date_idx" ON "journal_entries"("org_id", "journal_date");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_definitions_org_id_name_key" ON "kpi_definitions"("org_id", "name");

-- CreateIndex
CREATE INDEX "kpi_values_org_id_month_idx" ON "kpi_values"("org_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_values_kpi_id_month_key" ON "kpi_values"("kpi_id", "month");

-- CreateIndex
CREATE INDEX "cash_flow_entries_org_id_entry_date_idx" ON "cash_flow_entries"("org_id", "entry_date");

-- CreateIndex
CREATE UNIQUE INDEX "cash_flow_forecasts_org_id_forecast_date_granularity_scenar_key" ON "cash_flow_forecasts"("org_id", "forecast_date", "granularity", "scenario_type");

-- CreateIndex
CREATE UNIQUE INDEX "collection_profiles_org_id_trade_partner_key" ON "collection_profiles"("org_id", "trade_partner");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_org_id_provider_key" ON "integrations"("org_id", "provider");

-- CreateIndex
CREATE INDEX "audit_logs_org_id_created_at_idx" ON "audit_logs"("org_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advisor_assignments" ADD CONSTRAINT "advisor_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advisor_assignments" ADD CONSTRAINT "advisor_assignments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_masters" ADD CONSTRAINT "account_masters_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_entries" ADD CONSTRAINT "budget_entries_budget_version_id_fkey" FOREIGN KEY ("budget_version_id") REFERENCES "budget_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_entries" ADD CONSTRAINT "budget_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_entries" ADD CONSTRAINT "budget_entries_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actual_entries" ADD CONSTRAINT "actual_entries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actual_entries" ADD CONSTRAINT "actual_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actual_entries" ADD CONSTRAINT "actual_entries_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_debit_account_id_fkey" FOREIGN KEY ("debit_account_id") REFERENCES "account_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_credit_account_id_fkey" FOREIGN KEY ("credit_account_id") REFERENCES "account_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_values" ADD CONSTRAINT "kpi_values_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "kpi_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_comments" ADD CONSTRAINT "ai_comments_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_comments" ADD CONSTRAINT "ai_comments_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_flow_categories" ADD CONSTRAINT "cash_flow_categories_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_flow_entries" ADD CONSTRAINT "cash_flow_entries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_flow_entries" ADD CONSTRAINT "cash_flow_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "cash_flow_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_flow_forecasts" ADD CONSTRAINT "cash_flow_forecasts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_profiles" ADD CONSTRAINT "collection_profiles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runway_snapshots" ADD CONSTRAINT "runway_snapshots_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_simulations" ADD CONSTRAINT "loan_simulations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

