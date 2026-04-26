-- AdvisorAssignment に role 列を追加。
-- 当面は default 'advisor' で全行が advisor 扱い。
-- 将来 SaaS 展開時に SEVENRICH スタッフが「顧問先 X では advisor、顧問先 Y では member」
-- のような柔軟な紐付けを許容するための前準備。

ALTER TABLE "advisor_assignments"
  ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'advisor';
