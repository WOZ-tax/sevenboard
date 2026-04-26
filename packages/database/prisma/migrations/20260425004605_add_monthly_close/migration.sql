-- CreateEnum
CREATE TYPE "MonthlyCloseStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'CLOSED');

-- AlterTable
ALTER TABLE "action_events" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "actions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "agent_runs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "briefing_snapshots" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "business_events" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "calendar_events" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "data_sync_logs" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "monthly_closes" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "MonthlyCloseStatus" NOT NULL DEFAULT 'OPEN',
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" UUID,
    "snapshot" JSONB,
    "note" TEXT,

    CONSTRAINT "monthly_closes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monthly_closes_org_id_fiscal_year_idx" ON "monthly_closes"("org_id", "fiscal_year");

-- CreateIndex
CREATE INDEX "monthly_closes_org_id_status_idx" ON "monthly_closes"("org_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_closes_org_id_fiscal_year_month_key" ON "monthly_closes"("org_id", "fiscal_year", "month");

-- AddForeignKey
ALTER TABLE "monthly_closes" ADD CONSTRAINT "monthly_closes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
