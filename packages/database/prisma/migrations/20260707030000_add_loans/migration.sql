-- CreateEnum
CREATE TYPE "LoanRateType" AS ENUM ('FIXED', 'VARIABLE');

-- CreateEnum
CREATE TYPE "LoanRepaymentMethod" AS ENUM ('EQUAL_INSTALLMENT', 'EQUAL_PRINCIPAL', 'BULLET', 'OTHER');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'REPAID');

-- CreateTable
CREATE TABLE "loans" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "lender_name" TEXT NOT NULL,
    "branch_name" TEXT,
    "loan_number" TEXT,
    "loan_type" TEXT,
    "principal" BIGINT NOT NULL,
    "interest_rate" DECIMAL(6,4),
    "rate_type" "LoanRateType" NOT NULL DEFAULT 'FIXED',
    "start_date" DATE,
    "term_months" INTEGER,
    "maturity_date" DATE,
    "repayment_method" "LoanRepaymentMethod" NOT NULL DEFAULT 'EQUAL_INSTALLMENT',
    "repayment_account" TEXT,
    "drive_url" TEXT,
    "memo" TEXT,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_schedule_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "principal_amount" BIGINT NOT NULL,
    "interest_amount" BIGINT NOT NULL,
    "total_amount" BIGINT NOT NULL,
    "balance_after" BIGINT NOT NULL,
    "interest_rate" DECIMAL(6,4),
    "is_estimated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "loan_schedule_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "loan_id" UUID,
    "file_name" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "content_type" TEXT,
    "size_bytes" INTEGER,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loans_tenant_id_org_id_idx" ON "loans"("tenant_id", "org_id");

-- CreateIndex
CREATE INDEX "loan_schedule_entries_loan_id_due_date_idx" ON "loan_schedule_entries"("loan_id", "due_date");

-- CreateIndex
CREATE INDEX "loan_schedule_entries_tenant_id_idx" ON "loan_schedule_entries"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "loan_schedule_entries_loan_id_seq_key" ON "loan_schedule_entries"("loan_id", "seq");

-- CreateIndex
CREATE INDEX "loan_documents_tenant_id_org_id_idx" ON "loan_documents"("tenant_id", "org_id");

-- CreateIndex
CREATE INDEX "loan_documents_loan_id_idx" ON "loan_documents"("loan_id");

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_schedule_entries" ADD CONSTRAINT "loan_schedule_entries_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_documents" ADD CONSTRAINT "loan_documents_org_id_tenant_id_fkey" FOREIGN KEY ("org_id", "tenant_id") REFERENCES "organizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_documents" ADD CONSTRAINT "loan_documents_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- 既存方針(20260529090000)に合わせ、新規テーブルも RLS を有効化する
-- (API は所有者ロール接続のため影響なし。PostgREST anon 経路の防御)
ALTER TABLE "loans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loan_schedule_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loan_documents" ENABLE ROW LEVEL SECURITY;
