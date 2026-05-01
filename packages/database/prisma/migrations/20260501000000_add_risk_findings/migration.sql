-- AI CFO risk_findings table for accounting review
-- 3 layers: L1_RULE (deterministic), L2_STATS (per-company range), L3_LLM (manual only).
-- L1+L2 run on MF sync completion. L3 runs only on manual "AI detail check" button.

CREATE TYPE "RiskLayer" AS ENUM ('L1_RULE', 'L2_STATS', 'L3_LLM');
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'CONFIRMED', 'DISMISSED', 'RESOLVED');

CREATE TABLE "risk_findings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "layer" "RiskLayer" NOT NULL,
    "rule_key" TEXT NOT NULL,
    "scope_key" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "risk_score" INTEGER NOT NULL,
    "flags" JSONB NOT NULL DEFAULT '[]',
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "recommended_action" TEXT NOT NULL,
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_findings_pkey" PRIMARY KEY ("id")
);

-- Compound unique to upsert by (org x period x layer x ruleKey x scopeKey).
-- scope_key uses '' default (NOT NULL) because Prisma compound unique treats NULL as distinct.
CREATE UNIQUE INDEX "risk_findings_tenant_id_org_id_fiscal_year_month_layer_rule__key"
    ON "risk_findings" ("tenant_id", "org_id", "fiscal_year", "month", "layer", "rule_key", "scope_key");

CREATE INDEX "risk_findings_tenant_id_org_id_fiscal_year_month_status_idx"
    ON "risk_findings" ("tenant_id", "org_id", "fiscal_year", "month", "status");

CREATE INDEX "risk_findings_org_id_status_risk_score_idx"
    ON "risk_findings" ("org_id", "status", "risk_score" DESC);

CREATE INDEX "risk_findings_org_id_layer_idx"
    ON "risk_findings" ("org_id", "layer");

-- Composite FK to enforce tenant boundary (organizations has unique on (id, tenant_id))
ALTER TABLE "risk_findings" ADD CONSTRAINT "risk_findings_org_id_tenant_id_fkey"
    FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "risk_findings" ADD CONSTRAINT "risk_findings_resolved_by_id_fkey"
    FOREIGN KEY ("resolved_by_id") REFERENCES "users" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
