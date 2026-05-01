-- AI CFO health snapshot table for accounting review section 1 (health summary)
-- 100-point composite score: activity (40) + safety (40) + efficiency (20)
-- Calculated on each MF sync completion.

CREATE TABLE "health_snapshots" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "score" INTEGER NOT NULL,
    "prev_score" INTEGER,
    "breakdown" JSONB NOT NULL DEFAULT '{}',
    "indicators" JSONB NOT NULL DEFAULT '{}',
    "ai_questions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "health_snapshots_tenant_id_org_id_snapshot_date_key"
    ON "health_snapshots" ("tenant_id", "org_id", "snapshot_date");

CREATE INDEX "health_snapshots_tenant_id_org_id_snapshot_date_idx"
    ON "health_snapshots" ("tenant_id", "org_id", "snapshot_date" DESC);

ALTER TABLE "health_snapshots" ADD CONSTRAINT "health_snapshots_org_id_tenant_id_fkey"
    FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
