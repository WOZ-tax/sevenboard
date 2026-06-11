# デプロイ前 runbook — オールオーバーレビュー追補バッチ (2026-06-11)

ブランチ `fix/allover-review-followup`（4コミット）。元レビュー(`docs/allover-review-20260602.md`)の残り指摘を実装。
検証済み: API `tsc` クリーン / web `tsc` クリーン / `jest` 136/136 green。

## コミット
| commit | 概要 |
|---|---|
| `85fa797` 正確性 | FY⇄暦年を**期末年に統一**(共有util `fiscal-period.util` + sync/journal-review/health-snapshots) / `getJournals` ページネーション欠落 / MFトークン復号の平文フォールバック(6/2全断の再発条件解消) / L3スキャンに RateLimitGuard / main.ts(trust proxy・shutdown・Swagger本番無効) / `navigableUrl` の javascript: XSS |
| `cb33e25` 残り指摘 | sync の握り潰しSUCCESS明示化・tax_value反映・endDate TZ / AI融資予算のLLM金額をサーバ値で上書き+検証 / seedフェイルオープン是正+drift修正 / CI(master修正・deploy-db手動化・起動時migrate既定オフ) / CSRF・Throttler全体・SSRF・budgets IDOR・承認/締めの状態遷移ガード / org切替でperiod・copilotリセット+capability gating |
| `c7521c8` 安全強化 | cashflow no-forecast→UNKNOWN / JWT 30d→24h / briefing冪等化 / RateLimitGuardスイープ / chosho AGING_3M を monthOrder基準に |
| `d58c407` テナント監査 | Prisma `$use` tenant-scope-audit(warn既定・`TENANT_SCOPE_AUDIT=throw`で強制) |

---

## A. デプロイ前に必須（人手・設定）
1. **GitHub `production-db` environment を作成**し required reviewers を登録。
   - `deploy-db.yml` を手動実行(workflow_dispatch)＋承認ゲート化したため、environment 未作成だとゲートが空振りする。
2. **マイグレーション運用の周知**: 起動時 `prisma migrate deploy` を**既定オフ**化した(`scripts/start.sh`)。
   - スキーマ反映は (a) `deploy-db` を手動実行(confirm=`MIGRATE`) か (b) `RUN_MIGRATIONS=true` で1回起動、のいずれか。自動では走らない。
3. **環境変数の確認**:
   - 本番で `SEED_DEMO` は**未設定**のまま（デモ管理者を作らない。`seed.ts` は既定 no-op に反転済）。
   - `TENANT_SCOPE_AUDIT` 未設定=warn（ログのみ）。テナントスコープ欠落の警告ログを観察。強制したくなったら `throw`。
   - `JWT_EXPIRES_IN` 未設定=24h（Cookie maxAge と整合）。

## B. デプロイ後に確認（実機 / 本格稼働前なので軽め）
4. **各社の同期を1回ずつ再実行**。FY期末統一の修正で月が正しく再生成される（手動のデータ掃除は不要＝再生成される）。
   - 特に**非12月決算**の会社で、実績・スナップショットの月が1年ズレていないか数社チェック。
5. **挙動が変わった画面をクリック確認**:
   - 月次承認は `submit → approve` 必須（未提出からの即承認は 400）。
   - 月次締めの `CLOSED → OPEN` は理由(note)必須（無いと 400）。
   - 組織切替で前の会社の期間・Copilot会話が残らない。
   - `firm_admin` / `firm_manager` で `/advisor` に入れる。
   - JWT 24h 化後もログイン／`/auth/refresh` が正常。
   - budgets の保存が正常（IDOR検証・month正規化を追加）。

## C. 既知の挙動変更（フロント契約）
- `cashflow.getRunway` が forecast 未作成時に `alertLevel:'UNKNOWN'` / `cashBalance:null` / `runwayMonths:null` を返す。フロントの数値表示は null を許容すること。
- 承認/締めの不正遷移は 400/409 を返す（旧: 無条件成功）。

## D. 今回スコープ外（インフラ/DB検証が前提・別途）
- **トークンの httpOnly cookie 一本化**: web(Vercel)↔API(Cloud Run) がクロスサイト(`sameSite:'none'`)のため、JWT cookie はサードパーティ cookie 扱い。localStorage Bearer がクロスサイト認証の実働経路で、消すと本番認証が壊れる。同一レジストラブルドメイン化(インフラ)が前提。
- **真の Postgres RLS**: ポリシー+非バイパスロール+リクエスト毎 session 変数。実DB検証必須。当面は tenant-scope-audit(warn) を前段に運用。

## ロールバック
- API は手動デプロイ。問題時は前リビジョンへ Cloud Run でロールバック。
- 本バッチはDBマイグレーションを含まない（seed/schema コメント・コード変更のみ）ため、コードのロールバックのみで戻せる。
