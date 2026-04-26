-- factory-hybrid と統一の小文字 5 値ロールに移行
--   ADMIN   → owner
--   CFO     → admin
--   VIEWER  → viewer
--   ADVISOR → advisor
--   member  → 新規追加（編集可・承認不可）

-- PostgreSQL 10+ で ALTER TYPE ... RENAME VALUE が使える
ALTER TYPE "UserRole" RENAME VALUE 'ADMIN' TO 'owner';
ALTER TYPE "UserRole" RENAME VALUE 'CFO' TO 'admin';
ALTER TYPE "UserRole" RENAME VALUE 'VIEWER' TO 'viewer';
ALTER TYPE "UserRole" RENAME VALUE 'ADVISOR' TO 'advisor';

-- member 追加（IF NOT EXISTS で冪等性確保）
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'member';
