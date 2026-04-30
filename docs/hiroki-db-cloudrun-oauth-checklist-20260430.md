# Hiroki 側作業詳細: DB dry-run / Cloud Run / OAuth

作成日: 2026-04-30

## 対象

この文書は、Hiroki 側で必要な以下 3 領域を整理する。

2. 本番相当 DB での migration dry-run
3. Google Cloud / Cloud Run / Secret Manager / IAM 設定
4. MoneyForward OAuth redirect URL の Cloud Run 一本化

秘密情報はこのチャットや Git に貼らない。必要な場合は、Git 管理外の `apps/api/.env.staging.local`、Google Secret Manager、または Hiroki 側でのコマンド実行結果だけを共有する。

実際の project id / Cloud Run URL / Supabase 情報 / MF redirect 情報は `docs/production-handoff-values-20260430.md` に反映済み。

---

## 2. 本番相当 DB migration dry-run

### 目的

今回の tenant / permission / `tenantId` 追加 migration を、本番データ相当の DB に当てても壊れないか確認する。

確認すること:

- migration が最後まで通る。
- 既存データが default tenant に正しく backfill される。
- `tenant_id` が必要な主要 table に欠落が残らない。
- unique constraint / foreign key / index が既存データと衝突しない。
- login / org switch / MF OAuth / sync / reports / monthly review がステージングで動く。
- rollback できる backup が存在する。

### Hiroki が集める情報

```text
DB provider:
DB region:
PostgreSQL version:
本番 DB 名:
本番 DB の backup / snapshot 方法:
point-in-time restore 可否:
staging DB を新規作成できるか:
staging DB 名:
staging DB の接続元制限:
staging DB に本番 snapshot を restore できるか:
migration 実行に使う DB user 名:
migration 実行許可を出せる時間帯:
rollback に使う snapshot / backup の保存場所:
```

Codex に渡す場合:

```text
DATABASE_URL_STAGING:
DIRECT_URL_STAGING が必要ならその値:
```

渡し方:

- 推奨: `apps/api/.env.staging.local` に保存する。`.env.*.local` は `.gitignore` 対象。
- 代替: Secret Manager に置き、Cloud Run / ローカル実行者だけが読めるようにする。
- 代替: Hiroki 側でコマンドを実行し、secret を含まない出力だけ渡す。

チャットに貼らないもの:

```text
DATABASE_URL_PRODUCTION
DATABASE_URL_STAGING
DB password
private key
OAuth client secret
Secret Manager の secret value
```

### Hiroki 側作業

#### 2-1. 本番 DB backup を取る

- 本番 DB の backup / snapshot を取得する。
- 取得時刻を記録する。
- restore 可能な形式か確認する。
- 可能なら point-in-time restore も有効化しておく。

記録する値:

```text
backup id:
backup timestamp:
backup storage location:
restore test status:
```

#### 2-2. staging DB を作る

- 本番とは別の DB / instance / project に staging DB を作る。
- 本番アプリから staging DB に接続されないようにする。
- migration 用 DB user を作る。
- staging DB に本番 snapshot を restore する。

注意:

- staging DB でも個人情報・会計データを含む可能性があるため、公開 network や広い IAM を避ける。
- staging DB の credential は本番 credential と分ける。
- staging DB の URL を Vercel production / Cloud Run production に設定しない。

#### 2-3. dry-run 前の row count を取る

データ内容ではなく件数だけ確認する。

```sql
select 'tenants' as table_name, count(*) from tenants
union all select 'users', count(*) from users
union all select 'organizations', count(*) from organizations
union all select 'tenant_memberships', count(*) from tenant_memberships
union all select 'organization_memberships', count(*) from organization_memberships
union all select 'account_masters', count(*) from account_masters
union all select 'fiscal_years', count(*) from fiscal_years
union all select 'budget_versions', count(*) from budget_versions
union all select 'budget_entries', count(*) from budget_entries
union all select 'actual_entries', count(*) from actual_entries
union all select 'journal_entries', count(*) from journal_entries
union all select 'integrations', count(*) from integrations
union all select 'notifications', count(*) from notifications
union all select 'audit_logs', count(*) from audit_logs
union all select 'monthly_review_approvals', count(*) from monthly_review_approvals;
```

Codex に渡すもの:

```text
row count の結果
DB provider / PostgreSQL version
restore 済み staging DB に対して migration 実行してよいか
```

#### 2-4. migration dry-run を実行する

Codex が staging DB に接続できる場合はこちらで実行する。Hiroki 側で実行する場合は以下。

```bash
npm exec -w packages/database -- prisma migrate status --schema=prisma/schema.prisma
npm exec -w packages/database -- prisma migrate deploy --schema=prisma/schema.prisma
npm exec -w packages/database -- prisma validate --schema=prisma/schema.prisma
```

実行前提:

- `DATABASE_URL` は staging DB を指す。
- production DB の `DATABASE_URL` では実行しない。
- 実行ログに secret が出ないようにする。

#### 2-5. dry-run 後の検証

```sql
select count(*) as organizations_without_tenant
from organizations
where tenant_id is null;

select count(*) as users_without_expected_membership
from users u
where not exists (
  select 1 from tenant_memberships tm where tm.user_id = u.id
)
and not exists (
  select 1 from organization_memberships om where om.user_id = u.id
)
and not exists (
  select 1 from platform_memberships pm where pm.user_id = u.id
);

select tenant_id, code, count(*)
from organizations
where code is not null
group by tenant_id, code
having count(*) > 1;
```

主要 API smoke test:

```text
login
/auth/me
/auth/me/memberships
org switch
masters read
reports read
actuals read
monthly review read / update
MF OAuth authorize URL generation
MF OAuth callback
sync status read
```

#### 2-6. 本番 migration 前の go / no-go

go 条件:

- staging migration が通った。
- dry-run 後の row count が想定範囲。
- null tenant / duplicate key / FK error がない。
- 代表 API smoke test が通った。
- rollback snapshot がある。

no-go 条件:

- migration が途中で落ちた。
- 既存データに constraint 衝突がある。
- tenant backfill が不明確。
- staging restore が信用できない。
- rollback 手順が確認できていない。

---

## 3. Google Cloud / Cloud Run / Secret Manager / IAM

### 目的

Cloud Run API を本番実行面にし、secret と権限を最小化する。

### Hiroki が集める情報

```text
GCP project id:
GCP project number:
Cloud Run service name:
Cloud Run region:
Cloud Run API URL:
Artifact Registry repository:
Production service account email:
Vercel production URL:
Secret Manager naming prefix:
```

推奨値:

```text
Cloud Run region: asia-northeast1
Service account: sevenboard-api-prod@<project-id>.iam.gserviceaccount.com
Secret prefix: sevenboard-prod-
```

### Secret Manager に置く secret

```text
sevenboard-prod-database-url              -> DATABASE_URL
sevenboard-prod-jwt-secret                -> JWT_SECRET
sevenboard-prod-mf-client-secret          -> MF_CLIENT_SECRET
sevenboard-prod-mf-token-encryption-key   -> MF_TOKEN_ENCRYPTION_KEY
sevenboard-prod-google-ai-api-key         -> GOOGLE_AI_API_KEY
sevenboard-prod-anthropic-api-key         -> ANTHROPIC_API_KEY
sevenboard-prod-kintone-username          -> KINTONE_USERNAME
sevenboard-prod-kintone-password          -> KINTONE_PASSWORD
sevenboard-prod-sentry-dsn                -> SENTRY_DSN
```

未使用の provider secret は登録しない。

将来 tenant ごとに分ける外部連携 secret:

```text
sevenboard/prod/tenant/{tenantSlug}/kintone-api-token
sevenboard/prod/tenant/{tenantSlug}/slack-webhook
```

### Hiroki 側作業

#### 3-1. Cloud Run 専用 service account を作る

```bash
gcloud iam service-accounts create sevenboard-api-prod \
  --project <project-id> \
  --display-name "SevenBoard API Production"
```

避けること:

- project Owner / Editor を付ける。
- デフォルト Compute Engine service account を使い回す。
- service account key JSON を発行する。
- `GOOGLE_APPLICATION_CREDENTIALS` を Cloud Run に設定する。

#### 3-2. deployer に service account を使う権限を付ける

Cloud Run に service account を attach する deployer には、対象 service account への `roles/iam.serviceAccountUser` が必要。

```bash
gcloud iam service-accounts add-iam-policy-binding \
  sevenboard-api-prod@<project-id>.iam.gserviceaccount.com \
  --project <project-id> \
  --member "user:<deployer-email>" \
  --role "roles/iam.serviceAccountUser"
```

#### 3-3. Cloud Run service identity を設定する

```bash
gcloud run services update <cloud-run-service-name> \
  --project <project-id> \
  --region <region> \
  --service-account sevenboard-api-prod@<project-id>.iam.gserviceaccount.com
```

#### 3-4. Secret Manager の secret 単位で accessor を付ける

project 全体ではなく、secret 単位で付与する。

```bash
gcloud secrets add-iam-policy-binding sevenboard-prod-database-url \
  --project <project-id> \
  --member "serviceAccount:sevenboard-api-prod@<project-id>.iam.gserviceaccount.com" \
  --role "roles/secretmanager.secretAccessor"
```

同様に必要な secret だけ付与する。

#### 3-5. Cloud Run に secret を version pin で注入する

secret を env var として使う場合、`latest` ではなく version 番号に pin する。

```bash
gcloud run services update <cloud-run-service-name> \
  --project <project-id> \
  --region <region> \
  --update-secrets DATABASE_URL=sevenboard-prod-database-url:1,JWT_SECRET=sevenboard-prod-jwt-secret:1,MF_CLIENT_SECRET=sevenboard-prod-mf-client-secret:1,MF_TOKEN_ENCRYPTION_KEY=sevenboard-prod-mf-token-encryption-key:1
```

通常 env var は `--update-env-vars` で更新する。

```bash
gcloud run services update <cloud-run-service-name> \
  --project <project-id> \
  --region <region> \
  --update-env-vars NODE_ENV=production,CORS_ORIGIN=https://<vercel-production-url>,MF_REDIRECT_URI=https://<cloud-run-api-url>/auth/mf/callback
```

注意:

- `--set-env-vars` は既存 env の扱いを誤りやすいため、基本は `--update-env-vars` を使う。
- secret 更新時は「新 version 作成 -> Cloud Run revision 更新 -> 動作確認 -> 旧 version disable」の順にする。
- Cloud Run revision の rollback ができる状態にする。

#### 3-6. 監査と alert を設定する

最低限:

```text
Cloud Run 5xx alert
Cloud Run latency alert
Cloud Run container restart alert
Secret Manager Data Access Logs
MoneyForward OAuth failure alert
MF token refresh failure alert
```

### Codex に渡すもの

```text
GCP project id
Cloud Run service name
Cloud Run region
Cloud Run API URL
Production service account email
Vercel production URL
Secret 名の一覧
Cloud Run env var 名の一覧
```

渡さないもの:

```text
Secret Manager の secret value
DB password
JWT_SECRET
MF_CLIENT_SECRET
MF_TOKEN_ENCRYPTION_KEY
AI API key
Kintone password
```

---

## 4. MoneyForward OAuth redirect URL

### 目的

MoneyForward OAuth callback を Railway から Cloud Run に切り替え、Cloud Run 一本化後に Railway callback を消せる状態にする。

### Hiroki が集める情報

```text
Cloud Run API URL:
現在 MF に登録されている redirect URI:
変更後の redirect URI:
MF client id:
MF 管理画面にログインできるアカウント:
Railway callback URI が登録されているか:
```

変更後の redirect URI:

```text
https://<cloud-run-api-url>/auth/mf/callback
```

### Hiroki 側作業

#### 4-1. MF 管理画面で Cloud Run callback を登録する

- 可能なら一時的に Railway callback と Cloud Run callback を併存させる。
- 併存できない場合は、切替時間を決めて Cloud Run env と同時に変更する。

#### 4-2. Cloud Run env を同じ callback にする

```text
MF_REDIRECT_URI=https://<cloud-run-api-url>/auth/mf/callback
```

MF 管理画面の登録値と 1 文字でも違うと callback が失敗する。

#### 4-3. Vercel production が Cloud Run API を向いていることを確認する

```text
NEXT_PUBLIC_API_URL=https://<cloud-run-api-url>
```

#### 4-4. 動作確認

確認順:

```text
login
integration status
MF OAuth authorize URL generation
MF consent screen
callback URL が Cloud Run であること
token exchange
token refresh
sync status
```

#### 4-5. Railway callback を削除する

削除タイミング:

- Cloud Run callback が成功している。
- Vercel production が Cloud Run API を向いている。
- Railway endpoint に実アクセスがない。
- Railway 停止前チェックリストが完了している。

Railway callback 削除は Railway 停止・secret rotate と同じ最後のフェーズで行う。

### Codex に渡すもの

```text
Cloud Run API URL
Vercel production URL
MF に登録済みの redirect URI 一覧
Cloud Run callback で OAuth 成功したか
失敗した場合の error code / request id / timestamp
```

渡さないもの:

```text
MF client secret
MF access token
MF refresh token
```

---

## Hiroki から Codex への受け渡しテンプレート

以下を埋めれば、こちらで dry-run 手順と repo 側の残作業を進めやすい。

```text
GCP project id:
GCP project number:
Cloud Run service name:
Cloud Run region:
Cloud Run API URL:
Cloud Run service account:
Vercel production URL:

DB provider:
PostgreSQL version:
staging DB 作成済み: yes/no
staging DB restore 済み: yes/no
staging migration 実行許可: yes/no
backup id:
backup timestamp:

MF registered redirect URI:
MF Cloud Run callback registered: yes/no
Railway callback still registered: yes/no

Secret Manager prefix:
登録済み secret 名:
Cloud Run に pin した secret version:

備考:
```

## 参考

- Cloud Run service identity: https://docs.cloud.google.com/run/docs/configuring/services/service-identity
- Cloud Run secrets: https://docs.cloud.google.com/run/docs/configuring/services/secrets
- Secret Manager best practices: https://cloud.google.com/secret-manager/docs/best-practices
