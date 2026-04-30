# Secret 変更マニュアル（初心者向け）

最終更新: 2026-04-30

このドキュメントは「Cloud Run の secret（DB password、API key、JWT 秘密鍵など）を変えたい時にどうするか」を、コマンドのコピペで完結する形で書いた手順書です。

## 前提知識（最初の 1 分）

SevenBoard の secret は 2 つの場所にある:

```text
1. Google Secret Manager
   実際の値が入ってる場所。version 1, 2, 3... と履歴で管理されてる。

2. Cloud Run の環境変数 (DATABASE_URL=secret:sevenboard-prod-database-url:2 みたいな参照)
   「Secret Manager の version 2 を使え」と指示してるだけ。値そのものは持ってない。
```

つまりキーを変える = **「Secret Manager に新しい version を作る」 → 「Cloud Run の参照を新 version に向ける」 → 「動作確認後、古い version を disable」** の 3 ステップ。

---

## 共通の事前準備（1 回だけ）

ターミナルで gcloud にログインしてること、project が sevenboard を向いてることだけ確認。

```powershell
gcloud auth list
gcloud config set project sevenboard
```

---

## パターン A: 値を入力すれば済む鍵を変える

JWT_SECRET、MF_TOKEN_ENCRYPTION_KEY のような「自分でランダム生成して入れる」鍵向け。

### 手順 1. 新しい値を生成

```powershell
# JWT_SECRET の場合（48 バイトの強い乱数）
$NEW_VALUE = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))

# MF_TOKEN_ENCRYPTION_KEY の場合（64 文字の hex）
$NEW_VALUE = -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
```

`$NEW_VALUE` に新しい値が入った状態で次へ。

### 手順 2. Secret Manager に新 version を追加

```powershell
$NEW_VALUE | & gcloud secrets versions add sevenboard-prod-jwt-secret --data-file=-
```

→ `Created version [N] of the secret [...]` と出る。`N` の数字を控える（次のステップで使う）。

### 手順 3. Cloud Run の参照を新 version に切替

```powershell
# N は手順 2 で控えた数字
gcloud run services update sevenboard-api `
  --region asia-northeast1 `
  --update-secrets JWT_SECRET=sevenboard-prod-jwt-secret:N
```

→ 数分で新 revision が立ち上がる。

### 手順 4. 動作確認

ブラウザで https://sevenboard-nine.vercel.app/ にログイン → ダッシュボードが開けば成功。

JWT_SECRET を変えた場合、**既存ユーザー全員のログインセッションが切れる**ので一回ログインし直す必要がある。

### 手順 5. 古い version を disable

問題なければ古い version を無効化（万一ロールバックしたい時のために destroy はしない）。

```powershell
# (N-1) は disable 対象。例えば今 v3 にしたなら v2 を disable
gcloud secrets versions disable (N-1) `
  --secret=sevenboard-prod-jwt-secret
```

---

## パターン B: 外部システムで再発行が必要な鍵を変える

DATABASE_URL（Supabase）、MF_CLIENT_SECRET（MF パートナー管理画面）、GOOGLE_AI_API_KEY（Google AI Studio）、KINTONE_PASSWORD（kintone 管理画面）など。

### 手順 1. 外部側で再発行

| 何を変える | どこで再発行 |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | Supabase Dashboard → Settings → Database → "Reset database password" |
| `MF_CLIENT_SECRET` | MF パートナー管理画面 → アプリケーション → SevenBoard → "Client Secret 再発行" |
| `GOOGLE_AI_API_KEY` | https://aistudio.google.com/ → API key → 該当 key の "Regenerate" |
| `KINTONE_USERNAME` / `KINTONE_PASSWORD` | https://plvu6.cybozu.com/ → ユーザー管理 → 該当アカウントのパスワード変更 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → "Reset service_role key" |

→ 新しい値が表示される。**ここでだけ表示される値もあるので必ずコピー**。

### 手順 2. Secret Manager に新 version を追加（パスワードを安全に投入）

PowerShell で値を変数に入れて、stdin で gcloud に渡す:

```powershell
$NEW_VALUE = Read-Host -AsSecureString "新しい値を貼って"
$Plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($NEW_VALUE)
)
$Plain | & gcloud secrets versions add sevenboard-prod-mf-client-secret --data-file=-
Remove-Variable NEW_VALUE, Plain
```

`Read-Host -AsSecureString` は **画面に値が表示されない**ので肩越し撮影されても安全。

→ `Created version [N] of the secret [...]` の `N` を控える。

### DATABASE_URL を変えるときの注意

`DATABASE_URL` と `DIRECT_URL` の両方を更新する。Supabase password を変えると両方の URL に含まれる password 部分が変わる。新しい URL は Supabase Dashboard → "Connect" → "Connection string" タブからコピーできる。

```powershell
# DATABASE_URL (transaction pooler, port 6543)
$URL = Read-Host "新 DATABASE_URL"
$URL | & gcloud secrets versions add sevenboard-prod-database-url --data-file=-

# DIRECT_URL (session pooler, port 5432) — direct connection ではなく session pooler を使う
$URL = Read-Host "新 DIRECT_URL"
$URL | & gcloud secrets versions add sevenboard-prod-direct-url --data-file=-
```

### 手順 3. Cloud Run の参照を新 version に切替

```powershell
# 単独の secret だけ切替の場合
gcloud run services update sevenboard-api `
  --region asia-northeast1 `
  --update-secrets MF_CLIENT_SECRET=sevenboard-prod-mf-client-secret:N

# 複数同時 (DATABASE_URL と DIRECT_URL を一緒に切替) の場合はカンマ区切り
gcloud run services update sevenboard-api `
  --region asia-northeast1 `
  --update-secrets DATABASE_URL=sevenboard-prod-database-url:N,DIRECT_URL=sevenboard-prod-direct-url:N
```

### 手順 4. 動作確認 + 旧 version disable

パターン A の手順 4-5 と同じ。

---

## ロールバック（v2 で問題が出たので v1 に戻したい）

```powershell
# 1. 旧 version が disable されてたら enable
gcloud secrets versions enable 1 --secret=sevenboard-prod-jwt-secret

# 2. Cloud Run の参照を v1 に戻す
gcloud run services update sevenboard-api `
  --region asia-northeast1 `
  --update-secrets JWT_SECRET=sevenboard-prod-jwt-secret:1
```

新 revision で API が起動すれば ロールバック成功。

---

## 緊急対応: 鍵が外部に漏れた時

```text
1. 外部サービス側でまず鍵を無効化 (例: MF パートナー管理画面で client_secret 失効)
2. パターン B の手順 1〜3 で新しい鍵に切替
3. 旧 version を destroy (完全消去)
   gcloud secrets versions destroy 1 --secret=sevenboard-prod-mf-client-secret
4. アクセスログ確認:
   gcloud logging read 'resource.type="audited_resource" AND
     protoPayload.resourceName=~"secrets/sevenboard-prod-mf-client-secret"'
```

destroy は **不可逆**。disable は復活可能。普段は disable、漏洩時は destroy。

---

## 現在の secret 一覧

| Secret 名 | 何の鍵 | 再発行先 |
|---|---|---|
| sevenboard-prod-database-url | Supabase pooler URL (port 6543) | Supabase Connect モーダル |
| sevenboard-prod-direct-url | Supabase session pooler URL (port 5432) | Supabase Connect モーダル |
| sevenboard-prod-jwt-secret | JWT 署名鍵 | 自前生成 (openssl rand -base64 48) |
| sevenboard-prod-mf-client-secret | MF パートナー API クライアントシークレット | MF パートナー管理画面 |
| sevenboard-prod-google-ai-api-key | Gemini API キー | Google AI Studio |
| sevenboard-prod-kintone-username | kintone API 用ユーザー名 | kintone 管理画面 |
| sevenboard-prod-kintone-password | kintone API 用パスワード | kintone 管理画面 |
| sevenboard-prod-supabase-url | Supabase project URL | Supabase Settings → API |
| sevenboard-prod-supabase-service-role-key | Supabase service role key | Supabase Settings → API |

---

## トラブルシュート

### `Secret "..." contains non-UTF8 data` エラーで Cloud Run が起動しない

PowerShell の `cp932` で encode された値が Secret Manager に投入された時に発生。Python 経由で投入していた場合は `value.encode("utf-8")` を bytes として渡すこと。手動で投入する時は `Out-File -Encoding utf8` した一時ファイルから入れるか、PowerShell の `$Plain | gcloud secrets versions add` の素直な pipe で OK。

### `revision X failed to start within timeout`

ほぼ確実に secret 関連エラー。次のコマンドでログ確認:

```powershell
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.revision_name="sevenboard-api-XXXXX-yyy"' `
  --limit 30 --format="value(timestamp,textPayload)"
```

### `Permission denied to access secret`

Cloud Run の service account に `secretmanager.secretAccessor` 権限が無い。新しい secret を追加した時に `add-iam-policy-binding` を忘れがち:

```powershell
gcloud secrets add-iam-policy-binding sevenboard-prod-NEW-SECRET `
  --member "serviceAccount:sevenboard-api-prod@sevenboard.iam.gserviceaccount.com" `
  --role "roles/secretmanager.secretAccessor"
```

---

## 参考: 新しい secret を追加する時

例: `STRIPE_API_KEY` を追加する時。

```powershell
# 1. Secret Manager に登録
$KEY = Read-Host "Stripe API key"
$KEY | & gcloud secrets create sevenboard-prod-stripe-api-key `
  --replication-policy=automatic `
  --data-file=-

# 2. Cloud Run の SA に accessor 権限付与
gcloud secrets add-iam-policy-binding sevenboard-prod-stripe-api-key `
  --member "serviceAccount:sevenboard-api-prod@sevenboard.iam.gserviceaccount.com" `
  --role "roles/secretmanager.secretAccessor"

# 3. Cloud Run env に追加
gcloud run services update sevenboard-api `
  --region asia-northeast1 `
  --update-secrets STRIPE_API_KEY=sevenboard-prod-stripe-api-key:1
```
