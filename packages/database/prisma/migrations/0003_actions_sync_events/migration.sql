-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "ActionSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ActionOwnerRole" AS ENUM ('ADVISOR', 'EXECUTIVE', 'ACCOUNTING');

-- CreateEnum
CREATE TYPE "ActionSourceScreen" AS ENUM ('DASHBOARD', 'CASHFLOW', 'MONTHLY_REVIEW', 'AI_REPORT', 'ALERTS', 'VARIANCE', 'KPI', 'MANUAL');

-- CreateEnum
CREATE TYPE "ActionEventType" AS ENUM ('CREATED', 'REASSIGNED', 'STATUS_CHANGED', 'NOTE_ADDED', 'SLACK_LINKED');

-- CreateEnum
CREATE TYPE "SyncSource" AS ENUM ('MF_CLOUD', 'KINTONE', 'SLACK', 'TAX_PLUGIN', 'BOOKKEEPING_PLUGIN', 'MANUAL');

-- CreateEnum
CREATE TYPE "SyncResult" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source_screen" "ActionSourceScreen" NOT NULL,
    "source_ref" JSONB NOT NULL DEFAULT '{}',
    "severity" "ActionSeverity" NOT NULL DEFAULT 'MEDIUM',
    "owner_role" "ActionOwnerRole" NOT NULL DEFAULT 'ADVISOR',
    "owner_user_id" UUID,
    "due_date" DATE,
    "status" "ActionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "linked_slack_thread_url" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "actions_org_id_status_idx" ON "actions"("org_id", "status");

-- CreateIndex
CREATE INDEX "actions_org_id_due_date_idx" ON "actions"("org_id", "due_date");

-- CreateIndex
CREATE INDEX "actions_org_id_source_screen_idx" ON "actions"("org_id", "source_screen");

-- CreateTable
CREATE TABLE "action_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "action_id" UUID NOT NULL,
    "event_type" "ActionEventType" NOT NULL,
    "event_by" UUID NOT NULL,
    "event_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "action_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "action_events_action_id_event_at_idx" ON "action_events"("action_id", "event_at");

-- CreateTable
CREATE TABLE "data_sync_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "source" "SyncSource" NOT NULL,
    "status" "SyncResult" NOT NULL,
    "error_message" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_ms" INTEGER,

    CONSTRAINT "data_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_sync_logs_org_id_source_synced_at_idx" ON "data_sync_logs"("org_id", "source", "synced_at");

-- CreateTable
CREATE TABLE "business_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "event_date" DATE NOT NULL,
    "event_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "impact_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_events_org_id_event_date_idx" ON "business_events"("org_id", "event_date");

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_events" ADD CONSTRAINT "action_events_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_events" ADD CONSTRAINT "action_events_event_by_fkey" FOREIGN KEY ("event_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_sync_logs" ADD CONSTRAINT "data_sync_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_events" ADD CONSTRAINT "business_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_events" ADD CONSTRAINT "business_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
