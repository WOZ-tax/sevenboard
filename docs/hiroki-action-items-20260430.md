# Hiroki 側アクション整理

作成日: 2026-04-30

## 決定済み方針

- API は Cloud Run に一本化する。
- Railway の停止・削除は最後に回す。
- テナントは会計事務所単位の論理分離にする。
- `platform_owner` は SevenBoard 運営者権限だが、会計事務所や顧問先の業務データを直接見られない。
- 運営者が調査やサポートで業務データを見る必要がある場合は、対象会計事務所から通常ユーザーとして招待してもらう。
- Cloud Run / Secret Manager / OAuth redirect の本番設定は Hiroki 側で実施する。

## いま Hiroki 側で必要なこと

### 1. Platform owner ユーザーを決める

必要な情報:

```text
platform_owner にするメールアドレス:
予備の break-glass 管理者を作るか:
MFA / Google アカウント保護の有無:
```

推奨:

- 最初は Hiroki 1 名だけ。
- 予備を作る場合も 1 名まで。
- 日常運用で `platform_owner` を使わない。
- 会計事務所の業務データ確認が必要なときは、その tenant に `firm_advisor` や `firm_viewer` などで招待してもらう。
- 将来、別の SevenBoard 運営者を追加する場合は platform 管理 API から明示的に招待する。

今回の決定:

- 初期 `platform_owner` は Hiroki。
- `platform_owner` は通常の会計事務所データを読めない。
- サポート対応で会計事務所データを見る必要がある場合は、対象会計事務所から通常ユーザーとして招待してもらう。
- platform 管理者の追加・削除は、通常の会計事務所スタッフ招待とは別の管理導線にする。

### 2. 本番相当 DB migration dry-run のために集める情報

この作業では、既存 DB に今回の tenant / permission schema migration を当てても壊れないかを確認する。

秘密情報はこのチャットに貼らない。貼る必要がある場合は、ローカルの `.env.staging.local` や Google Secret Manager など、Git 管理外の場所に置く。

必要な情報:

```text
本番 DB provider:
本番 DB のホスト名:
本番 DB のリージョン:
本番 DB のバージョン:
本番 DB のバックアップ取得方法:
本番 DB の point-in-time restore 可否:
ステージング DB を新規作成できるか:
ステージング DB の接続方法:
本番データをステージングへ restore できるか:
本番 DB migration を実行してよい時間帯:
rollback に使う backup / snapshot の保存場所:
```

こちらで確認したい値:

```text
DATABASE_URL_STAGING:
DATABASE_URL_PRODUCTION は直接渡さない。必要なら Hiroki 側でコマンド実行。
既存 Organization の代表 tenant 名:
既存 Organization の代表 tenant slug:
既存 Organization をどの Tenant に backfill するか:
```

dry-run 前に取るべき row count:

```text
Tenant:
Organization:
OrganizationMembership:
User:
Account:
ActualEntry:
Budget:
JournalEntry:
Integration:
Notification:
AuditLog:
```

dry-run 後に見ること:

- migration が最後まで通る。
- 既存 organization が default tenant に正しく紐づく。
- `tenantId` が必要な主要 table に null が残らない。
- 主要 unique constraint が衝突しない。
- login / org switch / MF OAuth / sync / reports / monthly review がステージングで動く。
- rollback 手順が実際に成立する。

### 3. Google Cloud 側の設定

必要な情報:

```text
GCP project id:
Cloud Run service name:
Cloud Run region:
Cloud Run API URL:
Production service account email:
Secret Manager naming prefix:
```

実施すること:

- Cloud Run 用の専用 service account を作る。
- デフォルト Compute Engine service account を使わない。
- service account key JSON を発行しない。
- Secret Manager の secret 単位で `roles/secretmanager.secretAccessor` を付与する。
- Cloud Run には secret version を pin して注入する。

### 4. OAuth redirect URL の確認

必要な情報:

```text
Cloud Run API URL:
MoneyForward registered redirect URI:
Vercel production URL:
```

実施すること:

- MoneyForward 側の redirect URI を Cloud Run callback にする。
- Cloud Run env の `MF_REDIRECT_URI` も同じ値にする。
- Railway callback URI は Cloud Run 動作確認後に削除する。

### 5. Secret Manager に登録する secret を揃える

必要な secret:

```text
DATABASE_URL
JWT_SECRET
MF_CLIENT_SECRET
MF_TOKEN_ENCRYPTION_KEY
GOOGLE_AI_API_KEY または ANTHROPIC_API_KEY
KINTONE_USERNAME / KINTONE_PASSWORD、または tenant 専用 API token
SENTRY_DSN
```

推奨:

- `JWT_SECRET` は十分長い乱数にする。
- `MF_TOKEN_ENCRYPTION_KEY` は 64 hex chars にする。
- tenant ごとに分けるべき外部連携 secret は、将来以下のような命名にする。

```text
sevenboard/prod/tenant/{tenantSlug}/kintone-api-token
sevenboard/prod/tenant/{tenantSlug}/slack-webhook
```

## Codex 側で続けること

次の実装順で進める。

完了:

- `/internal/users` を tenant staff 管理 API `/tenants/:tenantId/staff` に作り替える。
- `platform_owner` は業務データを読めず、対象 tenant から招待された場合だけ staff 権限を持つ形にする。
- 会計事務所側から SevenBoard 運営者を通常ユーザーとして招待できる導線を作る。

残り:

1. platform 管理者を追加・削除できる platform 専用導線を作る。
2. Frontend の残り `user.role` 判定を current org membership / permission ベースへ寄せる。
3. 旧 `InternalStaffGuard` / `RolesGuard` / `OrgAccessGuard` の使用を撤去または検出テストで封じる。
4. tenant isolation の integration test を追加する。
5. staging DB migration dry-run 手順を具体化する。
6. Cloud Run 疎通確認後、最後に Railway 停止・secret rotate・削除へ進む。
