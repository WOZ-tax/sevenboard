# MF MCPエンドポイント scope要求変更の再現実験レポート

実施日時: 2026-07-23 16:15〜16:18 JST / 実施者: SEVENRICH会計事務所

## 結論

**MCP CA v3 エンドポイント（`beta.mcp.developers.biz.moneyforward.com/mcp/ca/v3`）は、呼び出すツールに関係なく、`initialize` の段階でトークンの付与scopeに `mfc/accounting/transaction.read` を含む12 scopeフルセットを要求している。** このため、`transaction.read` が必須化された時点で、それ以前に発行された11 scopeの正常なトークンは全ツール呼び出し不能となった。

貴社よりご提示いただいた仮説「AI Agentが Runtime Insufficient Scope Errors フローで `transaction.read` のみをauthorize requestし、欠けたトークンになった」は、以下の実測により**否定**される:

1. 実験で発行したトークンの `granted_scope`（token response実測値）は要求どおりの**完全な11 scope**であり、欠けていない
2. 403は `tools/call` ではなく **`initialize`（ツール未指定の段階）** で発生する
3. 付与済みscope圏内のツール（`currentOffice`=offices.read、`getReportsTrialBalanceProfitLoss`=report.read）でも403
4. **同一トークン**で公式REST API v3（`GET /api/v3/offices`）は**200** — トークンは健全で、MCPエンドポイントの判定だけが失敗する

## 実験条件

| 項目 | 値 |
|---|---|
| OAuthクライアント | client_id `258500725265407`（パートナー管理画面登録アプリ「SevenBoard」） |
| 事業者 | `6430-5845` test（テスト用事業者・実データなし） |
| 認可フロー | authorization_code（resource indicator = MCP URL、token交換は client_secret_basic） |
| MCPハンドシェイク | SevenBoard本番実装と同一（protocolVersion `2024-11-05`、Accept: application/json, text/event-stream） |
| 再現スクリプト | `scripts/mf-scope-repro.mjs`（読み取り専用呼び出しのみ） |
| 群間の差分 | 認可リクエストのscopeに `mfc/accounting/transaction.read` を含むか否か **のみ**（同一クライアント・同一事業者・同一エンドユーザー・実施間隔約2分） |

## 結果サマリ

| 検証項目 | A: 11 scope（transaction.readなし） | B: 12 scope（あり） |
|---|---|---|
| token交換 | 成功 / granted_scope=**11個全部**（欠落なし）/ expires_in=3600 | 成功 / granted_scope=12個 / expires_in=3600 |
| MCP initialize | **403** insufficient_scope | **200** |
| MCP tools/call mfc_ca_currentOffice | **403** insufficient_scope | **200**（事業者情報取得） |
| MCP tools/call mfc_ca_getReportsTrialBalanceProfitLoss | **403** insufficient_scope | **200**（試算表取得） |
| REST GET /api/v3/offices（同一トークン） | **200** | **200** |
| 403時のWWW-Authenticate | `Bearer error="insufficient_scope", scope="<transaction.read を含む12 scopeフルセット>"` | — |

## 生ログ

### A: 11 scope（再現群）2026-07-23T07:15Z

```
# mf-scope-repro 11scope(再現群)  client_id=258500725265407  2026-07-23T07:05:49.908Z
# 要求scope (11個): mfc/accounting/offices.read mfc/accounting/accounts.read mfc/accounting/departments.read mfc/accounting/journal.read mfc/accounting/journal.write mfc/accounting/report.read mfc/accounting/taxes.read mfc/accounting/trade_partners.read mfc/accounting/trade_partners.write mfc/accounting/connected_account.read mfc/accounting/transaction.write
[callback] state_ok=true code=あり(43文字) iss=https://biz.moneyforward.com
[2026-07-23T07:15:43.615Z] token取得OK  granted_scope=mfc/accounting/accounts.read mfc/accounting/connected_account.read mfc/accounting/departments.read mfc/accounting/journal.read mfc/accounting/journal.write mfc/accounting/offices.read mfc/accounting/report.read mfc/accounting/taxes.read mfc/accounting/trade_partners.read mfc/accounting/trade_partners.write mfc/accounting/transaction.write  expires_in=3600
[2026-07-23T07:15:43.947Z] MCP initialize: HTTP 403
    WWW-Authenticate: Bearer error="insufficient_scope", scope="mfc/accounting/offices.read mfc/accounting/accounts.read mfc/accounting/departments.read mfc/accounting/journal.read mfc/accounting/journal.write mfc/accounting/report.read mfc/accounting/taxes.read mfc/accounting/trade_partners.read mfc/accounting/trade_partners.write mfc/accounting/connected_account.read mfc/accounting/transaction.read mfc/accounting/transaction.write", resource_metadata="https://beta.mcp.developers.biz.moneyforward.com/.well-known/oauth-protected-resource/mcp/ca/v3"
    body: insufficient_scope
[2026-07-23T07:15:44.174Z] MCP tools/call mfc_ca_currentOffice: HTTP 403
    WWW-Authenticate: (同上・12 scopeフルセット)
    body: insufficient_scope
[2026-07-23T07:15:44.808Z] MCP tools/call mfc_ca_getReportsTrialBalanceProfitLoss: HTTP 403
    WWW-Authenticate: (同上・12 scopeフルセット)
    body: insufficient_scope
[2026-07-23T07:15:46.131Z] REST GET /api/v3/offices office=6430-5845 test: HTTP 200
```

### B: 12 scope（対照群）2026-07-23T07:17Z

```
[callback] state_ok=true code=あり(43文字) iss=https://biz.moneyforward.com
[2026-07-23T07:17:36.592Z] token取得OK  granted_scope=mfc/accounting/accounts.read mfc/accounting/connected_account.read mfc/accounting/departments.read mfc/accounting/journal.read mfc/accounting/journal.write mfc/accounting/offices.read mfc/accounting/report.read mfc/accounting/taxes.read mfc/accounting/trade_partners.read mfc/accounting/trade_partners.write mfc/accounting/transaction.read mfc/accounting/transaction.write  expires_in=3600
[2026-07-23T07:17:37.251Z] MCP initialize: HTTP 200
[2026-07-23T07:17:37.520Z] MCP tools/call mfc_ca_currentOffice: HTTP 200
[2026-07-23T07:17:38.430Z] MCP tools/call mfc_ca_getReportsTrialBalanceProfitLoss: HTTP 200
[2026-07-23T07:17:39.304Z] REST GET /api/v3/offices office=6430-5845 test: HTTP 200
```

## 補足: 本番環境での観測（参考）

- 弊社SevenBoard（本クライアントの本番運用）は明細系ツールを一切呼ばない構成（利用ツールは currentOffice / 試算表・推移表 / 仕訳 / 勘定科目 の7種のみ）だが、2026-07中旬の貴社更新以降、**接続済み64事業者分のトークンが一斉に403 insufficient_scope** となった（Cloud Runログに記録あり。WWW-Authenticateは本実験と同一の12 scopeフルセット）
- 認可経路はSettings画面からの固定11 scopeリクエスト1本のみで、step-up認可を行うAI Agent等は存在しない
- また2026-07-23までパートナー管理画面の本アプリには「明細の参照」が未登録だったため、そもそも本クライアントで `transaction.read` を含むトークンは発行不可能だった（narrowedトークン仮説はこの点でも成立しない）
- scope登録追加+12 scopeでの再認可後、同一構成で正常動作に復帰

## 貴社へのご要望

1. MCP CA v3の必須scopeセット変更（transaction.read追加）が既存トークンを一括無効化する**破壊的変更**であったことの確認
2. 今後の必須scopeセット変更時の事前アナウンスと移行期間の設定
3. 可能であれば、initialize/ツール単位での必要scope判定（利用しないscopeの強制を避ける設計）のご検討
