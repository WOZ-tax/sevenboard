# SevenBoard 利用マニュアル

最終更新: 2026-05-01

このマニュアルは、新しい会計事務所（テナント）を SevenBoard に追加して、スタッフ招待 → 顧問先作成 → MF Cloud 連携 → 日常運用までをひと通り行うための手順書。

「自分はどの立場か」によって読む章が変わるので、まず下の役割表で自分の立場を確認する。

---

## 0. 役割と読むべき章

| 立場 | 何をする人か | 読むべき章 |
| --- | --- | --- |
| Platform 運営（SEVENRICH 内部） | SevenBoard の SaaS 運営者。新しい会計事務所をテナントとして追加する。 | 1, 2, 3, 8, 9 |
| 会計事務所オーナー（firm_owner） | 自事務所の契約者。スタッフ招待・顧問先追加・MF 連携をすべてやる権限がある。 | 1, 2, 4, 5, 6, 7, 8 |
| 事務所スタッフ（firm_advisor / admin） | 担当顧問先のダッシュボードを使う人。 | 1, 2, 7, 8 |
| 顧問先（client_admin / client_member） | 顧問先側の社員。今のところ画面は同じだが見える顧問先が自社のみに限定される。 | 1, 7 |

---

## 1. システム全体像（はじめにこれだけ）

SevenBoard は「Platform → Tenant → Organization → User」の 4 階層でできている。

- **Platform**: SevenBoard 運営側（SEVENRICH 内部）。
- **Tenant**: 販売先の会計事務所。例: SEVENRICH、A 会計事務所。
- **Organization（顧問先 / org）**: 会計事務所が担当する顧問先企業。
- **User**: ログインする人。1 人のユーザーが複数 Tenant や複数 Organization に所属できる。

ロールは 3 種類に分かれている。混ぜないこと。

| スコープ | 主なロール | できること |
| --- | --- | --- |
| Platform | `platform_owner`, `platform_admin` | テナント新規作成、SystemMaster 管理 |
| Tenant | `firm_owner`, `firm_admin`, `firm_advisor`, `firm_viewer` | 自事務所内のスタッフ・顧問先管理、各種設定 |
| Organization | `advisor_owner`/`editor`/`viewer`, `client_admin`/`member`/`viewer` | 個別顧問先のダッシュボード閲覧・編集 |

詳細は `docs/multitenancy-architecture.md` を参照。

---

## 2. アクセス情報

| 区分 | URL |
| --- | --- |
| 本番 Web | https://sevenboard-web.vercel.app（Vercel 配信、Next.js） |
| 本番 API | https://sevenboard-api-xxxxxxxxxx-an.a.run.app（Cloud Run Tokyo、NestJS） |
| 本番 DB | Supabase Postgres（プロジェクト ref: `scwjvwlrlxbvnqjdbqhs`、ap-northeast-1） |
| GCP プロジェクト | `sevenboard`（プロジェクト番号 889940418983） |

ログイン画面は `https://sevenboard-web.vercel.app/login`。Email + Password 形式。

---

## 3. ステージ A: 新しい会計事務所（テナント）を追加する

> 対象: Platform 運営者（SEVENRICH 内部の owner）

新しい会計事務所を SevenBoard に乗せるときの手順。**現時点では UI から tenant を新規作成する画面はない**（v1 では Platform 専用 API も seed/手作業ベース）。下の SQL ベース手順で追加する。

### 3-1. テナント情報の決定

| 項目 | 例 | 備考 |
| --- | --- | --- |
| `name` | A 会計事務所 | 表示名 |
| `slug` | `a-firm` | URL や Secret Manager の命名に使う。半角英小文字とハイフンのみ |
| `plan` | `starter` | 課金プラン。初期は `starter` でよい |
| `isolation_mode` | `shared` | 初期は共有 DB。物理分離が必要なら将来 `dedicated_database` |

### 3-2. テナント作成 SQL

Supabase Dashboard → SQL Editor で実行する。

```sql
-- ① tenant 行を作成
INSERT INTO tenants (id, name, slug, status, plan, isolation_mode, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'A 会計事務所',
  'a-firm',
  'active',
  'starter',
  'shared',
  now(),
  now()
)
RETURNING id;
-- ↑ 返ってきた tenant.id をメモ
```

### 3-3. 初期 firm_owner ユーザーの作成

オーナーになる人（事務所代表者）の User と TenantMembership を作成する。

```sql
-- ② User を作る（既に同 email の User がいる場合はそのまま再利用）
-- パスワードは bcrypt ハッシュにする必要がある。下の API 経由 (3-4) のほうが安全
INSERT INTO users (id, email, name, password, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'owner@a-firm.example.com',
  'A 事務所オーナー',
  '<bcrypt_hash>',
  now(),
  now()
)
RETURNING id;

-- ③ TenantMembership を firm_owner で作成
INSERT INTO tenant_memberships (id, user_id, tenant_id, role, status, created_at)
VALUES (
  gen_random_uuid(),
  '<上の user.id>',
  '<3-2 でメモした tenant.id>',
  'firm_owner',
  'active',
  now()
);
```

### 3-4. （推奨）API 経由で firm_owner を作る

bcrypt ハッシュを手で作るのは事故りやすいので、**SEVENRICH の owner が API でスタッフを作る → そのスタッフの TenantMembership を新 tenant に貼り替える** 方法が安全。

```bash
# SEVENRICH owner で login し、cookie で API を叩く
# (firm_owner ロールでテナントスタッフを作成する API を叩く)
curl -X POST "https://<api>/tenants/<sevenrich-tenant-id>/staff" \
  -H "Content-Type: application/json" \
  -H "Cookie: sb_access=<jwt>" \
  -d '{
    "email": "owner@a-firm.example.com",
    "name": "A 事務所オーナー",
    "password": "<initial_password>",
    "role": "firm_owner"
  }'
```

`POST /tenants/:tenantId/staff` は内部で User + TenantMembership を作る。作成後、上記の TenantMembership の `tenant_id` を新 tenant の id に SQL で UPDATE する。

> ⚠️ Platform 専用の `POST /platform/tenants` を作る予定。実装後はこの手順は不要になる。

### 3-5. 動作確認

1. 作成したオーナーの email/password でログイン。
2. ヘッダー右上の「顧問先一覧」をクリック。空の一覧が出れば OK。
3. ヘッダー右の OrgSwitcher に「A 会計事務所」が表示されていれば成功。

---

## 4. ステージ B: 事務所オーナーの初回ログインと初期設定

> 対象: firm_owner

### 4-1. ログイン

`https://sevenboard-web.vercel.app/login` で Email + Password を入力。

ログイン後はダッシュボード（顧問先未選択状態）に遷移する。顧問先を 1 つも持っていないと右上の OrgSwitcher が空になる。

### 4-2. 自分の権限を確認

ヘッダー右上の自分のアバターをクリック → 表示される情報で次を確認:

- email が正しい
- 所属テナント名が「A 会計事務所」
- ロール表示が `firm_owner`

---

## 5. ステージ C: 事務所スタッフを追加する

> 対象: firm_owner（一部は firm_admin も可）

### 5-1. スタッフ管理画面へ移動

ヘッダーの「顧問先一覧」→ 画面右上の「スタッフ管理」ボタン（`firm_owner` のみ表示）。

URL は `/advisor/staff`。

### 5-2. 新規スタッフを追加

「+ 新規スタッフ追加」ボタンを押すとダイアログが開く。

| 項目 | 説明 |
| --- | --- |
| email | ログイン用メールアドレス |
| name | 表示名 |
| password | 初期パスワード（後でユーザー本人が変えられる） |
| role | `firm_admin` / `firm_manager` / `firm_advisor` / `firm_viewer` から選択 |

ロールの目安:

| ロール | 用途 |
| --- | --- |
| `firm_admin` | 顧問先作成、他スタッフ管理が必要なリーダー職 |
| `firm_manager` | チーム単位の管理が必要な中間管理職（チーム機能は将来実装） |
| `firm_advisor` | 担当顧問先の作業を行う一般スタッフ |
| `firm_viewer` | 閲覧のみ |

「保存」を押すと一覧に追加される。

### 5-3. スタッフ編集 / 削除

一覧の各行で「編集」「削除」ボタン。

- 削除しても User 自体は残る（他テナントに所属していれば）。あくまで `tenant_memberships.status` を `removed` にするだけ。
- `firm_owner` 自身は自分を削除できない。別のオーナーが削除する。

---

## 6. ステージ D: 新規顧問先（Organization）を作る

> 対象: firm_owner / firm_admin

### 6-1. 顧問先一覧へ移動

ヘッダーの「顧問先一覧」をクリック → `/advisor` ページへ。

### 6-2. 「+ 新規顧問先追加」をクリック

ダイアログで次を入力:

| 項目 | 必須 | 説明 |
| --- | --- | --- |
| 顧問先名 | ◯ | 表示名 |
| MF 事業者コード | – | MF Cloud 連携時のキー。後で設定可 |
| 管理 No | – | factory-hybrid など社内システム連携用 |
| 決算月 | ◯ | 1〜12 |
| 業種 | – | SaaS / 製造業 / 情報通信業 / 小売業 / コンサル など |
| 原価計算を運用するか | – | 既定 OFF。中小企業は OFF のままでよい |
| 担当アサイン（advisorUserIds） | – | 最初から特定スタッフをアサインする場合 |

「作成」を押すと顧問先一覧に追加される。

### 6-3. 動作確認

1. 一覧に新顧問先が表示される。
2. 行の「→」アイコンをクリックすると、その顧問先のダッシュボードに切り替わる（OrgSwitcher が更新される）。
3. ダッシュボード上部に新顧問先名が表示される。

---

## 7. ステージ E: 顧問先のセットアップ（最重要）

> 対象: firm_owner / firm_admin、または該当顧問先の `advisor_owner`

新顧問先を作っただけでは中身は空。MF Cloud 連携 → Onboarding（勘定科目同期）の 2 ステップでデータが入る。

### 7-1. 顧問先を選択する

ヘッダーの「顧問先一覧」→ 該当顧問先の行を開く。
URL が `/?orgId=<uuid>` のように切り替わる。

### 7-2. MoneyForward Cloud に接続する

1. 左サイドバー「設定」をクリック → `/settings`。
2. 「データ連携」セクションの「MoneyForward クラウド会計」カードで「接続する」ボタンを押す。
3. MF の OAuth 同意画面に遷移するので、対象の事業者を選択して許可。
4. SevenBoard に戻ってきて「接続済み」バッジが付けば成功。

> 接続失敗時のエラー一覧は 9 章を参照。

### 7-3. Onboarding（勘定科目マッピング）を実行

接続直後は勘定科目が空。MF 側の勘定科目を AccountMaster に取り込む必要がある。

現時点では UI に「Onboarding 実行」ボタンが**まだ無い**ため、API を直接叩く:

```bash
curl -X POST "https://<api>/organizations/<orgId>/onboarding/start" \
  -H "Cookie: sb_access=<jwt>"
```

このエンドポイントは:

- MF の勘定科目を全件取得
- 既存 AccountMaster と完全一致 → externalId をマッピング
- 部分一致 → 同じく externalId 付与
- 一致しないもの → 新規 AccountMaster として作成

実行後、ダッシュボード（`/`）に MF からの数字が反映される。

### 7-4. 同期を回す

「設定」→ MF カードの「再同期」ボタンを押すか、API で:

```bash
curl -X POST "https://<api>/organizations/<orgId>/integrations/MF_CLOUD/sync" \
  -H "Cookie: sb_access=<jwt>"
```

数十秒で同期完了。失敗時はカードに赤バッジが出る。

### 7-5. 担当スタッフのアサイン

`/advisor` の対象顧問先の行 → ユーザーアイコン（人型 + 矢印）をクリック → 「担当者管理」ダイアログ。

「+ スタッフを追加」で自事務所スタッフ一覧から選択。複数同時に選べる。

権限が必要:

- 追加・削除: `org:users:manage`（firm_owner / firm_admin / advisor_owner）
- 一覧閲覧: `org:users:read`

---

## 8. 各機能の使い方（顧問先選択後）

ヘッダー右上の OrgSwitcher で顧問先を選択すると、サイドバーに次のメニューが出る。

| メニュー | URL | できること |
| --- | --- | --- |
| ダッシュボード | `/` | 主要 KPI、PL/BS サマリー、AI 1 行コメント |
| 月次レビュー | `/monthly-review` | 月次締めチェックリスト、advisor 承認 / client 承認 |
| 財務指標 | `/indicators` | 売上総利益率、営業利益率、ROE 等。原価計算 OFF だと粗利は非表示 |
| AI CFO レポート | `/ai-report` | AI 生成の月次経営レポート |
| 財務諸表 | `/financial-statements` | PL / BS / CF（GAAP 表示） |
| 資金繰り | `/cashflow` | 資金繰り表。確度（確定/予定/概算）でセル透明度が変わる |
| 資金調達レポート | `/funding-report` | 銀行向け資料 |
| 変動損益 | `/variable-cost` | 固定費 / 変動費分解 |
| 決算検討 | `/year-end-review` | 期末対応 |
| トークスクリプト | `/talk-script` | 月次面談トーク台本 |
| アラート | `/alerts` | 予算超過 / 資金繰り / KPI 未達 |
| 設定 | `/settings` | データ連携・通知・分析設定など |

サイドバーのメニュー表示は「設定」→「メニュー表示設定」で個別に隠せる。ダッシュボードと設定だけは常時表示。

### 8-1. 設定画面の主な項目

`/settings` で次を編集できる。

| カード | 設定内容 |
| --- | --- |
| 会社情報 | MF 連携で自動取得（読み取り専用） |
| 分析設定 | 原価計算を運用するか（売上総利益率の扱いに影響） |
| 朝サマリーの Slack 定時配信 | Slack Incoming Webhook URL、配信時刻、テスト送信 |
| 資金繰り確度設定 | 勘定科目ごとに「確定 / 予定 / 概算」を割り当て |
| 通知設定 | 予算超過アラート、資金繰り、KPI 未達、AI CFO 自動生成 |
| データ連携 | MF Cloud / kintone の接続管理 |
| メニュー表示設定 | サイドバーで隠すメニューを選択 |

---

## 9. MF Cloud トークン管理

### 9-1. トークンの仕組み

- 接続時に access_token + refresh_token が DB に暗号化保存される
- access_token の有効期限は短い（数時間〜1 日）
- 期限切れが近づくと「設定」のカードに「もうすぐ失効」と表示される
- 「トークン更新」ボタンで refresh_token を使って延長する（再ログイン不要）

### 9-2. 期限切れ時の対応

「再同期」を押して 401 / 認証エラーが返るときは:

1. 「設定」→ MF カードの「トークン更新」を押す
2. 成功すれば「最終更新」が現在時刻に更新される
3. 失敗時は「接続を解除」→「接続する」で再認可

### 9-3. ローカル開発時

`apps/api/.env` の `MF_ACCESS_TOKEN` に MCP トークンを直接貼る運用。
切れたら `/mf-refresh` を叩いて env を差し替え、API を再起動。

---

## 10. 鍵・シークレット管理

詳細は `docs/secret-rotation-guide.md`（初心者向け、PowerShell 手順付き）。

要点:

- 本番のシークレット 9 種は Google Secret Manager で管理（`sevenboard-prod-*`）
- Cloud Run の env には実値を置かず Secret 参照のみ
- 鍵を交換するときの手順は 2 パターンあり、ガイドにそのまま従えば事故らない
  - パターン A: SevenBoard 内部で生成する鍵（JWT_SECRET / MF_TOKEN_ENCRYPTION_KEY）
  - パターン B: 外部サービスで再発行する鍵（DATABASE_URL / MF_CLIENT_SECRET 等）

---

## 11. トラブルシューティング

### 11-1. ログインできない

- Email / Password が違う → firm_owner に再発行を依頼
- 「Cookie が無効」が出る → ブラウザの cookie 受け入れを確認
- パスワードを忘れた → 現状はパスワードリセット画面なし。firm_owner に直接 SQL で再設定してもらう

### 11-2. 顧問先一覧に何も出ない

- 新規ログイン直後は空 → 5 章でスタッフを作成、6 章で顧問先を作成
- 既存があるのに見えない → TenantMembership が active か確認。`firm_advisor` は OrganizationMembership があるものだけ見える

### 11-3. ダッシュボードが空

ほぼ全ケースで「MF 連携が未完」。7-2 → 7-3 → 7-4 を順にやる。

### 11-4. 「MF Cloud 接続に失敗: invalid_state」

OAuth state の有効期限切れ（5 分）。設定画面で「接続する」をもう一度押す。

### 11-5. 「対象の顧問先への access 権限がありません」

OAuth 開始時とコールバック時で別ユーザーになっている / 別の顧問先を選んでいる。
ヘッダーの顧問先選択を確認 → 設定画面に戻ってやり直す。

### 11-6. 同期が IN_PROGRESS のまま固まる

`integration_sync_logs` の最新行を確認:

```sql
SELECT status, error, started_at, finished_at
FROM integration_sync_logs
WHERE org_id = '<orgId>' AND provider = 'MF_CLOUD'
ORDER BY started_at DESC
LIMIT 5;
```

`started_at` から 30 分以上経っているならジョブはタイムアウト済み。「再同期」で再実行。

### 11-7. Cloud Run が起動しない

`gcloud logging read 'resource.type="cloud_run_revision"' --limit=50` で revision-specific log を確認。

「imports[0] is undefined」系は循環依存の forwardRef 漏れ。memory `feedback_nestjs_forwardref_circular.md` を参照。

---

## 12. 関連ドキュメント

| ドキュメント | 内容 |
| --- | --- |
| `docs/multitenancy-architecture.md` | テナント / 権限 / DB 設計の決定版 |
| `docs/security-hardening-roadmap.md` | 外販前に必ずやるべき hardening 9 施策 |
| `docs/secret-rotation-guide.md` | 鍵の交換手順（初心者向け） |
| `docs/production-handoff-values-20260430.md` | 本番値・命名規則・命令的手順 |
| `docs/cloud-run-security-plan.md` | Cloud Run の SA / IAM / Secret 設計 |
| `docs/deploy-plan.md` | デプロイ計画 |
| `docs/railway-shutdown-runbook.md` | Railway シャットダウン手順（移行完了後） |

---

## 13. 既知の未実装 / 改善予定

外販前に必須（Phase B、`docs/security-hardening-roadmap.md` 参照）:

- [ ] PostgreSQL RLS（DB 層でテナント越境完全防止）
- [ ] JWT を localStorage → HttpOnly Cookie（XSS 耐性）— 一部完了、残作業あり
- [ ] TOTP 2FA を firm staff に必須化
- [ ] Sentry + 異常検知 alert

UI 改善:

- [ ] Platform 用テナント新規作成画面（現状 SQL 直叩き）
- [ ] Onboarding 実行ボタン（現状 API 直叩き）
- [ ] パスワードリセット画面
- [ ] スタッフ・顧問先のメンバー招待メール

---

## 14. サポート

不具合や質問は `#sevenboard-support` （Slack）または GitHub Issue へ。
緊急時の対応窓口は `firm_owner` 経由で SEVENRICH 内部 Platform へエスカレーション。
