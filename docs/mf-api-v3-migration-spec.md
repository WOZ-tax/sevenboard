# MF公式API v3 移行仕様書 — MCPトランスポート撤去と全面ラッパー化

作成: 2026-07-23 / 発注: 外林 / 設計: Claude (Fable) / 実装: 委譲

## 背景と目的

- sevenboardのMF連携は現在MCP HTTP transport（`beta.mcp.developers.biz.moneyforward.com/mcp/ca/v3`、JSON-RPC）経由。2026-07のMF側更新で「エンドポイント一括の必須scope変更」により全接続が停止する事故が発生した（旧11 scopeトークンが全拒否）。
- MCPはbeta扱いで予告なき仕様変更リスクが高い。公式API v3はエンドポイント単位の権限チェックのため同種の全断が構造的に起きない。
- **目的**: トランスポートを公式API v3 (REST) に移行する。その際、現在使う7機能だけでなく**API v3の全エンドポイント群をラップした汎用クライアント層**を作り、将来機能（明細・取引先・補助科目・仕訳書き込み等）をコード追加なしで使える状態にする（スケーラビリティ確保、ユーザー明示要求）。

## 確定済みの前提（再調査不要・変更禁止）

1. ベースURL: `https://api-accounting.moneyforward.com`、パスは `/api/v3/...`。OpenAPI 3.0.3 正本: `https://developers.api-accounting.moneyforward.com/`（yaml: `/v3/openapi.yaml`）。**エンドポイントのパス・パラメータ・レスポンス形はこのOpenAPI yamlを取得して確認すること。推測での実装は禁止**。
2. 認証: 既存OAuthトークン（Integrationテーブル、Bearer）が**RESTでもそのまま通る**（2026-07-16 BROWNS実機で GET offices/journals 200 を確認済み）。トークン取得・refresh・暗号化の既存コードは**無変更で流用**。
3. scope: authorize の12 scope（デプロイ済み）で確定。`sub_accounts.read` というscope名は存在しない（DCRで弾かれる実証済み。補助科目GETは accounts.read 圏内の想定、403なら明記して報告）。
4. レート制限: **3 req/s per (ClientID×事業者)**。事業者ごとに独立。429実測あり。
5. 実装注意（実測済みの罠）:
   - APIが返す明細ID（transaction id）はURLエンコード済み文字列。**クエリに渡す際に再encodeURIComponentすると二重エンコードで0件になる**（そのまま渡す）
   - GET /transactions は期間指定366日以内が必須
   - MF APIレスポンスは全endpointでwrapされている（データが1階層包まれる）。実shapeはOpenAPIと実レスポンスで確認
   - 会計期間外の日付クエリは invalid_query_parameter_value 400

## アーキテクチャ

```
[58ファイルの既存consumer] ─(既存メソッドシグネチャ・型のまま)→ MfApiService
                                                        │
                                              MF_TRANSPORT env flag
                                              ┌─────────┴─────────┐
                                          'api' (新既定候補)      'mcp' (fallback残置)
                                              │                   │
                                    MfV3ClientService        既存 initSession/callTool
                                    (新規・全面ラッパー)      (現行コード、削除しない)
```

### 成果物1: `apps/api/src/mf/mf-v3-client.service.ts`（新規）

API v3 の**全エンドポイント群**をカバーする薄い型付きラッパー。ビジネスロジック禁止。OpenAPI yamlに存在する全リソースをメソッド化する（最低限、以下のグループ。yamlに他があれば追加）:

- offices（事業者情報）
- accounts / sub_accounts（勘定科目・補助科目）
- departments（部門）
- taxes（税区分）
- trade_partners（取引先、read/write）
- journals（仕訳: GET一覧/GET単体/POST/PUT/DELETE。GET一覧は10,000件/頁・期間/科目フィルタ）
- reports（trial_balance_bs / trial_balance_pl / transition_bs / transition_pl）
- transactions（明細: GET一覧(journalizing_statusesフィルタ)/POST/journalize POST）
- connected_accounts（連携サービス、yamlに存在すれば）

共通機能（このサービス内に実装）:
- Bearerトークンは呼び出し元から引数で受け取る（トークン管理はMfApiService側の既存機構に残す）
- ページネーションヘルパー（明示page指定と全頁イテレータの両方）
- wrappedレスポンスのunwrap
- 429/5xx の指数バックオフリトライ（3s/6s/12s、既存MCP実装の方針踏襲）
- org単位の簡易レートリミッタ（3req/s、既存のin-flight dedupeと併用）
- エラーは現行と同じNest例外体系にマップ（401/403はそのままthrowし、MfApiService側の既存refresh single-flightに処理させる）

### 成果物2: `MfApiService` の transport 分岐（改修）

- `MF_TRANSPORT` env（`'api'` | `'mcp'`、未設定時は `'mcp'`＝現行維持。切替はデプロイ時のenv設定で行う）
- 既存publicメソッド（`getOffice` / `getTrialBalancePL` / `getTrialBalanceBS` / `getTransitionPL` / `getTransitionBS` / `getAccounts` / `getJournals` / `manualTokenRefresh`）の**シグネチャと返却型は一切変更しない**
- transport='api' 時は MfV3ClientService を呼び、**レスポンスを既存の内部型（types/mf-api.types.ts）に変換するアダプタ**を通す。58ファイルのconsumerは無変更
- キャッシュ・in-flight dedupe・401リフレッシュ・DataHealth記録の既存機構は両transportで共通に効かせる
- MCP経路のコードは削除しない（fallback。撤去は安定稼働後の別タスク）

### 成果物3: 検証

1. `npm run build`（またはリポジトリ標準のビルド）+ 既存specが全緑
2. アダプタのunit test: 実レスポンスfixture（下記smokeで採取）→ 既存内部型への変換を検証
3. **実データsmoke**: `scripts/mf-v3-smoke.mjs`（リポジトリ内、標準入力や引数でトークンファイルパスを受ける）を新規作成し、`~/.claude/mf-offices-v3test/0040-0597.json` のaccessTokenで**読み取り専用GETのみ**（offices→accounts→taxes→departments→trial_balance_pl/bs→transition_pl/bs→journals 1頁）を実行。各レスポンスの実shapeを確認し、アダプタが返す内部型とフィールド突合した結果を出力する。**書き込み系（POST/PUT/DELETE/journalize）は絶対に実行しない**。トークンが期限切れの場合はrefreshせず「期限切れ」を報告して読み取り検証をスキップ（refresh_tokenのローテーションを起こさないため）
4. sub_accounts GETが403の場合はスキップし、報告書に「accounts.read圏外の可能性」と明記

### 成果物4: ドキュメント

- `docs/mf-api-v3-migration.md`: 切替手順（env設定）、ロールバック手順（MF_TRANSPORT=mcp）、エンドポイント対応表（MCPツール名→v3エンドポイント）、既知の罠（二重エンコード・366日・wrap）
- `.env.example` に `MF_TRANSPORT` / `MF_V3_BASE_URL`（既定 `https://api-accounting.moneyforward.com`）を追記

## 変更禁止事項（契約）

- `apps/api/src/mf/` と `scripts/`・`docs/`・`.env.example` **以外のファイルは変更禁止**（typesの追加は `mf/types/` 内のみ可）
- 既存publicメソッドのシグネチャ・返却型・例外型の変更禁止
- OAuth・トークン管理・暗号化コードの変更禁止
- デプロイ・コミット・push禁止（ユーザー承認後に別途）
- MF書き込み系APIの実行禁止（実装はするが、smoke/テストでの実呼び出しは禁止）

## 完了報告に含めるもの

- 変更ファイル一覧と行数
- smoke実行ログ（各エンドポイントのHTTPステータスとshape突合結果）
- OpenAPI yamlで発見した「仕様書の想定と違った点」の全列挙（あれば）
- MCPツール7種→v3エンドポイントの対応表（実装したアダプタの根拠）
