-- AlterTable: add brief push delivery config to organizations
ALTER TABLE "organizations"
  ADD COLUMN "brief_push_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "brief_push_hour_jst" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN "brief_slack_webhook_url" TEXT;
