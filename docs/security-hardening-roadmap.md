# Security Hardening Roadmap (外販前)

作成日: 2026-04-30

## 目的

SevenBoard を SEVENRICH 内部利用から外部会計事務所への提供（外販）に切り替える前に、セキュリティを「会計データを預かる SaaS」として通用するレベルまで引き上げる。

このドキュメントは「いま何をすべきか」の判断材料。具体的な実装手順は別途 spec / PR で詰める。

## 現状（2026-04-30 時点）

```text
✓ Cloud Run 専用 service account + Secret Manager + version pin
✓ Multitenancy (tenant_id) を全業務テーブルに導入、複合 FK で参照制約
✓ Permission catalog (firm_owner / admin / advisor / viewer / CL viewer)
✓ AuthorizationService + PermissionGuard で route-level 認可
✓ Vercel + Cloud Run + Supabase の本番 stack 構成
✓ MF OAuth token は AES-GCM で暗号化保存 (MF_TOKEN_ENCRYPTION_KEY)
```

## 想定脅威（外販後の優先度順）

```text
1. 内部不正
   退職スタッフ・同業者・採用された敵対者がデータを持ち出す
2. テナント越境
   firm_advisor が他事務所の CL を見えてしまう実装バグ
3. 認証情報盗難
   phishing / XSS / セッション乗っ取りで権限が奪われる
4. サプライチェーン
   npm 依存パッケージが compromise されて malicious code が混入
5. 監査未対応
   インシデント発生時に「いつ・誰が・何を見たか」が再現できない
6. 顧客監査要求
   SOC2 / ISO 27001 / プライバシーマーク等の証跡要求
```

---

## 推奨施策 9 件

### 1. PostgreSQL Row Level Security (RLS) — ★★★★★

**狙い**: tenant_id の分離を DB 層に下ろす。アプリのバグが起きても DB が他テナントを返さない。

**今のリスク**:
route-level の `PermissionGuard` だけが防壁。誰かが `where tenantId` を入れ忘れたクエリを書くと、コードレビュー漏れ → そのまま他テナントの数値が返る事故が起きる。

**やること**:
- 全業務テーブルに RLS policy を貼る `USING (tenant_id = current_setting('app.current_tenant')::uuid)`
- Prisma middleware で各リクエスト前に `SET LOCAL app.current_tenant = $1`
- 既存クエリで tenantId 抜けてる箇所を 500 で発覚させ、段階的に修正

**実装規模**: 2-3 日

**リスク**: 既存クエリで tenantId 渡し漏れがあれば即 500 になる → staging で総当たり検証してから本番投入

---

### 2. JWT を localStorage → HttpOnly Cookie に移す — ★★★★

**狙い**: XSS が起きても認証 token が JS から取れないようにする。

**今のリスク**:
JWT を `localStorage` に保存しているため、何らかの XSS（例えば CL 側ユーザーが入力した値の display escaping ミス）が起きた瞬間、攻撃者が `localStorage.getItem('token')` で奪える。

**やること**:
- API: `res.cookie('token', jwt, { httpOnly: true, secure: true, sameSite: 'strict' })`
- Web: `Authorization: Bearer ${token}` の代わりに `credentials: 'include'` で cookie 自動送信
- Logout を server 側に持つ (Redis に `jti` blacklist で即時失効可能に)

**実装規模**: 1-2 日

**注意**: Vercel ↔ Cloud Run 間で cookie が通るように `SameSite=Lax` か独自ドメインへの統合を検討。CSP の `frame-ancestors`、CORS の `Access-Control-Allow-Credentials` 等の設定もセット。

---

### 3. TOTP / 2FA を事務所スタッフに必須化 — ★★★★

**狙い**: phishing で password が抜かれても 2 段目が止める。

**今のリスク**:
email + password 単独。phishing 訓練を受けてないスタッフが偽サイトに credentials を入力したら一発で侵入される。

**やること**:
- `firm_owner / firm_admin / firm_advisor / firm_manager` に TOTP 必須
- `firm_viewer` と CL ユーザーは任意（強制すると CL 側の導入摩擦増）
- バックアップコード (10 個生成、表示は 1 回のみ)
- TOTP リセットは tenant_owner のみ

**実装規模**: 2-3 日（otplib + 強制設定画面 + リセットフロー）

**ライブラリ**: `otplib` か `speakeasy` + `@nestjs/throttler` 併用（連続失敗で lockout）

---

### 4. Cloud Audit Logs (Data Access) を全 sensitive リソースで有効化 — ★★★

**狙い**: インシデント時に「誰が・いつ・何を読んだか」を再現可能にする。

**今のリスク**:
Cloud Run の HTTP request log はあるが、`Secret Manager の secret 読み取り`、`Supabase の特定テーブル read` は監査ログに残らない。インシデント発生時に「漏洩の時刻と範囲」が特定できない。

**やること**:
- Cloud Audit Logs の Data Access Logs を Secret Manager / Cloud SQL / Cloud Run で `ADMIN_READ + DATA_READ + DATA_WRITE` 全部有効化
- BigQuery sink で immutable storage（write-once）に保存
- retention: 90 日 (運用) / 1 年 (法務) / 7 年 (税務監査) で階層保管
- アプリ側: 業務的に重要な操作 (export / 設定変更 / 削除) は独自 audit_logs テーブルにも記録

**実装規模**: 半日（GCP 設定中心）

**コスト**: BigQuery storage 月数百〜数千円程度

---

### 5. Workload Identity Federation で SA key を撲滅 — ★★★

**狙い**: GCP の認証鍵を 1 つも発行しない運用に切り替え、鍵漏洩リスクを構造的にゼロにする。

**今のリスク**:
Cloud Run 内では service account identity が自動付与されるので OK。だが GitHub Actions / 外部 CI から GCP にアクセスする運用が始まると、`SA key (.json)` を発行して repo の secret に格納する罠にハマりがち（key が漏れたら GCP 全リソースアクセス可）。

**やること**:
- Workload Identity Pool + Provider を作成
- GitHub Actions の OIDC token を GCP IAM が直接信頼するよう設定
- `roles/iam.workloadIdentityUser` を該当 SA に付与
- GitHub Actions yaml で `google-github-actions/auth@v2` を `workload_identity_provider` で使う

**実装規模**: 半日（GitHub Actions 導入とセット）

**今すぐ必須ではない理由**: 現状 deploy は手動 `gcloud run deploy` のため SA key を発行していない。GitHub Actions / Cloud Build 自動化を始める前に必ずこちらで導入する。

---

### 6. Sentry + Cloud Monitoring 異常検知 alert — ★★★

**狙い**: 攻撃や障害を「気づく」までの時間を分単位に圧縮する。

**今のリスク**:
能動的な alert がない。Cloud Run logs は事後 grep だけ。攻撃に気づくのが翌朝、最悪は顧客から連絡で知る運用。

**やること**:
- Sentry を API + Web に導入し、Slack に即時通知
- Cloud Monitoring で alert を作成:
  - Cloud Run 5xx 率の急増
  - 連続 login 失敗のスパイク (brute force 検知)
  - Secret Manager Data Access の異常パターン (例: 業務時間外の読み取り)
  - DB connection エラーの継続発生
- アプリ側: 同一ユーザーの「異常時間帯ログイン」「異常 IP」「短時間に大量データ export」を検知して本人と admin にメール

**実装規模**: Sentry 1 時間 + Monitoring alert 半日 + アプリ側異常検知 1-2 日

**コスト**: Sentry Team plan $26/mo もしくは無料枠で開始可

---

### 7. アプリ層の防御ヘッダ整備 (Helmet + CSP + /api-docs 本番無効化) — ★★

**狙い**: XSS / clickjacking / sniffing 等の典型攻撃の被害最小化。

**今のリスク**:
- Helmet 相当の防御ヘッダが付いていない
- CSP が無いか緩い → XSS 連鎖の被害が広がる
- `/api-docs` (Swagger UI) が本番で常時公開 → API 表面を攻撃者が把握可能

**やること**:
- API: `app.use(helmet({ contentSecurityPolicy: { directives: { ... } } }))`
- Web: Next.js の middleware で CSP / X-Frame-Options / Strict-Transport-Security を強化
- `/api-docs` は `if (process.env.NODE_ENV !== 'production')` でガード or basic auth でロック
- CORS の origin は完全一致のみ（regex / wildcard 禁止）、preflight で credentials も明示

**実装規模**: 半日

---

### 8. Snyk / Dependabot で依存脆弱性の自動 PR — ★★

**狙い**: npm 依存パッケージの既知脆弱性が放置されないようにする。

**今のリスク**:
`npm audit --omit=dev` で既知脆弱性が複数検出されている状態（cloud-run-security-plan.md 記載）。手動 update が後手に回ると、有名 CVE が放置される。

**やること**:
- GitHub Dependabot を有効化（無料）
- Snyk を併用すると license / supply-chain audit も追加可能（Open Source $0 / Team $25 月）
- 本番影響の大きい依存は週次レビューで mass update する運用に
- pre-commit hook で `npm audit` を fail-fast

**実装規模**: 1-2 時間で導入、運用は週次 30 分

---

### 9. CMEK (Customer-Managed Encryption Keys) — ★★ (将来)

**狙い**: 「Google の運用エンジニアでも復号できない」レベルの暗号化分離。

**今のリスク**:
Secret Manager / Cloud SQL / Cloud Storage はデフォルトで Google 管理鍵による暗号化。要件によっては「Google 内部の人にも見せない」レベルが求められる（金融機関監査、プライバシーマーク追加要件、医療系）。

**やること**:
- Cloud KMS で keyring + key を作成、HSM-backed key を採用
- Secret Manager / Cloud SQL / Storage の暗号化に CMEK を指定
- 鍵 rotation 周期を明示（90 日 or 365 日）
- 鍵管理担当者の二重承認フローを CMEK 削除には設定

**実装規模**: 1 週間（GCP 側 + アプリ側影響範囲調査込み）

**コスト**: KMS key 月 $0.06/key、HSM key 月 $1〜$3、ops cost 大

**今すぐ必須でない理由**: 顧客から明示的に要求されない限り過剰。最初の大手契約で要件に出たら導入。

---

## 追加で検討する価値があるもの（番外）

```text
- IP allow-list (Cloud Armor) for /admin endpoints
- IAP (Identity-Aware Proxy) で運営者用画面を社内 IP + Google アカウントで制限
- SAST (Semgrep, CodeQL) を CI に組み込む
- DAST (OWASP ZAP) を staging に対して定期実行
- 暗号化キーの定期 rotation 自動化 (Cloud Function + Scheduler)
- 退職時オフボーディング手順書 (アクセス即時剥奪、TOTP 端末回収、IAM 監査)
- 顧問先データの export / 削除 (GDPR / 個人情報保護法対応)
- 監査用 read-only アカウントの分離 (税理士本人 / 監査法人用)
- バックアップの暗号化検証 + 別 region 保管
- DR 手順書 (RTO/RPO 定義、年 1 復旧訓練)
- Bug bounty プログラム (HackerOne 等、外販後の自然な信頼蓄積)
```

---

## 推奨ロードマップ

### Phase A: すぐ入れる（1〜2 週間で完了可）

```text
[7] Helmet + CSP + /api-docs 本番無効化   半日
[6] Sentry 導入 + 基本 alert              1 日
[4] Cloud Audit Logs 有効化               半日
[8] Dependabot 有効化                     30 分
```

体感安全度が一段上がる。外販前のミニマムベース。

### Phase B: 外販前に必ず（1 ヶ月以内）

```text
[1] PostgreSQL RLS                        2-3 日
[2] JWT → HttpOnly Cookie                 1-2 日
[3] 2FA / TOTP                            2-3 日
[6] 異常検知 alert (Phase A の発展)        1-2 日
```

「会計事務所の外注先が他事務所のデータ覗ける」事故を構造的にゼロにする。

### Phase C: 業務拡大期（3 ヶ月以内）

```text
[5] Workload Identity Federation          半日 (GitHub Actions 導入とセット)
[8] Snyk Team plan + 週次運用             運用フロー確立
番外: SAST / DAST CI 組み込み              数日
番外: 退職時オフボーディング手順書          1 日 (記述のみ)
```

### Phase D: 大手契約 / 監査要件発生時

```text
[9] CMEK                                  1 週間
番外: IAP / Cloud Armor                    数日
番外: Bug bounty                           半年単位の運用
番外: SOC 2 / ISMS 認証取得                半年〜1 年プロジェクト
```

---

## 判断指針

### ROI が一番高いのは Phase B [1] RLS

外販後に「他事務所のデータが見えた」事故が出た瞬間に SaaS は終わる。コードレビューで完全に防ぐのは現実的でないので、DB 層で最後の砦を作る効果が圧倒的に高い。

### 一番後回しでよいのは Phase D [9] CMEK

要件として明示されない限り導入コストに見合わない。要求されたタイミングで対応で十分。

### 着手しても効果出にくいもの

- WAF (Cloud Armor) — 攻撃パターンが多様なので tuning コスト高、初期は Sentry + rate limit で代替できる
- 専任 SOC — 月数十万のランニング、初期は alert + 開発チームの当番で十分

---

## 関連ドキュメント

- [cloud-run-security-plan.md](./cloud-run-security-plan.md) — 既存の Cloud Run 移行時セキュリティ要件
- [multitenancy-architecture.md](./multitenancy-architecture.md) — マルチテナント設計の全体像
- [secret-rotation-guide.md](./secret-rotation-guide.md) — 既存 secret の rotate 手順
- [production-handoff-values-20260430.md](./production-handoff-values-20260430.md) — 現在の本番環境値
