-- CreateEnum
CREATE TYPE "MonthlyReviewApprovalStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateTable: 月次レビュー承認状態（org × fiscalYear × month で1件）
CREATE TABLE "monthly_review_approvals" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "MonthlyReviewApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_review_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "monthly_review_approvals_org_id_fiscal_year_month_key" ON "monthly_review_approvals"("org_id", "fiscal_year", "month");

-- CreateIndex
CREATE INDEX "monthly_review_approvals_org_id_fiscal_year_idx" ON "monthly_review_approvals"("org_id", "fiscal_year");

-- AddForeignKey
ALTER TABLE "monthly_review_approvals" ADD CONSTRAINT "monthly_review_approvals_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
