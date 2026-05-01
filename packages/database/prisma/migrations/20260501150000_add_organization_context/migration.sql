-- Add organization context fields for AI CFO understanding
-- - website_url: public HP URL (AI uses for context)
-- - business_context: free-form text editable by user (industry-agnostic context)
-- - context_updated_at / context_updated_by_id: audit metadata for businessContext
-- - kintone_synced_at: timestamp of last manual prefill from kintone customer master

ALTER TABLE "organizations"
    ADD COLUMN "website_url" TEXT,
    ADD COLUMN "business_context" TEXT,
    ADD COLUMN "context_updated_at" TIMESTAMP(3),
    ADD COLUMN "context_updated_by_id" UUID,
    ADD COLUMN "kintone_synced_at" TIMESTAMP(3);

ALTER TABLE "organizations"
    ADD CONSTRAINT "organizations_context_updated_by_id_fkey"
    FOREIGN KEY ("context_updated_by_id") REFERENCES "users" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
