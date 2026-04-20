-- CreateTable
CREATE TABLE "briefing_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "greeting" TEXT NOT NULL,
    "headlines" JSONB NOT NULL DEFAULT '[]',
    "fallback_reason" TEXT,
    "urgent_count" INTEGER NOT NULL DEFAULT 0,
    "this_week_count" INTEGER NOT NULL DEFAULT 0,
    "headline_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "briefing_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "briefing_snapshots_org_id_generated_at_idx" ON "briefing_snapshots"("org_id", "generated_at");

-- AddForeignKey
ALTER TABLE "briefing_snapshots" ADD CONSTRAINT "briefing_snapshots_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
