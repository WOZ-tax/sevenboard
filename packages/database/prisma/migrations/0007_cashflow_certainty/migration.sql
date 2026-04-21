-- AlterTable: store per-org cashflow certainty map (category -> level) as JSON
ALTER TABLE "organizations"
  ADD COLUMN "cashflow_certainty" JSONB;
