-- Multitenancy foundation:
-- - Tenant as the accounting-firm boundary.
-- - Platform/Tenant memberships as scoped authorization primitives.
-- - SystemMaster as versioned global templates.
-- - OrganizationMasterSource to record which SystemMaster version seeded an org master.
--
-- This migration is intentionally backwards-compatible with the current API:
-- Organization.code remains globally unique for now; tenant_id is added as a required
-- column so the next phase can move lookups to tenant-scoped queries safely.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('active', 'suspended', 'archived');
CREATE TYPE "TenantIsolationMode" AS ENUM ('shared', 'dedicated_schema', 'dedicated_database');
CREATE TYPE "PlatformRole" AS ENUM ('platform_owner', 'platform_admin', 'platform_support', 'security_admin');
CREATE TYPE "TenantRole" AS ENUM ('firm_owner', 'firm_admin', 'firm_manager', 'firm_advisor', 'firm_viewer');
CREATE TYPE "MembershipStatus" AS ENUM ('invited', 'active', 'suspended', 'revoked');
CREATE TYPE "MembershipSide" AS ENUM ('advisor', 'client');
CREATE TYPE "SystemMasterType" AS ENUM (
  'account_template',
  'cash_flow_template',
  'kpi_template',
  'report_template',
  'monthly_review_template',
  'ai_policy',
  'permission_catalog',
  'feature_catalog'
);
CREATE TYPE "SystemMasterStatus" AS ENUM ('draft', 'published', 'retired');

-- CreateTable
CREATE TABLE "tenants" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" "TenantStatus" NOT NULL DEFAULT 'active',
  "plan" "PlanType" NOT NULL DEFAULT 'STARTER',
  "isolation_mode" "TenantIsolationMode" NOT NULL DEFAULT 'shared',
  "shard_id" TEXT,
  "db_secret_name" TEXT,
  "region" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- Seed the existing single accounting-firm tenant.
INSERT INTO "tenants" (
  "id",
  "name",
  "slug",
  "status",
  "plan",
  "isolation_mode",
  "region",
  "created_at",
  "updated_at"
)
VALUES (
  '00000000-0000-0000-0000-000000000777',
  'SEVENRICH',
  'sevenrich',
  'active',
  'PRO',
  'shared',
  'asia-northeast1',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

-- Add tenant_id to existing organizations and backfill to SEVENRICH.
ALTER TABLE "organizations" ADD COLUMN "tenant_id" UUID;

UPDATE "organizations"
SET "tenant_id" = '00000000-0000-0000-0000-000000000777'
WHERE "tenant_id" IS NULL;

ALTER TABLE "organizations" ALTER COLUMN "tenant_id" SET NOT NULL;

CREATE UNIQUE INDEX "organizations_id_tenant_id_key" ON "organizations"("id", "tenant_id");
CREATE UNIQUE INDEX "organizations_tenant_id_code_key" ON "organizations"("tenant_id", "code");
CREATE INDEX "organizations_tenant_id_idx" ON "organizations"("tenant_id");

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Platform memberships.
CREATE TABLE "platform_memberships" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "PlatformRole" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "platform_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_memberships_user_id_role_key"
  ON "platform_memberships"("user_id", "role");
CREATE INDEX "platform_memberships_role_idx" ON "platform_memberships"("role");

ALTER TABLE "platform_memberships"
  ADD CONSTRAINT "platform_memberships_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Transitional mapping: existing internal owners become platform owners.
INSERT INTO "platform_memberships" ("id", "user_id", "role", "created_at")
SELECT gen_random_uuid(), "id", 'platform_owner', CURRENT_TIMESTAMP
FROM "users"
WHERE "org_id" IS NULL AND "role" = 'owner'
ON CONFLICT ("user_id", "role") DO NOTHING;

-- Tenant memberships.
CREATE TABLE "tenant_memberships" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "role" "TenantRole" NOT NULL,
  "status" "MembershipStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_memberships_user_id_tenant_id_key"
  ON "tenant_memberships"("user_id", "tenant_id");
CREATE INDEX "tenant_memberships_tenant_id_role_idx"
  ON "tenant_memberships"("tenant_id", "role");

ALTER TABLE "tenant_memberships"
  ADD CONSTRAINT "tenant_memberships_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tenant_memberships"
  ADD CONSTRAINT "tenant_memberships_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Transitional mapping: existing internal staff become SEVENRICH tenant members.
INSERT INTO "tenant_memberships" (
  "id",
  "user_id",
  "tenant_id",
  "role",
  "status",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  "id",
  '00000000-0000-0000-0000-000000000777',
  CASE
    WHEN "role" = 'owner' THEN 'firm_owner'::"TenantRole"
    ELSE 'firm_advisor'::"TenantRole"
  END,
  'active',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users"
WHERE "org_id" IS NULL AND "role" IN ('owner', 'advisor')
ON CONFLICT ("user_id", "tenant_id") DO NOTHING;

-- Organization memberships become tenant-aware while keeping user_id+org_id unique.
ALTER TABLE "organization_memberships" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "organization_memberships"
  ADD COLUMN "side" "MembershipSide" NOT NULL DEFAULT 'advisor';

UPDATE "organization_memberships" om
SET
  "tenant_id" = o."tenant_id",
  "side" = CASE
    WHEN om."role" IN ('owner', 'advisor') THEN 'advisor'::"MembershipSide"
    ELSE 'client'::"MembershipSide"
  END
FROM "organizations" o
WHERE o."id" = om."org_id";

-- Backfill client-side users into organization_memberships. Existing APIs mostly use
-- users.org_id today; this prepares the scoped membership model without removing org_id.
INSERT INTO "organization_memberships" (
  "id",
  "user_id",
  "tenant_id",
  "org_id",
  "role",
  "side",
  "created_at"
)
SELECT
  gen_random_uuid(),
  u."id",
  o."tenant_id",
  u."org_id",
  u."role",
  'client',
  CURRENT_TIMESTAMP
FROM "users" u
JOIN "organizations" o ON o."id" = u."org_id"
WHERE u."org_id" IS NOT NULL
ON CONFLICT ("user_id", "org_id") DO NOTHING;

ALTER TABLE "organization_memberships" ALTER COLUMN "tenant_id" SET NOT NULL;

CREATE INDEX "organization_memberships_tenant_id_user_id_idx"
  ON "organization_memberships"("tenant_id", "user_id");
CREATE INDEX "organization_memberships_tenant_id_org_id_idx"
  ON "organization_memberships"("tenant_id", "org_id");

ALTER TABLE "organization_memberships"
  DROP CONSTRAINT IF EXISTS "organization_memberships_org_id_fkey";

ALTER TABLE "organization_memberships"
  ADD CONSTRAINT "organization_memberships_org_id_tenant_id_fkey"
  FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- System master catalogs and versions.
CREATE TABLE "system_master_catalogs" (
  "id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "type" "SystemMasterType" NOT NULL,
  "name" TEXT NOT NULL,
  "status" "SystemMasterStatus" NOT NULL DEFAULT 'draft',
  "current_version_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "system_master_catalogs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "system_master_catalogs_key_key" ON "system_master_catalogs"("key");
CREATE INDEX "system_master_catalogs_type_status_idx"
  ON "system_master_catalogs"("type", "status");

CREATE TABLE "system_master_versions" (
  "id" UUID NOT NULL,
  "catalog_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "checksum" TEXT NOT NULL,
  "status" "SystemMasterStatus" NOT NULL DEFAULT 'draft',
  "published_at" TIMESTAMP(3),
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "system_master_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "system_master_versions_catalog_id_version_key"
  ON "system_master_versions"("catalog_id", "version");
CREATE INDEX "system_master_versions_catalog_id_status_idx"
  ON "system_master_versions"("catalog_id", "status");

ALTER TABLE "system_master_versions"
  ADD CONSTRAINT "system_master_versions_catalog_id_fkey"
  FOREIGN KEY ("catalog_id") REFERENCES "system_master_catalogs"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Organization master copy/source metadata.
CREATE TABLE "organization_master_sources" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "org_id" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "source_system_version_id" UUID,
  "copied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "copied_by_id" UUID,

  CONSTRAINT "organization_master_sources_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_master_sources_tenant_id_org_id_type_key"
  ON "organization_master_sources"("tenant_id", "org_id", "type");
CREATE INDEX "organization_master_sources_tenant_id_org_id_idx"
  ON "organization_master_sources"("tenant_id", "org_id");
CREATE INDEX "organization_master_sources_source_system_version_id_idx"
  ON "organization_master_sources"("source_system_version_id");

ALTER TABLE "organization_master_sources"
  ADD CONSTRAINT "organization_master_sources_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "organization_master_sources"
  ADD CONSTRAINT "organization_master_sources_org_id_tenant_id_fkey"
  FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "organization_master_sources"
  ADD CONSTRAINT "organization_master_sources_source_system_version_id_fkey"
  FOREIGN KEY ("source_system_version_id") REFERENCES "system_master_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Tenant-aware async/sync execution logs.
ALTER TABLE "data_sync_logs" ADD COLUMN "tenant_id" UUID;

UPDATE "data_sync_logs" dsl
SET "tenant_id" = o."tenant_id"
FROM "organizations" o
WHERE o."id" = dsl."org_id";

ALTER TABLE "data_sync_logs" ALTER COLUMN "tenant_id" SET NOT NULL;

CREATE INDEX "data_sync_logs_tenant_id_org_id_source_synced_at_idx"
  ON "data_sync_logs"("tenant_id", "org_id", "source", "synced_at");

ALTER TABLE "data_sync_logs"
  DROP CONSTRAINT IF EXISTS "data_sync_logs_org_id_fkey";

ALTER TABLE "data_sync_logs"
  ADD CONSTRAINT "data_sync_logs_org_id_tenant_id_fkey"
  FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_runs" ADD COLUMN "tenant_id" UUID;

UPDATE "agent_runs" ar
SET "tenant_id" = o."tenant_id"
FROM "organizations" o
WHERE o."id" = ar."org_id";

ALTER TABLE "agent_runs" ALTER COLUMN "tenant_id" SET NOT NULL;

CREATE INDEX "agent_runs_tenant_id_org_id_agent_key_generated_at_idx"
  ON "agent_runs"("tenant_id", "org_id", "agent_key", "generated_at");

ALTER TABLE "agent_runs"
  DROP CONSTRAINT IF EXISTS "agent_runs_org_id_fkey";

ALTER TABLE "agent_runs"
  ADD CONSTRAINT "agent_runs_org_id_tenant_id_fkey"
  FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
