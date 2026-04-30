# SevenBoard Cloud Run Security Plan

作成日: 2026-04-30

## 目的

SevenBoard の本番 API を Railway から Cloud Run に一本化し、秘密情報、認証、公開面、依存関係、監視を本番運用に耐える状態へ引き上げる。

この文書では、次を明確に分ける。

- Codex 側で repo に実装できること
- Hiroki 側で Google Cloud / Vercel / MoneyForward / Kintone などの管理画面で対応が必要なこと
- Railway を止める前に確認すること

## 前提

- Web は Vercel、API は Cloud Run に寄せる。
- Railway はまだ停止していないだけで、今後は本番面として使わない。
- DB は現状の接続先を継続する前提。DB 接続文字列は Secret Manager で管理する。
- アプリは現状 `process.env` から設定を読むため、まずは Cloud Run の Secret Manager 連携で secret を環境変数として注入する。
- より厳格にする場合は、将来 Secret Manager API をアプリから直接読む方式へ移行する。

## 現状の主なリスク

1. 旧バックエンド実行面が管理画面側に残っている可能性がある
   - repo 側の旧実行基盤設定と Web CSP の旧バックエンド許可は削除済み。
   - 管理画面側に本番 secret が残っている場合、Cloud Run 移行後も漏えい面が残る。

2. 本番 secret の保管方針が統一されていない
   - ローカル `apps/api/.env` に実値の secret が存在していた。
   - `.env` は Git 管理対象ではなかったが、ローカル端末、バックアップ、ログ、共有経由の漏えいリスクがある。

3. API の公開面が広い
   - `/api-docs` が常時公開される構成。
   - API 側に Helmet 相当の防御ヘッダがない。
   - CORS が単一文字列で、本番未設定時の fail-fast が弱い。

4. 認証トークン運用が弱い
   - Web が JWT を `localStorage` に保存している。
   - Cookie と Bearer を併用している。
   - CSRF guard が Bearer header や CSRF cookie 不在時に通すため、Cookie 認証へ寄せる場合は厳格化が必要。

5. 依存関係に既知脆弱性がある
   - `npm audit --omit=dev` で high / moderate が検出済み。
   - `next` と `axios` は minor update で改善可能。
   - NestJS 関連は major update を含むため段階的に対応する。

6. DB 保存 secret の鍵管理が未成熟
   - MF OAuth token は AES-GCM で暗号化できる構成だが、`MF_TOKEN_ENCRYPTION_KEY` が未設定だと平文保存になる。
   - 暗号鍵ローテーションの key version / dual decrypt が未実装。

## 目標アーキテクチャ

```text
Browser
  -> Vercel Web
      NEXT_PUBLIC_API_URL=https://<cloud-run-api>
  -> Cloud Run API
      service account: sevenboard-api-prod@<project>.iam.gserviceaccount.com
      secret source: Google Secret Manager
      runtime env: pinned secret versions
  -> DB / MoneyForward / Kintone / AI Provider / Sentry
```

Railway は Cloud Run の稼働確認後に停止し、CSP、OAuth redirect URI、環境変数、ドキュメントから削除する。

## Secret Manager 管理方針

### 基本ルール

- 本番 secret は Google Secret Manager に置く。
- Cloud Run には user-managed service account を設定する。
- Cloud Run 実行 service account には必要な secret だけ `roles/secretmanager.secretAccessor` を付与する。
- Cloud Run に `GOOGLE_APPLICATION_CREDENTIALS` は設定しない。
- secret を Cloud Run env var として注入する場合は、原則 `latest` ではなく version 番号に pin する。
- secret 更新は「新 version 作成 -> Cloud Run 新 revision -> 動作確認 -> 旧 version disable -> 後日 destroy」の順にする。
- production / preview / development は別 secret にする。
- `.env` はローカル専用。Git には `.env.example` だけ置く。

### 推奨 secret 名

| Secret Manager 名 | Cloud Run env 名 | 用途 | ローテーション目安 | 注意 |
| --- | --- | --- | --- | --- |
| `sevenboard-prod-database-url` | `DATABASE_URL` | Prisma DB 接続 | 180日または退職/漏えい時 | DB 側で新 credential 作成後に切替 |
| `sevenboard-prod-jwt-secret` | `JWT_SECRET` | JWT 署名 | dual-key 実装後 90-180日 | 現状 rotate すると全員再ログイン |
| `sevenboard-prod-mf-client-secret` | `MF_CLIENT_SECRET` | MoneyForward OAuth client secret | 90-180日 | MF 管理画面で再発行 |
| `sevenboard-prod-mf-token-encryption-key` | `MF_TOKEN_ENCRYPTION_KEY` | DB 内 MF token 暗号化 | key version 実装後 | 現状いきなり rotate しない |
| `sevenboard-prod-google-ai-api-key` | `GOOGLE_AI_API_KEY` | Gemini API | 90日 | API key 制限をかける |
| `sevenboard-prod-anthropic-api-key` | `ANTHROPIC_API_KEY` | Claude API | 90日 | 未使用なら登録しない |
| `sevenboard-prod-kintone-username` | `KINTONE_USERNAME` | Kintone Basic 認証 user | 必要時 | 可能なら API token 方式へ移行 |
| `sevenboard-prod-kintone-password` | `KINTONE_PASSWORD` | Kintone Basic 認証 password | 90日 | 共通 password は避ける |
| `sevenboard-prod-sentry-dsn` | `SENTRY_DSN` | API エラー監視 | 必要時 | DSN は高機密ではないが env 管理 |

### 通常 env var でよいもの

| Env 名 | 例 | 備考 |
| --- | --- | --- |
| `NODE_ENV` | `production` | 必須 |
| `PORT` | `3001` | Cloud Run は通常 `$PORT` を注入 |
| `CORS_ORIGIN` | `https://<vercel-domain>` | 複数なら comma 区切り |
| `MF_CLIENT_ID` | `<client-id>` | secret ではないが公開しない |
| `MF_REDIRECT_URI` | `https://<cloud-run-url>/auth/mf/callback` | MF 側登録値と完全一致 |
| `MF_MCP_URL` | `https://beta.mcp.developers.biz.moneyforward.com/mcp/ca/v3` | 固定値 |
| `AI_PROVIDER` | `gemini` | `claude` / `gemini` |
| `KINTONE_BASE_URL` | `https://<subdomain>.cybozu.com` | 固定値 |
| `KINTONE_MONTHLY_APP_ID` | `139` | 固定値 |
| `KINTONE_CUSTOMER_APP_ID` | `16` | 固定値 |

## Hiroki 側でやること

### 1. Cloud Run service account を作る

推奨:

```text
sevenboard-api-prod@<project-id>.iam.gserviceaccount.com
```

この service account を Cloud Run API service の実行 identity にする。

付与する権限:

- Secret Manager Secret Accessor: 必要な secret 単位で付与
- Cloud Logging 書き込み: Cloud Run 標準で利用
- 追加の Google API を使う場合は、その API に必要な最小権限だけ付与

避けること:

- project 全体の Owner / Editor
- デフォルト Compute Engine service account の使い回し
- service account key JSON の発行
- Cloud Run への `GOOGLE_APPLICATION_CREDENTIALS` 設定

### 2. Secret Manager に production secret を登録する

登録対象:

- `DATABASE_URL`
- `JWT_SECRET`
- `MF_CLIENT_SECRET`
- `MF_TOKEN_ENCRYPTION_KEY`
- `GOOGLE_AI_API_KEY` または `ANTHROPIC_API_KEY`
- `KINTONE_USERNAME`
- `KINTONE_PASSWORD`
- `SENTRY_DSN`

生成目安:

```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -hex 32      # MF_TOKEN_ENCRYPTION_KEY, 64 hex chars
```

### 3. Cloud Run に secret を version pin で注入する

例:

```bash
gcloud run services update sevenboard-api \
  --region asia-northeast1 \
  --service-account sevenboard-api-prod@<project-id>.iam.gserviceaccount.com \
  --update-secrets DATABASE_URL=sevenboard-prod-database-url:1,JWT_SECRET=sevenboard-prod-jwt-secret:1,MF_CLIENT_SECRET=sevenboard-prod-mf-client-secret:1,MF_TOKEN_ENCRYPTION_KEY=sevenboard-prod-mf-token-encryption-key:1,GOOGLE_AI_API_KEY=sevenboard-prod-google-ai-api-key:1,KINTONE_USERNAME=sevenboard-prod-kintone-username:1,KINTONE_PASSWORD=sevenboard-prod-kintone-password:1,SENTRY_DSN=sevenboard-prod-sentry-dsn:1
```

注意:

- `--set-env-vars` は既存 env を置き換える動きがあるため、実行前に現在設定を確認する。
- secret は `latest` ではなく version 番号を使う。
- secret 更新後は Cloud Run revision が作られるため、traffic split / rollback を使える。

### 4. Vercel の環境変数を Cloud Run 向けにする

Vercel production:

```text
NEXT_PUBLIC_API_URL=https://<cloud-run-api-url>
```

Vercel 側では production / preview / development を分ける。

### 5. MoneyForward OAuth redirect URI を Cloud Run に変更する

MF 管理画面で次を登録する。

```text
https://<cloud-run-api-url>/auth/mf/callback
```

Cloud Run env の `MF_REDIRECT_URI` も同じ値にする。

### 6. 既存 secret を rotate する

今回ローカル `.env` に実値が確認されたため、次は rotate 推奨。

- Google AI API key
- MoneyForward client secret
- Kintone password
- 必要に応じて DB password
- Railway に入れていた secret 全般

### 7. Railway を停止・削除する

Cloud Run 動作確認後:

1. Railway public domain へのアクセスログがないことを確認
2. Railway service を停止
3. Railway variables を削除
4. Railway service / project を削除または archive
5. Railway に入れていた secret を発行元で rotate

## Codex 側でやること

### A. Railway 残骸の削除

対象:

- 旧バックエンド実行基盤のrepo設定を削除
- `vercel.json` の旧バックエンドURL許可を削除
- `apps/web/vercel.json` の旧バックエンドURL許可を削除
- `docs/deploy-plan.md` の旧構成前提を Cloud Run 前提に更新
- `docs/railway-shutdown-runbook.md` を追加

完了条件:

- repo 内検索で旧バックエンドURLがCSPや運用手順から消えている
- Web CSP の `connect-src` が Cloud Run と必要な外部 API だけになっている

### B. 本番 env 検証を追加

API 起動時に production で fail-fast する。

必須:

- `JWT_SECRET`
- `DATABASE_URL`
- `CORS_ORIGIN`
- `MF_CLIENT_ID`
- `MF_CLIENT_SECRET`
- `MF_REDIRECT_URI`
- `MF_TOKEN_ENCRYPTION_KEY`

検証:

- `JWT_SECRET` が dev placeholder ではない
- `JWT_SECRET` が十分長い
- `MF_TOKEN_ENCRYPTION_KEY` が 64 hex chars
- `CORS_ORIGIN` が localhost だけではない
- `NODE_ENV=production` で `MF_ACCESS_TOKEN` が使われない

### C. Swagger を本番で閉じる

方針:

- production では default disabled
- 必要な場合だけ `ENABLE_SWAGGER=true`
- 可能なら Basic 認証または社内 IP 制限

対象:

- `apps/api/src/main.ts`

### D. CORS allowlist 化

方針:

- `CORS_ORIGIN` は comma 区切り allowlist
- production で未設定なら起動失敗
- request origin が allowlist に無い場合は拒否

対象:

- `apps/api/src/main.ts`

### E. Helmet 導入

API 側に最低限のセキュリティヘッダを追加する。

対象:

- `apps/api/package.json`
- `apps/api/src/main.ts`

注意:

- Swagger を有効化する dev 環境では CSP を調整する。

### F. CSRF と JWT 保存の見直し

段階 1:

- unsafe method で JWT cookie がある場合は CSRF header 必須
- CSRF cookie がない場合に通す挙動をやめる
- Bearer header bypass は開発/API client 用に限定するか廃止する

段階 2:

- Web の `localStorage` JWT 保存を廃止
- Cookie-only 認証へ移行
- `AuthGuard` は `/auth/me` による session 確認へ寄せる

対象:

- `apps/api/src/auth/csrf.guard.ts`
- `apps/web/src/lib/auth.ts`
- `apps/web/src/lib/api.ts`
- login/logout 周辺

### G. DB 保存 token の暗号化必須化

方針:

- production では `MF_TOKEN_ENCRYPTION_KEY` 未設定なら起動失敗
- `encryptIfAvailable` の production 平文 fallback を禁止
- 将来の key rotation 用に `keyVersion` / dual decrypt を設計

対象:

- `apps/api/src/common/crypto.util.ts`
- env validation
- Prisma schema は key version 実装時に検討

### H. 依存関係の脆弱性対応

短期:

- `next` を安全な patch/minor へ更新
- `axios` を安全な patch/minor へ更新
- build / test を確認

中期:

- NestJS 10 -> 11 を別ブランチで検証
- `@nestjs/platform-express`, `@nestjs/core`, `@nestjs/schedule`, `@nestjs/swagger` の audit 解消

### I. CI 強化

追加候補:

- `npm audit --omit=dev --audit-level=high`
- gitleaks または trufflehog による secret scan
- Cloud Run deploy 前の build/test gate

注意:

- secret scan は false positive を triage できるようにする。
- まずは PR で検出、main push で block の順に導入する。

### J. 監視・ログ

repo 側:

- Sentry 依存を入れるか、現在の optional require 方針を明確化
- API exception filter で本番時に DB 内部エラー詳細を返さない
- secret 値をログに出さない redaction 方針を追加

Hiroki 側:

- Cloud Logging alert を設定
- Secret Manager Data Access Logs を有効化
- Cloud Run 5xx / latency / instance restart の alert を設定
- MoneyForward OAuth failure / token refresh failure の alert を設定

## Railway 停止前チェックリスト

Cloud Run 側:

- [ ] `/health` が Cloud Run URL で 200
- [ ] login が Cloud Run API 経由で成功
- [ ] `/auth/me` が成功
- [ ] MoneyForward OAuth authorize URL が生成される
- [ ] MoneyForward callback が Cloud Run URL に戻る
- [ ] MF token refresh が成功
- [ ] Kintone monthly progress が取得できる
- [ ] AI summary / copilot が動く
- [ ] Prisma migration が Cloud Run deploy path で問題ない
- [ ] Cloud Run logs に secret 値が出ていない

Vercel 側:

- [ ] `NEXT_PUBLIC_API_URL` が Cloud Run URL
- [ ] CSP `connect-src` に Cloud Run URL がある
- [ ] CSP `connect-src` から Railway URL を削除済み
- [ ] production build が成功

MoneyForward 側:

- [ ] redirect URI が Cloud Run callback
- [ ] Railway callback URI を削除または無効化

Railway 側:

- [ ] Railway public endpoint への実アクセスがない
- [ ] Railway service 停止
- [ ] Railway variables 削除
- [ ] Railway に登録していた secret を rotate

## ローテーション手順

### DATABASE_URL

1. DB 側で新しい user/password を作成
2. Secret Manager に新 version を追加
3. Cloud Run を新 version に pin して deploy
4. health / login /主要 API を確認
5. 旧 DB credential を無効化
6. 旧 secret version を disable
7. 一定期間後に destroy

### JWT_SECRET

現状:

- rotate すると既存 JWT は無効になり、全ユーザー再ログインになる。

短期手順:

1. メンテナンス時間を決める
2. Secret Manager に新 version を追加
3. Cloud Run を新 version に pin
4. 全員再ログインを案内
5. 旧 version disable

中期改善:

- `JWT_CURRENT_KID`
- `JWT_SECRET_<kid>`
- verify は旧 key も許可、sign は新 key のみ
- TTL 経過後に旧 key を削除

### MF_CLIENT_SECRET

1. MoneyForward 管理画面で新 client secret を発行
2. Secret Manager に新 version を追加
3. Cloud Run deploy
4. OAuth authorize / callback / token refresh を確認
5. 旧 client secret を revoke
6. Railway に残っていた値も削除

### MF_TOKEN_ENCRYPTION_KEY

現状:

- この key は DB 内の encrypted token を復号するため、単純 rotate すると既存 token が読めなくなる。

短期:

- 漏えいが疑われる場合は MF OAuth 再接続を前提に rotate。

中期改善:

1. DB に key version を持たせる
2. decrypt は複数 key 対応
3. encrypt は current key のみ
4. background migration で既存 token を再暗号化
5. 旧 key を disable / destroy

### GOOGLE_AI_API_KEY

1. Google Cloud Console で新 key 作成
2. API 制限と利用元制限を設定
3. Secret Manager に新 version を追加
4. Cloud Run deploy
5. AI 機能確認
6. 旧 key を無効化

### KINTONE_PASSWORD

1. 専用ユーザーまたは API token 方式を検討
2. 新 password / token を発行
3. Secret Manager に新 version を追加
4. Cloud Run deploy
5. Kintone 取得/更新を確認
6. 旧 password を無効化

## 実施順序

### Phase 0: 移行後の漏えい面を閉じる

担当: Hiroki + Codex

1. Vercel が Cloud Run を向いていることを確認
2. MF redirect URI を Cloud Run に変更
3. Cloud Run health / login / MF / Kintone / AI を確認
4. Railway を停止
5. Railway secret を rotate
6. repo から Railway 設定を削除

### Phase 1: Cloud Run secret 管理を固める

担当: Hiroki

1. Secret Manager に production secret を登録
2. Cloud Run service account を user-managed に変更
3. secret 単位で accessor 付与
4. Cloud Run env secret を version pin
5. Cloud Logging / Secret Manager audit log を有効化

### Phase 2: API の防御面を強化

担当: Codex

1. env validation
2. Swagger production disabled
3. CORS allowlist
4. Helmet
5. CSRF strict
6. production error response sanitization

### Phase 3: 認証を Cookie-only へ寄せる

担当: Codex

1. Web の `localStorage` JWT 保存廃止
2. API client は `credentials: include` 前提
3. session hydrate は `/auth/me`
4. logout は Cookie clear と client state clear
5. CSRF header を unsafe method に必須化

### Phase 4: 依存関係と CI

担当: Codex

1. `next` / `axios` update
2. API/Web build
3. API test
4. `npm audit --omit=dev --audit-level=high`
5. secret scan CI
6. NestJS major update を別 PR で検証

### Phase 5: 鍵ローテーション可能な構造へ

担当: Codex + Hiroki

1. JWT dual-key
2. MF token encryption key versioning
3. DB token re-encryption migration
4. ローテーション手順を runbook 化

## すぐに Codex が着手すべき repo 変更

優先順:

1. Railway 削除と CSP 更新
2. Cloud Run/Secret Manager 前提の env validation
3. Swagger production disabled
4. CORS allowlist
5. Helmet
6. `MF_TOKEN_ENCRYPTION_KEY` production 必須化
7. `next` / `axios` update
8. CI に audit / secret scan
9. Cookie-only 認証移行

## Hiroki が先に決める必要がある値

Codex が実装する前に、次が分かると手戻りが減る。

```text
GCP project id:
Cloud Run service name:
Cloud Run region:
Cloud Run API URL:
Vercel production URL:
MoneyForward registered redirect URI:
Secret Manager naming prefix:
Production service account email:
AI provider: gemini or claude
```

## 参考公式ドキュメント

- Cloud Run secrets: https://docs.cloud.google.com/run/docs/configuring/services/secrets
- Cloud Run environment variables: https://docs.cloud.google.com/run/docs/configuring/services/overview-environment-variables
- Secret Manager best practices: https://docs.cloud.google.com/secret-manager/regional-secrets/best-practices-rs
- GitHub push protection: https://docs.github.com/code-security/secret-scanning/protecting-pushes-with-secret-scanning
- OWASP Secrets Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
