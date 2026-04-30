# Production Handoff Values

作成日: 2026-04-30

## 目的

Hiroki から共有された Cloud Run / Vercel / Supabase / MoneyForward / Kintone の値を、実作業に使える形で固定する。

secret の実値はこの文書に書かない。Secret Manager 名、env 名、実行順だけを書く。

## 確定値

### GCP / Cloud Run

```text
GCP project id:         sevenboard
GCP project number:     889940418983
Cloud Run service name: sevenboard-api
Cloud Run region:       asia-northeast1
Cloud Run API URL:      https://sevenboard-api-889940418983.asia-northeast1.run.app
Service account:        sevenboard-api-prod@sevenboard.iam.gserviceaccount.com
Deployer email:         hiroki.tobayashi@sevenrich.jp
Secret prefix:          sevenboard-prod-
```

今の Cloud Run service をそのまま本番 API として使う。作り直しは不要。

### Vercel

```text
Vercel production URL: https://sevenboard-nine.vercel.app
NEXT_PUBLIC_API_URL:   https://sevenboard-api-889940418983.asia-northeast1.run.app
```

注意:

- `CORS_ORIGIN` には trailing slash を付けない。
- `NEXT_PUBLIC_API_URL` にも trailing slash を付けない。

### Supabase / Postgres

```text
DB provider:          Supabase Postgres
Production ref:       scwjvwlrlxbvnqjdbqhs
DB region:            ap-northeast-1
PostgreSQL version:   17.6
DB name:              postgres
Migration DB user:    postgres
DIRECT_URL:           required
PITR:                 未確認 / 後回し
Migration window:     いつでも OK
Migration strategy:   本番直行 (option C)。テスト段階で最悪消えても許容、Supabase daily backup を保険にする。
```

Prisma migrate は Supabase pooler ではなく direct connection を使う。

補足:

- Supabase の pooler URL は `postgres://postgres.<project-ref>:...@...pooler.supabase.com:5432/postgres` 形式を使う。
- この環境では `postgresql://` + Supabase pooler URL だと Prisma 6.6.0 が `P1013 invalid port number` を返した。
- `postgres://` に変えると P1013 は解消した。
- direct host `db.<project-ref>.supabase.co:5432` は IPv6 前提になりやすく、IPv6 非対応環境では `P1001 Can't reach database server` になる。
- Windows / local から migration を行う場合は、Supabase の Session pooler `:5432` を `DIRECT_URL` に使う方が現実的。

### MoneyForward OAuth

```text
MF_API_BASE_URL:        https://accounting.moneyforward.com/api/v3
MF_MCP_URL:             https://beta.mcp.developers.biz.moneyforward.com/mcp/ca/v3
MF_CLIENT_ID:           258500725265407
MF_REDIRECT_URI:        https://sevenboard-api-889940418983.asia-northeast1.run.app/auth/mf/callback
Railway callback:       https://sevenboard-api-production.up.railway.app/auth/mf/callback
```

確定:

- Cloud Run callback は MF 管理画面に登録済み (yes)。
- Railway callback もまだ並列で登録されている。削除は Cloud Run OAuth 成功確認後、Railway 停止フェーズで実施する。

### Kintone

```text
KINTONE_BASE_URL:        https://plvu6.cybozu.com
KINTONE_MONTHLY_APP_ID:  139
KINTONE_CUSTOMER_APP_ID: 16
```

### AI

```text
AI_PROVIDER: gemini
Model:       gemini-3-flash-preview
```

現状コードでは Gemini model は `gemini-3-flash-preview` に固定されている。

## Secret Manager 名

```text
sevenboard-prod-database-url
sevenboard-prod-direct-url
sevenboard-prod-jwt-secret
sevenboard-prod-mf-client-secret
sevenboard-prod-mf-token-encryption-key
sevenboard-prod-google-ai-api-key
sevenboard-prod-anthropic-api-key
sevenboard-prod-kintone-username
sevenboard-prod-kintone-password
sevenboard-prod-sentry-dsn
```

未使用の provider secret は作らなくてよい。AI provider を Gemini に固定するなら、`sevenboard-prod-anthropic-api-key` は不要。

## Hiroki 側で次にやる作業

### 1. 本番 DB の事前 sanity check (option C 採用)

staging を作らず本番に直接 migration を流すため、事前 SQL で衝突要因がないかだけ確認する。Supabase SQL Editor で実行。

```sql
-- (a) 既存 organizations.code に重複がないか (新規 @@unique([tenantId, code]) と衝突しないため)
select code, count(*) from organizations where code is not null group by code having count(*) > 1;

-- (b) row count snapshot (migration 前後で比較する用)
select 'organizations' t, count(*) c from organizations
union all select 'users', count(*) from users
union all select 'organization_memberships', count(*) from organization_memberships
union all select 'account_masters', count(*) from account_masters
union all select 'fiscal_years', count(*) from fiscal_years
union all select 'budget_versions', count(*) from budget_versions
union all select 'budget_entries', count(*) from budget_entries
union all select 'actual_entries', count(*) from actual_entries
union all select 'journal_entries', count(*) from journal_entries
union all select 'integrations', count(*) from integrations
union all select 'notifications', count(*) from notifications
union all select 'audit_logs', count(*) from audit_logs;
```

合格条件:

```text
(a) は 0 行であること。1 行でも返ったら、その code 重複を解消するまで migration しない。
(b) は migration 後に再取得して比較する用。
```

### 2. 本番 DIRECT_URL を取得する

Supabase Dashboard → Connect → "Direct connection" のタブを選び、`postgresql://postgres:<pass>@db.scwjvwlrlxbvnqjdbqhs.supabase.co:5432/postgres` 系の URL をコピーする。

ローカルで一時的に環境変数に入れて prisma migrate を流すだけなので、`apps/api/.env.production.local` にだけ書く（`.gitignore` 済み）。チャットや Git には貼らない。

```text
DATABASE_URL="postgresql://...:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://...:5432/postgres"
```

### 3. Supabase 直近 backup を確認

Supabase Dashboard → Database → Backups で最新 daily backup の timestamp を控える。万一 migration が壊れたらここから restore する。手動で追加 backup を取りたい場合は同画面の "Take backup"。

### 4. migration を本番に流す

```bash
cd projects/board/sevenboard
# .env.production.local を読み込む形で実行
DOTENV_CONFIG_PATH=apps/api/.env.production.local \
  npm exec -w packages/database -- prisma migrate status --schema=prisma/schema.prisma

DOTENV_CONFIG_PATH=apps/api/.env.production.local \
  npm exec -w packages/database -- prisma migrate deploy --schema=prisma/schema.prisma
```

Prisma は default で `DATABASE_URL` (=pooler) で接続しようとするため、shell の env で direct を上書きするか、`.env` に `DIRECT_URL` を入れて `datasource db { directUrl = env("DIRECT_URL") }` 経由で migrate に使わせる。

### 5. migration 後の検証

```sql
-- (c) tenant が 1 つできて、既存 organizations が default tenant に backfill されているか
select id, name from tenants;
select count(*) as orgs_without_tenant from organizations where tenant_id is null;

-- (d) 主要テーブルの row count が migration 前と一致するか (上の (b) と比較)
-- 同じ SQL を再実行して diff
```

合格条件:

```text
- tenants に 1 行（SEVENRICH 等の default tenant）。
- orgs_without_tenant = 0。
- 主要テーブルの row count が migration 前と完全一致。
- 主要 API smoke (login, org switch, MF connect status, reports read) がエラーなく通る。
```

### 6. 失敗時の rollback

```text
- prisma migrate deploy が中断 → 中断ポイントの migration を手で revert SQL し、
  最新 daily backup から restore するかは状況判断。
- 全部消えてもよいテスト段階のため、最悪は backup から full restore で巻き戻す。
```

### 3. Cloud Run service account を作る

```bash
gcloud iam service-accounts create sevenboard-api-prod \
  --project sevenboard \
  --display-name "SevenBoard API Production"
```

作成済みならスキップ。

### 4. deployer に service account user を付与する

```bash
gcloud iam service-accounts add-iam-policy-binding \
  sevenboard-api-prod@sevenboard.iam.gserviceaccount.com \
  --project sevenboard \
  --member "user:hiroki.tobayashi@sevenrich.jp" \
  --role "roles/iam.serviceAccountUser"
```

### 5. Cloud Run に service account を設定する

```bash
gcloud run services update sevenboard-api \
  --project sevenboard \
  --region asia-northeast1 \
  --service-account sevenboard-api-prod@sevenboard.iam.gserviceaccount.com
```

### 6. Secret Manager に secret を作る

必要なものだけ作る。

```bash
gcloud secrets create sevenboard-prod-database-url --project sevenboard --replication-policy automatic
gcloud secrets create sevenboard-prod-direct-url --project sevenboard --replication-policy automatic
gcloud secrets create sevenboard-prod-jwt-secret --project sevenboard --replication-policy automatic
gcloud secrets create sevenboard-prod-mf-client-secret --project sevenboard --replication-policy automatic
gcloud secrets create sevenboard-prod-mf-token-encryption-key --project sevenboard --replication-policy automatic
gcloud secrets create sevenboard-prod-google-ai-api-key --project sevenboard --replication-policy automatic
gcloud secrets create sevenboard-prod-kintone-username --project sevenboard --replication-policy automatic
gcloud secrets create sevenboard-prod-kintone-password --project sevenboard --replication-policy automatic
gcloud secrets create sevenboard-prod-sentry-dsn --project sevenboard --replication-policy automatic
```

secret value は Cloud Console から登録するか、`--data-file=-` で標準入力から登録する。コマンド履歴に secret value を残さない。

### 7. Cloud Run service account に secret access を付与する

secret 単位で付与する。project 全体に広く付けない。

```powershell
$project = "sevenboard"
$serviceAccount = "sevenboard-api-prod@sevenboard.iam.gserviceaccount.com"
$secrets = @(
  "sevenboard-prod-database-url",
  "sevenboard-prod-direct-url",
  "sevenboard-prod-jwt-secret",
  "sevenboard-prod-mf-client-secret",
  "sevenboard-prod-mf-token-encryption-key",
  "sevenboard-prod-google-ai-api-key",
  "sevenboard-prod-kintone-username",
  "sevenboard-prod-kintone-password",
  "sevenboard-prod-sentry-dsn"
)

foreach ($secret in $secrets) {
  gcloud secrets add-iam-policy-binding $secret `
    --project $project `
    --member "serviceAccount:$serviceAccount" `
    --role "roles/secretmanager.secretAccessor"
}
```

### 8. Cloud Run に secret を version pin で注入する

例では version `1` を使う。実際の version に合わせる。

```bash
gcloud run services update sevenboard-api \
  --project sevenboard \
  --region asia-northeast1 \
  --update-secrets DATABASE_URL=sevenboard-prod-database-url:1,DIRECT_URL=sevenboard-prod-direct-url:1,JWT_SECRET=sevenboard-prod-jwt-secret:1,MF_CLIENT_SECRET=sevenboard-prod-mf-client-secret:1,MF_TOKEN_ENCRYPTION_KEY=sevenboard-prod-mf-token-encryption-key:1,GOOGLE_AI_API_KEY=sevenboard-prod-google-ai-api-key:1,KINTONE_USERNAME=sevenboard-prod-kintone-username:1,KINTONE_PASSWORD=sevenboard-prod-kintone-password:1,SENTRY_DSN=sevenboard-prod-sentry-dsn:1
```

### 9. Cloud Run に通常 env var を設定する

```bash
gcloud run services update sevenboard-api \
  --project sevenboard \
  --region asia-northeast1 \
  --update-env-vars NODE_ENV=production,CORS_ORIGIN=https://sevenboard-nine.vercel.app,MF_API_BASE_URL=https://accounting.moneyforward.com/api/v3,MF_MCP_URL=https://beta.mcp.developers.biz.moneyforward.com/mcp/ca/v3,MF_CLIENT_ID=258500725265407,MF_REDIRECT_URI=https://sevenboard-api-889940418983.asia-northeast1.run.app/auth/mf/callback,KINTONE_BASE_URL=https://plvu6.cybozu.com,KINTONE_MONTHLY_APP_ID=139,KINTONE_CUSTOMER_APP_ID=16,AI_PROVIDER=gemini
```

### 10. Vercel production env を確認する

```text
NEXT_PUBLIC_API_URL=https://sevenboard-api-889940418983.asia-northeast1.run.app
```

変更後は Vercel production deploy が必要。

### 11. MoneyForward redirect URI を確認する

MF 管理画面で以下が登録済みか確認する。

```text
https://sevenboard-api-889940418983.asia-northeast1.run.app/auth/mf/callback
```

Railway callback はまだ削除しない。

削除タイミング:

- Cloud Run callback で OAuth 成功。
- Vercel production が Cloud Run API を向いている。
- Cloud Run 経由で login / MF連携 / sync が動く。
- Railway endpoint に実アクセスがない。

## Codex 側で次にやる作業

完了:

- `/internal/users` を tenant staff 管理 API `/tenants/:tenantId/staff` に作り替えた。
- `platform_owner` が業務データを読めない権限境界を実装・テストした。

残り:

1. この値を前提に repo 側の env validation / Cloud Run runbook を更新する。
2. Frontend の残り `user.role` 判定を membership / permission ベースへ移行する。
3. tenant isolation integration test を追加する。
4. 本番 migration 結果を受けて、smoke test 失敗時の patch を準備する。

## 残確認

Hiroki 側で次に確認する項目:

```text
Prisma migration history:
  20260430090000_multitenancy_foundation    applied at 2026-04-30 08:18:37.96131+00
  20260430100000_tenant_scope_business_data applied at 2026-04-30 08:18:37.96131+00
本番 organizations.code 重複: 0 行 (yes/no)
本番 backup timestamp:
本番 prisma migrate deploy 実行: yes/no
本番 migration 後 row count diff: 一致 (yes/no)
Cloud Run service account created: yes/no
Secret Manager secrets created: yes/no
Cloud Run secret versions pinned: yes/no
MF Cloud Run callback registered: yes (確定)
MF Railway callback still registered: yes (確定、Cloud Run OAuth 確認後に削除)
```
