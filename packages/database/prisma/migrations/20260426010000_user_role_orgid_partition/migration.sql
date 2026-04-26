-- G-1 ロール設計を DB レイヤで強制：
--   内部スタッフ (org_id IS NULL): role ∈ {'owner', 'advisor'} のみ
--   CL 側ユーザー (org_id IS NOT NULL): role ∈ {'admin', 'member', 'viewer'} のみ
--
-- これにより `role === 'owner'` が常に「内部 owner」を意味するようになり、
-- 顧問先側 owner という概念がそもそも DB に作れない。アプリ側で
-- うっかり global role だけ見るコードを書いても権限漏れに繋がらない。
--
-- factory-hybrid との enum 値互換は維持（5 値そのまま）。

-- ────────────────────────────────────────────────────────
-- Step 1: 既存データの救済 UPDATE
-- ────────────────────────────────────────────────────────
-- 顧問先側の 'owner' / 'advisor' は不正配置なので CL 側で最も近いロール 'admin' に降格
UPDATE "users"
SET    "role" = 'admin'
WHERE  "org_id" IS NOT NULL
  AND  "role" IN ('owner', 'advisor');

-- 内部スタッフの 'admin' / 'member' / 'viewer' は不正配置なので 'advisor' に統一
-- （'owner' に昇格させると権限拡大になるため、安全側に倒して advisor とする）
UPDATE "users"
SET    "role" = 'advisor'
WHERE  "org_id" IS NULL
  AND  "role" NOT IN ('owner', 'advisor');

-- ────────────────────────────────────────────────────────
-- Step 2: CHECK 制約追加
-- ────────────────────────────────────────────────────────
ALTER TABLE "users"
  ADD CONSTRAINT "user_role_orgid_partition"
  CHECK (
    (
      "org_id" IS NULL
      AND "role" IN ('owner', 'advisor')
    )
    OR
    (
      "org_id" IS NOT NULL
      AND "role" IN ('admin', 'member', 'viewer')
    )
  );
