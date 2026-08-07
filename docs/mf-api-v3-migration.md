# MF連携トランスポート移行: MCP → 公式 REST API v3

MF Cloud Accounting との連携を、beta 扱いの MCP HTTP transport から公式 REST
API v3 へ切り替えるための運用ドキュメント。設計の背景と契約は
[`mf-api-v3-migration-spec.md`](./mf-api-v3-migration-spec.md) が正本。本書は
切替手順・ロールバック・対応表・既知の罠をまとめる。

## アーキテクチャ

```
consumer 58ファイル ─(既存シグネチャ/型のまま)→ MfApiService
                                                    │  MF_TRANSPORT
                                        ┌───────────┴───────────┐
                                     'mcp'(既定)              'api'
                                        │                       │
                              既存 initSession/callTool   MfV3ClientService
                                                           + mf-v3-adapter
```

- `MfApiService` の public メソッド（`getOffice` / `getTrialBalancePL` /
  `getTrialBalanceBS` / `getTransitionPL` / `getTransitionBS` / `getAccounts` /
  `getJournals` / `manualTokenRefresh`）はシグネチャ・返却型とも不変。呼び出し側
  58ファイルは無変更。
- `MF_TRANSPORT=api` のとき `MfV3ClientService`（全 v3 エンドポイントの薄い
  型付きラッパー）を叩き、`mf-v3-adapter.ts` の純関数で既存内部型
  (`types/mf-api.types.ts`) に変換する。
- キャッシュ・in-flight de-dupe・orgId 単位の single-flight 401 リフレッシュ・
  DataHealth 記録は両トランスポート共通。トークン取得・refresh・暗号化コードは
  無変更で流用（既存 OAuth トークンが REST でもそのまま通る）。
- MCP 経路のコードは削除していない（ロールバック用）。

## 切替手順

1. デプロイ環境（Cloud Run）の環境変数に `MF_TRANSPORT=api` を設定。
   - 任意で `MF_V3_BASE_URL`（既定 `https://api-accounting.moneyforward.com`）。
2. デプロイ。既存 OAuth トークンはそのまま有効（再認証不要）。
3. ダッシュボード/アラート/資金繰り等の MF 依存画面が正常表示されることを確認。

`MF_TRANSPORT` 未設定または `mcp` の場合は従来どおり MCP 経路で動作する。

## ロールバック手順

- 環境変数を `MF_TRANSPORT=mcp`（または削除）に戻して再デプロイするだけ。
- コード変更・再認証は不要。MCP 経路は撤去していない。

## 読み取り専用 smoke

`scripts/mf-v3-smoke.mjs` は v3test トークンで読み取り専用 GET を叩き、各
レスポンスの実 shape とアダプタが要求するフィールドの突合結果を出力する。
書き込み系（POST/PUT/DELETE/journalize）は実行しない。トークン期限切れ時は
refresh せずスキップ（refresh_token ローテーション回避）。

```
node scripts/mf-v3-smoke.mjs [tokenFile] [baseUrl]
# 既定 tokenFile = ~/.claude/mf-offices-v3test/0040-0597.json
```

## MCP ツール → v3 エンドポイント 対応表

`MfApiService` が使う 7 ツール（＋手動 refresh）の対応。

| public メソッド | 旧 MCP ツール | v3 エンドポイント | アダプタ |
|---|---|---|---|
| `getOffice` | `mfc_ca_currentOffice` | `GET /api/v3/offices` | `adaptOffice` |
| `getTrialBalancePL` | `mfc_ca_getReportsTrialBalanceProfitLoss` | `GET /api/v3/reports/trial_balance_pl` | `adaptTrialBalance` |
| `getTrialBalanceBS` | `mfc_ca_getReportsTrialBalanceBalanceSheet` | `GET /api/v3/reports/trial_balance_bs` | `adaptTrialBalance` |
| `getTransitionPL` | `mfc_ca_getReportsTransitionProfitLoss` | `GET /api/v3/reports/transition_pl` (`type=monthly`) | `adaptTransition` |
| `getTransitionBS` | `mfc_ca_getReportsTransitionBalanceSheet` | `GET /api/v3/reports/transition_bs` (`type=monthly`) | `adaptTransition` |
| `getAccounts` | `mfc_ca_getAccounts` | `GET /api/v3/accounts` | `adaptAccounts` |
| `getJournals` | `mfc_ca_getJournals` | `GET /api/v3/journals`（`metadata.total_pages` で全頁） | `adaptJournalsResult` |
| `manualTokenRefresh` | (OAuth token endpoint) | 変更なし（`https://api.biz.moneyforward.com/token`） | — |

`MfV3ClientService` は上記に加え、将来機能向けに全 v3 エンドポイントをラップ済み:
`sub_accounts` / `departments` / `taxes` / `trade_partners`(read+write) /
`connected_accounts` / `term_settings` / `journals`(GET単体/POST/PUT/DELETE) /
`transactions`(GET/POST/journalize) / `vouchers`(POST/DELETE)。

## 既知の罠

- **二重エンコード禁止**: API が返す ID（`account_id` / `transaction_id` /
  journal `id` 等）は URL エンコード済み文字列。クエリ・パスに渡す際に再
  encode すると二重エンコードで 0 件になる。`MfV3ClientService` のクエリ
  ビルダは、値が既に `%XX` を含む場合は素通し、それ以外のみ encode する。
- **GET /transactions は 366日以内**: `start_date`/`end_date` の差は 366 日以内
  必須（journals にはこの制限なし）。
- **wrap 構造**: コレクション系は名前付きキーで 1 階層包まれる
  （`{accounts:[...]}` `{taxes:[...]}` `{journals:[...],metadata}` など）。
  レポートと offices はオブジェクトを直接返す。アダプタが unwrap する。
- **レート制限 3 req/s per (ClientID × 事業者)**: `MfV3ClientService` が
  事業者単位のスライディングウィンドウでスロットリング。429/5xx は
  3s/6s/12s の指数バックオフでリトライ。

## OpenAPI で判明した「仕様書の想定との差異」

- **`sub_accounts` GET は 403 にならなかった**: 仕様書は「accounts.read 圏外
  なら 403 の可能性」と注記していたが、実 smoke（`accounts.read` 保有トークン）
  では `GET /api/v3/sub_accounts` が 200 で 86 件返った。OpenAPI 上も
  `sub_accounts` の security は `accounts.read`。よって補助科目 GET は
  `accounts.read` 圏内で取得可能。
- **仕様書に未記載のエンドポイントが存在**: `GET /api/v3/term_settings`
  （会計年度設定, `offices.read`）と `/api/v3/vouchers`（証憑 POST/DELETE,
  `voucher.write`）。ラッパーには含めた（`voucher.write` は現行スコープ外の
  可能性があるため実行は要スコープ確認）。
- **`transition_pl` と `transition_bs` で columns 末尾が異なる**: PL は
  `... , settlement_balance, total`、BS は `... , settlement_balance`（`total`
  なし）。transform 側は数値 column のみ月ラベル化するため影響なし。
- **会計期間は開始月依存で columns が回る**: 例）3月開始事業者は
  `[3,4,...,2,settlement_balance,...]`。既存 transform の `buildMonthLabels`
  が動的対応済み。
