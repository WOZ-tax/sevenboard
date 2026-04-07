# SevenBoard デプロイ計画

## インフラ構成

```
[Vercel]              [Railway]             [Neon]
 Next.js 16      ───→  NestJS API      ───→  PostgreSQL
 app.sevenboard.jp     api.sevenboard.jp     ap-southeast-1
```

## サービス選定

| 層 | サービス | プラン | 理由 |
|---|---|---|---|
| フロント | Vercel | Hobby/Pro共有 | Next.js公式、TaskChain実績、WOZ-tax org |
| バックエンド | Railway | Hobby $5/月 | 常時起動、モノレポ対応、Preview Deploy |
| DB | Neon | Free 0.5GB | ブランチ機能（PR毎にDB分岐）、Prisma公式対応 |
| Redis | Upstash | Free 10K/日 | サーバーレス |
| 監視 | Sentry | Developer Free | 5Kエラー/月 |
| 死活監視 | UptimeRobot | Free | 50モニター、5分間隔 |

## コスト見積もり

| Phase | 月額 | 想定規模 |
|---|---|---|
| Phase 1（MVP） | $5〜26 | 開発・デモ |
| Phase 2 | ~$66 | 顧問先5-10社 |
| Phase 3 | $150-300 | 本格運用 |

## 環境設計

| 環境 | フロント | バックエンド | DB |
|---|---|---|---|
| dev | localhost:3000 | localhost:3001 | docker-compose |
| staging | Vercel Preview | Railway Preview | Neon branch |
| production | Vercel Production | Railway Production | Neon main |

## 環境変数

```env
# === Database ===
DATABASE_URL=postgresql://...

# === API ===
JWT_SECRET=                    # 本番はランダム64文字以上
API_PORT=3001
CORS_ORIGIN=                   # フロントのURL
NODE_ENV=                      # development | staging | production

# === MoneyForward OAuth ===
MF_API_BASE_URL=https://accounting.moneyforward.com/api/v3
MF_ACCESS_TOKEN=               # dev only
MF_CLIENT_ID=
MF_CLIENT_SECRET=
MF_REDIRECT_URI=
MF_TOKEN_ENCRYPTION_KEY=       # AES-256 暗号化キー

# === Frontend ===
NEXT_PUBLIC_API_URL=

# === Redis ===
REDIS_URL=

# === Sentry ===
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
```

## Phase 1: インフラ基盤構築（1-2日）

### 1.1 Neon プロジェクト作成
- neon.tech でプロジェクト作成（リージョン: ap-southeast-1）
- `prisma migrate deploy` でスキーマ適用
- 接続文字列を控える

### 1.2 Railway プロジェクト作成
- GitHubリポジトリ連携
- Root Directory: `apps/api`
- 環境変数設定（DATABASE_URL, JWT_SECRET, CORS_ORIGIN等）
- ヘルスチェックエンドポイント追加

### 1.3 Vercel プロジェクト作成
- WOZ-tax org に新プロジェクト追加
- Root Directory: `apps/web`
- 環境変数設定（NEXT_PUBLIC_API_URL）

### 1.4 必要なコード変更

```
新規作成:
  apps/api/src/health/health.controller.ts   ← GET /health
  apps/api/src/health/health.module.ts
  railway.json                               ← Railway設定
  apps/web/vercel.json                       ← Vercel設定

更新:
  apps/api/src/app.module.ts                 ← HealthModule追加
  .env.example                               ← 全変数テンプレート
```

#### Railway設定 (`railway.json`)
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm ci && npm run build -w apps/api"
  },
  "deploy": {
    "startCommand": "node apps/api/dist/main",
    "healthcheckPath": "/health",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

#### Vercel設定 (`apps/web/vercel.json`)
```json
{
  "framework": "nextjs",
  "installCommand": "npm ci",
  "buildCommand": "npm run build -w apps/web"
}
```

## Phase 2: CI/CD整備（1日）

### 2.1 GitHub Actions

```
.github/workflows/
  ci.yml           ← PR時: lint, build, type-check
  deploy-db.yml    ← main merge時: prisma migrate deploy
```

#### CI (`ci.yml`)
- トリガー: PR to main, push to main
- ステップ: npm ci → prisma generate → lint + build + test（並列）

### 2.2 デプロイフロー

```
feature branch
  │ PR作成
  ▼
[CI] lint+build+test ─── [Vercel] Preview Deploy（自動）
                          [Railway] Preview Deploy（自動）
                          [Neon] Branch DB（自動）
  │ PR merge to main
  ▼
[CI] lint+build+test ─── [Vercel] Production Deploy（自動）
                          [Railway] Production Deploy（自動）
                          [Neon] main に migrate deploy
```

### 2.3 DBマイグレーション戦略
- 開発: `prisma migrate dev`（ローカルdocker-compose）
- staging/production: GitHub Actionsから `prisma migrate deploy`
- マイグレーションファイルはgitにコミット

## Phase 3: セキュリティ・監視強化（1-2日）

### 3.1 OAuthトークン暗号化
- `apps/api/src/common/crypto.util.ts` — AES-256-GCM
- MfApiServiceのトークン読み書き時にencrypt/decrypt
- `MF_TOKEN_ENCRYPTION_KEY` 環境変数

### 3.2 Sentry導入
- `@sentry/nextjs`（web）、`@sentry/nestjs`（api）
- DSN設定

### 3.3 Security Headers
- `next.config.ts` に CSP, X-Frame-Options, HSTS

### 3.4 カスタムドメイン
- `app.sevenboard.jp` → Vercel
- `api.sevenboard.jp` → Railway

### 3.5 死活監視
- UptimeRobot: `/health` と フロントTOPの2つ

## MCP化オプション（将来）

Claude CodeからSevenBoardをネイティブに使いたい場合:

```
apps/api/src/mcp/
  mcp.controller.ts     ← MCPプロトコル対応
  mcp.service.ts        ← 既存サービスをMCPツールとしてラップ
```

既存のMfApiService, MfTransformService, ReportsServiceをそのまま再利用。
サービス層の変更不要。薄いラップ層を1枚追加するだけ。
