-- CreateEnum
CREATE TYPE "AgentRunKey" AS ENUM ('BRIEF', 'SENTINEL', 'DRAFTER', 'AUDITOR', 'COPILOT');

-- CreateEnum
CREATE TYPE "AgentRunMode" AS ENUM ('OBSERVE', 'DIALOG', 'EXECUTE', 'CRON');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('SUCCESS', 'FALLBACK', 'FAILED');

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "agent_key" "AgentRunKey" NOT NULL,
    "mode" "AgentRunMode",
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fiscal_year" INTEGER,
    "end_month" INTEGER,
    "user_id" UUID,
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB NOT NULL DEFAULT '{}',
    "tool_calls" JSONB NOT NULL DEFAULT '[]',
    "status" "AgentRunStatus" NOT NULL DEFAULT 'SUCCESS',
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_runs_org_id_agent_key_generated_at_idx" ON "agent_runs"("org_id", "agent_key", "generated_at");

-- CreateIndex
CREATE INDEX "agent_runs_org_id_generated_at_idx" ON "agent_runs"("org_id", "generated_at");

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
