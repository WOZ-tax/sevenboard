<!-- 自動生成: sevenboard オールオーバーレビュー (dynamic workflow, 8次元×敵対的検証) -->
<!-- 生成日: 2026-06-02 / 投入エージェント141・確定指摘62件 -->

> **集計について（重要）**: 本文中の統合サマリ表は統合エージェントの手集計で **合計52** と記載されていますが、
> プログラム集計（正）は **合計62件: critical 0 / high 6 / medium 20 / low 33 / info 3** です。
> 全62件の機械可読な一覧は同フォルダの `allover-review-findings-20260602.json` を参照してください。

# sevenboard オールオーバーレビュー結果

## エグゼクティブサマリ

sevenboard(会計事務所向けマルチテナント経営ダッシュボード)に対する全次元レビューの結果、確定指摘は52件。アーキテクチャの基本骨格(3層フロー、認可サービス、Chosho系の複合FKによるテナント分離)は堅実だが、最大の構造的弱点は「nullable な department_id を含む複合ユニーク制約」に起因する財務実績の二重計上系バグで、データ整合性・性能・冪等性の3面に連鎖している。次いで、予算承認ワークフローや通知設定など「UIはあるが永続化されていない見た目だけの機能」が複数存在し、ユーザーの誤認リスクが高い。セキュリティ面ではログインのレート制限欠如とCSRFガードのfail-open設計が要対応。横断的には「同名関数・型・マスタの重複定義」「N+1書き込み」が広く分布しており、共通化の不足が品質ドリフトを生んでいる。重大度別件数は以下のとおり。

| 重大度 | 件数 |
|--------|------|
| critical | 0 |
| high | 6 |
| medium | 20 |
| low | 22 |
| info | 4 |
| **合計** | **52** |

注: critical 該当の確定指摘はなし。経営判断・データの正確性に直結する high 6件を最優先とする。

## 最優先で直すべきもの(high)

high 6件はいずれも「財務数値が静かに誤る」または「セキュリティ/承認フローが機能していない」もので、経営者が見る数字の信頼性に直結する。

1. **actuals CSVインポートの upsert が部門なし行で重複生成(冪等性欠落)** — `apps/api/src/actuals/actuals.service.ts:99-124`
   PostgreSQL では NULL 同士は等価とみなされず、`departmentId=null` の行は複合ユニークにマッチしないため、Prisma の upsert が毎回 create 側に倒れる。部門なしの同一科目×月CSVを再インポートするたびに ActualEntry が重複生成され、PLレポートが二重計上になる。sync/onboarding は findFirst+update/create で回避しているのに importCsv だけが危険な upsert。
   推奨: importCsv も findFirst→update/create に揃えるか、partial unique index を追加する。

2. **差異レポートで部門別実績が合算されず上書き** — `apps/api/src/reports/reports.service.ts:94-99,116-121`
   getVarianceReport は実績を accountId:month キーの Map に格納するが、複数部門があると Map.set が後勝ちで上書きし一部門分しか拾わない。予算は科目×月で集計されるため差異(varianceAmount/variancePercent)が誤る。priorYearMap も同構造で前年同月が欠落。
   推奨: actualMap/priorYearMap への格納を加算(既存値 + ae.amount)に変更する。

3. **複合unique制約に nullable department_id を含めている(根本原因)** — `packages/database/prisma/schema.prisma:512 (actual) / 486 (budget)`、`migration.sql:142`
   actual_entries/budget_entries とも departmentId が nullable のため、部門なし行の重複を DB が防げない。指摘1・指摘の性能問題の根本。
   推奨: department_id を NOT NULL + センチネル値(全ゼロUUID)に統一、または partial unique index を2本張る。既存重複データのクレンジングを伴うバックフィルmigrationが必要。

4. **同じ root cause が実コードで顕在化(upsert が null 部門で失敗)** — `apps/api/src/actuals/actuals.service.ts:99-124`
   上記スキーマ欠陥が importCsv の upsert で重複生成/例外として表面化する箇所。
   推奨: スキーマ側を NOT NULL センチネル化したうえで upsert を機能させる。暫定は sync.service と同様の findFirst フォールバック。

5. **予算承認ワークフローがクライアントローカルのみで永続化されない** — `apps/web/src/app/budget/page.tsx:93-145, 292-350`
   承認ステータス(DRAFT→PENDING→APPROVED→LOCKED)が `useState` のローカルstateだけで管理され、保存も初期ロードも無い。BudgetVersion 型(api-types.ts:68-77)に status フィールドが無く保存先も無い。確認依頼/承認/確定すべてがリロードで DRAFT に戻り、LOCKED の編集ロックもリロードで誰でも解除できる。承認フロー自体が機能していない。
   推奨: ステータスをバックエンドに持たせ useQuery/useMutation で永続化。当面難しいなら承認ボタンを非表示にし「機能未実装」を明示する。

6. **認証エンドポイントにレート制限が無く総当たり可能** — `apps/api/src/auth/auth.controller.ts:37-46`
   POST /auth/login にレート制限が無い。RateLimitGuard は orgId のあるルートでしか作動せず3コントローラにしか付与されておらず、グローバルスロットラーも未導入。validateUser は bcrypt.compare のみでアカウントロックも試行回数制限も無く、パスワード総当たり・クレデンシャルスタッフィングが無制限に可能。
   推奨: /auth/login と /auth/refresh に IP+メール単位のレート制限(@nestjs/throttler 等)と連続失敗時のバックオフ/一時ロックを導入する。

## 次元別の指摘

### 認証・認可・テナント分離

| 重大度 | タイトル | file:line | 推奨 |
|--------|---------|-----------|------|
| low | 認証がグローバルGuardでなくController単位で secure-by-default でない | apps/api/src/main.ts:43 | JwtAuthGuard を APP_GUARD でグローバル登録し、公開は @Public() でopt-out |
| low | ログインがメンバーシップ/有効状態を検証せず剥奪済みユーザーもトークン取得可 | apps/api/src/auth/auth.service.ts:21-47 | login時に有効な membership 必須化、User に disabled/status 追加、認証と認可を分離 |
| low | internal-users.create が顧問先側ユーザー(orgId!=null)にも無検証で事務所スタッフmembership付与 | apps/api/src/internal-users/internal-users.service.ts:71-140 | existing.orgId !== null なら BadRequest で拒否 |

### APIロジック・バグ

| 重大度 | タイトル | file:line | 推奨 |
|--------|---------|-----------|------|
| high | actuals CSVインポートの upsert が部門null で重複行作成(冪等性欠落) | apps/api/src/actuals/actuals.service.ts:99-124 | findFirst→update/create に分岐、または partial unique index |
| high | 差異レポートで部門別実績が合算されず上書き、複数部門科目の実績欠落 | apps/api/src/reports/reports.service.ts:94-99,116-121 | actualMap/priorYearMap を加算に変更し全部門合算 |
| medium | 融資シミュレーションで graceMonths>=termMonths のとき除算でNaN/Infinity/負額 | apps/api/src/simulation/simulation.service.ts:49-144 | repaymentMonths>=1 を検証し満たさなければ BadRequestException |
| medium | runway計算が常に固定3か月で割り、データ3か月未満でバーン過小評価・runway過大 | apps/api/src/cashflow/cashflow.service.ts:56-92 | 実データが跨ぐ月数(最低1)で割る |
| medium | MF同期で当月 actualEntry を試算表(ローカルTZ月初)と推移表(UTC月初)が別キーで書き当月重複 | apps/api/src/sync/sync.service.ts:67-111,315-342 | 月キー生成を UTC月初(Date.UTC)に統一 |
| low | getRunway が Infinity を返し JSON化で null に、無限runwayとデータ無しを区別不可 | apps/api/src/cashflow/cashflow.service.ts:89-106 | 上限定数(例999)や null を明示返却しフロント規約と整合 |
| low | 月次レビュー承認に状態遷移ガードが無く不正遷移可・並行approveで後勝ち | apps/api/src/monthly-review-approval/monthly-review-approval.service.ts:91-129 | 許可遷移を検証、updateMany 条件付き更新か version列で楽観ロック |
| low | 日付クエリの未検証 new Date() が Invalid Date で 400 でなく 500 を誘発 | apps/api/src/actuals/actuals.service.ts:15-23 | isNaN(d.getTime()) 検証の共通バリデータ、または @IsDateString |
| low | 元利均等返済で最終月に残高をゼロ丸め込まず端数残高が残る | apps/api/src/simulation/simulation.service.ts:86-99 | isLast の月は principalPart=残高 とし最終 balance を0に |

### 財務・会計計算の正確性

| 重大度 | タイトル | file:line | 推奨 |
|--------|---------|-----------|------|
| medium | 実績CSV取込が単純カンマ分割で金額のカンマ・引用符を扱えない | apps/api/src/actuals/actuals.service.ts:39,65,70 | csv-parse 等の正規パーサ、amount はカンマ/通貨記号除去+妥当性検証 |
| low | 消費税の端数処理に四捨五入(round)を使用(切り捨て原則違反) | apps/api/scripts/analyze.py:500-505,535-542 | (amt*10)//110 等の整数除算で切り捨てに統一、80%控除も整数演算 |
| low | analyze.py の safe_int が小数文字列を0に握り潰す | apps/api/scripts/analyze.py:89-94 | 0埋めせずパース不能件数をログ/警告に残し可視化 |
| info | 予実差異・前年比の按分や符号は妥当(確認結果) | apps/api/src/reports/reports.service.ts:126-159,274-292 | 対応不要。比率・指標の Math.round は表示用途で実害なし |

### データ層・Prisma

| 重大度 | タイトル | file:line | 推奨 |
|--------|---------|-----------|------|
| high | 複合unique制約に nullable department_id を含め部門なし行の重複を防げない | packages/database/prisma/schema.prisma:512(actual)/486(budget) | NOT NULL センチネル化、または partial unique index 2本+バックフィル |
| high | actuals CSVインポートの upsert が null 部門で既存行にマッチせず重複/失敗 | apps/api/src/actuals/actuals.service.ts:99-124 | スキーマを NOT NULL センチネル化、暫定は findFirst フォールバック |
| medium | MF同期がアカウント×月セル単位で findFirst→update/create を逐次実行する N+1 | apps/api/src/sync/sync.service.ts:290-344, 33-101 | findMany でメモリ化→createMany/updateMany バッチ、$transaction で囲む |
| low | public 全テーブルで RLS 有効だがポリシーが無くテナント分離はアプリ層 where のみ依存 | packages/database/prisma/migrations/20260529090000_enable_rls_on_public_tables/migration.sql:9-25 | where監査(lint/test)整備、または DBロール+SET LOCAL の RLS導入、新規テーブルCI チェック |
| low | 核となる財務テーブルの科目FKが単一列idでテナント越え参照を DB が防げない | packages/database/prisma/schema.prisma:483-484(Budget)/509-510(Actual)/540-541(Journal) | AccountMaster に @@unique([id,tenantId,orgId])、参照を複合FKに |
| low | AiComment にインデックスが無く report_id(FK) も未インデックス | packages/database/prisma/schema.prisma:625-641 | @@index([reportId])、できれば @@index([reportId, createdAt]) |
| low | 科目削除時の journal_entries OR count に FK列インデックスが無い | apps/api/src/masters/masters.service.ts:131-146 | debit/credit 各列の複合インデックス追加、または2回 count に分割 |
| low | findAccessibleOrganizations がテナントごと findMany する N+1+全列フェッチ | apps/api/src/auth/authorization.service.ts:83-96 | tenantId を集約し in 句1クエリ化、select で必要列のみ |
| low | ChoshoVersion 保存が行数ぶん tx.choshoRow.create を逐次実行(tx内 N+1) | apps/api/src/chosho/chosho.service.ts:130-156 | level単位 createMany、または rowKey をアプリ生成し一括 createMany、tx timeout 引上げ |

### フロントエンド(Next.js)

| 重大度 | タイトル | file:line | 推奨 |
|--------|---------|-----------|------|
| high | 予算承認ワークフローが完全にクライアントローカルで永続化されない | apps/web/src/app/budget/page.tsx:93-145, 292-350 | バックエンドに status を持たせ useQuery/useMutation で永続化、当面は承認ボタン非表示 |
| medium | 設定の通知トグルが永続化されないダミーUI | apps/web/src/app/settings/page.tsx:56-61,230,410-414,443-461 | 通知設定の取得/保存API を用意、未実装の間はカード非表示 |
| medium | CashflowCertaintyEditor が initialRules 変更を再同期せず組織切替でstale | apps/web/src/app/settings/page.tsx:1043-1075,1088-1127 | key={orgId} で再マウント、または initialRules を deps にした再同期effect |
| low | OrgSwitcher での組織切替が token/user.role を更新せず role gating と表示が乖離 | apps/web/src/components/layout/org-switcher.tsx:105-108 | gating の真実源を org スコープ membership(currentRole/capabilities)に統一 |
| low | AI系クエリの runwayMode が非リアクティブな localStorage直読みで真実源が二重化 | apps/web/src/hooks/use-mf-data.ts:93-97,106,130,141,153 | runwayMode を単一reactiveソース(zustand等)に統一 |
| low | 仕訳フラグがジャーナル実際の月でなくグローバル選択月で記録される | apps/web/src/app/accounting-review/_tabs/journal-tab.tsx:245-256,272-279 | フラグの month を対象仕訳の transaction_date から導出 |
| info | useFeatureStateLocal に毎renderで新しい defaultValue オブジェクトを渡している | apps/web/src/app/year-end-review/_sections/11-loan-proposal.tsx:51-55 | モジュールスコープ定数で安定参照を渡す |

### セキュリティ堅牢化

| 重大度 | タイトル | file:line | 推奨 |
|--------|---------|-----------|------|
| high | ログイン等の認証エンドポイントにレート制限が無く総当たり可能 | apps/api/src/auth/auth.controller.ts:37-46 | IP+メール単位のレート制限と連続失敗時バックオフ/一時ロック |
| medium | CSRFガードが Cookie が無いと無条件パスする(Double Submitの欠陥/fail-open) | apps/api/src/auth/csrf.guard.ts:39-43 | 認証Cookie(sb_token)有無で判定し、Bearer無しなら CSRFトークン一致必須 |
| medium | Prisma例外の詳細メッセージを本番でもクライアントに返す情報漏洩 | apps/api/src/filters/http-exception.filter.ts:34-41 | 本番は汎用メッセージのみ返却、詳細はサーバーログ、コードも返さない |
| medium | トークン暗号鍵が未設定だと外部連携トークンが平文DB保存(fail-open) | apps/api/src/common/crypto.util.ts:62-65 | main.ts で本番時 MF_TOKEN_ENCRYPTION_KEY を必須化し throw |
| medium | 多数エンドポイントがインラインBody型で class-validator を完全バイパス | apps/api/src/chosho/chosho.controller.ts:233-261,335-362 | 全Bodyを専用DTOクラス化、urls は @IsUrl、body は @MaxLength |
| low | kintoneクエリのエスケープ実装が関数ごとに不統一でクエリ注入の余地 | apps/api/src/kintone/kintone-api.service.ts:124-129,213-214,75-78 | エスケープを単一ユーティリティに集約、() " \ を一貫処理(危険文字reject) |
| low | CORS_ORIGIN がカンマ区切り複数オリジンを正しく解釈しない | apps/api/src/main.ts:22-25 | .split(',').map(trim) で配列化、ドキュメントとコードの不一致解消 |
| low | Slack Webhook送信にドメイン許可リストが無く設定値次第でSSRF | apps/api/src/copilot/copilot.service.ts:406-409 | https かつ hooks.slack.com 限定バリデーション、maxRedirects:0 |
| info | 監査ログ書き込み失敗を console.error に出力(エラー詳細露出の軽微な懸念) | apps/api/src/common/audit-log.interceptor.ts:62-64 | console を Nest Logger に統一、本番は本文抑制+Sentry |

### アーキテクチャ・保守性

| 重大度 | タイトル | file:line | 推奨 |
|--------|---------|-----------|------|
| medium | AuthModule ↔ MfModule の循環依存(MF OAuth が auth に混在) | apps/api/src/auth/mf-oauth.controller.ts:19,27-34 | MfOAuthController を mf モジュールへ移設し循環を解消 |
| medium | フィーチャーモジュール14個が forwardRef(()=>AuthModule) を強要されている | apps/api/src/auth/auth.module.ts:15-37 | Guard/AuthorizationService を独立 AuthCoreModule に切出し forwardRef 撤廃 |
| medium | packages/shared が両アプリから一切 import されない死蔵パッケージ、format/types 重複 | packages/shared/src/utils/format.ts:1-67 | 消費するか削除するか方針決定。継続なら format/型/マスタをここへ一本化 |
| medium | formatManYen/formatYen が shared と web で挙動が食い違う二重正本 | apps/web/src/lib/format.ts:7-17 | 「入力は円か万か」の規約を統一し正本を1ファイルに集約 |
| medium | formatYen がページごと別実装で4種以上に分裂(同名・異挙動) | apps/web/src/app/simulation/page.tsx:34-43 | 用途別に命名分けた共通関数を用意しローカル定義撤廃 |
| medium | Severity ユニオン型と色/ラベルマップが web 全体で再定義・不統一 | apps/web/src/components/dashboard/sentinel-card.tsx:16-22 | Severity 型と severity→{color,label,emoji} マップを1モジュールに集約 |
| medium | Slack通知の送信処理が3モジュールで重複実装(共通 SlackClient 不在) | apps/api/src/year-end-state/year-end-state.service.ts:40-71 | SlackNotifierService に統一、blocksビルダーとトランスポートを分離 |
| low | formatRelative(相対時刻)が5ファイルにほぼ同一コピペ | apps/web/src/components/dashboard/agent-activity-card.tsx:34-44 | lib/shared に formatRelativeTime を1つ作り5箇所置換、表記揺れ統一 |
| low | resolveTenantId(orgId) が3サービスで重複定義 | apps/api/src/data-health/data-health.service.ts:80-89 | 共有サービスに1つ置き DI で利用、not-found を NotFoundException に |
| low | resolveTenantId 等で plain Error を throw → グローバルフィルタで500になる | apps/api/src/data-health/data-health.service.ts:86-88 | NotFoundException に置換しサービス層のエラー方針を統一 |
| low | 業種マスタ INDUSTRIES が API と web で手動ミラー(ドリフトリスク) | apps/api/src/common/industries.ts:1-20 | INDUSTRIES を packages/shared に置き双方 import、手動同期廃止 |
| low | ROLE_READ/ROLE_WRITE/ROLE_APPROVE が定義のみで未使用(死にコード) | apps/api/src/auth/role-helpers.ts:12-27 | 未使用なら削除、使うなら Guard/permission で参照し単一の真実に |
| low | ai/chosho/mf-transform の巨大ファイル・巨大メソッド | apps/api/src/ai/ai.service.ts:496-1416 | プロンプトを *.prompt.ts へ抽出、取得/整形/呼出/後処理をサブサービス分割 |
| low | lib/api.ts が単一2455行の巨大 API クライアント(変更集中点) | apps/web/src/lib/api.ts:431-2455 | 名前空間単位で lib/api/<domain>.ts に分割、barrel で再合成 |

### パフォーマンス

| 重大度 | タイトル | file:line | 推奨 |
|--------|---------|-----------|------|
| medium | MF同期処理が行ごとに逐次SQL発行(N+1書込)、O(rows)のラウンドトリップ | apps/api/src/sync/sync.service.ts:70-111,290-344 | accountMaster/actualEntry を一括 findMany→Map化、createMany+updateMany を $transaction バッチ化 |
| medium | 朝サマリーCronが対象Orgを逐次処理、各OrgでMF API+LLMを直列実行 | apps/api/src/briefing/briefing-scheduler.service.ts:48-92 | p-limit で並列度制御、またはキュー+worker分散 |
| low | findAccessibleOrganizations がテナント数ぶん findMany をループ発行 | apps/api/src/auth/authorization.service.ts:83-96 | in 句の単一クエリにまとめ、request スコープでメモ化 |
| low | org/tenant 解決が1リクエストあたり最低3回の未キャッシュDBクエリ | apps/api/src/prisma/prisma.service.ts:22-31 | Guard で解決した {orgId,tenantId} を request に載せ再利用、短TTLキャッシュ |
| low | listFlags/listComments がページング無しで期間内・Org内の全件を返す | apps/api/src/journal-review/journal-review.service.ts:27-52,188-203 | listFlagsPage を標準経路に、listComments は journalIds 必須化かページング |
| low | CacheService がプロセスローカルで複数インスタンスでヒット率低下 | apps/api/src/common/cache.service.ts:4-30 | スケールアウト前提なら Redis 等の共有キャッシュへ移行 |
| low | RiskScanOrchestrator の finding がルールごとに upsert を N回逐次実行 | apps/api/src/sentinel/risk-rules/orchestrator.service.ts:97-116,150-198 | draft を集約し $transaction でまとめ upsert、最低 Promise.all で並行化 |

## 横断的に見えた傾向・構造的課題

1. **nullable 複合ユニークの一点が3つの障害に連鎖している。** `departmentId` を nullable のまま複合ユニークに含めた設計判断が、(a)CSV再インポートの二重計上(high)、(b)差異レポートの集計誤り(high)、(c)upsert が使えないことによる N+1 性能劣化(medium×2)を同時に引き起こしている。スキーマ層の NOT NULL センチネル化が最もレバレッジの高い1手。

2. **「見た目だけの機能」が複数存在し、ユーザー誤認のリスクが高い。** 予算承認ワークフロー(high)、通知トグル(medium)はいずれもUIだけ実装され永続化が無く、操作しても何も起きない。経営判断に使うダッシュボードでこれは信頼性そのものを損なう。永続化するか、未実装を明示するかの二択を急ぐべき。

3. **同名・別実装の重複が品質ドリフトの温床。** formatYen/formatManYen(挙動が食い違う二重正本〜4種分裂)、Severity 型・色マップ、Slack通知、resolveTenantId、業種マスタ、formatRelative が各所でコピペされ、`packages/shared` は死蔵。単一の真実源(共有パッケージ)が機能していないことが構造的根因。

4. **モジュール境界の崩れ。** MF OAuth が auth に混在したことで AuthModule が循環ハブ化し、14モジュールが forwardRef を強要されている。認可の共有部品とMF認証フローの分離が必要。

5. **N+1 書き込みが API 全域に分布。** MF同期、Chosho保存、Risk finding、briefing Cron、authorization と、ループ内逐次 await が繰り返し現れる。リポジトリ内の journal-review の chunked createMany が良い手本として既にある。

6. **secure-by-default になっていない箇所が散在。** opt-in の JwtAuthGuard、fail-open の CSRFガード・トークン暗号鍵、レート制限欠如、インラインBody型による検証バイパスなど、「設定漏れ/付け忘れが公開・平文・無検証にフェイルする」設計が複数ある(過去 memory の auth_secure_by_default 指摘とも整合)。

7. **会計の確立ルール違反。** analyze.py の消費税端数が四捨五入で、社内ルール「消費税は必ず切り捨て」に反する。

## 推奨アクションプラン(優先順位付き)

**フェーズ1: 財務数値の正確性を止血(最優先・今すぐ)**
1. `schema.prisma` の departmentId を NOT NULL センチネル化し、既存重複データを集約するバックフィル migration を実施(high #3/#4 の根本対応)。
2. 上記完了後、importCsv の upsert を機能させる。当面の暫定として findFirst フォールバックへ揃える(high #1)。
3. getVarianceReport の actualMap/priorYearMap を加算に修正し全部門合算(high #2)。
4. MF同期の月キーを UTC月初に統一(当月二重計上の medium)。
5. analyze.py の消費税端数を切り捨て整数演算に修正(社内ルール準拠)。

**フェーズ2: 機能の誠実性とセキュリティ(早期)**
6. 予算承認ワークフローを永続化、または承認ボタンを非表示にして未実装を明示(high #5)。通知トグルも同様(medium)。
7. /auth/login・/auth/refresh にレート制限とバックオフ/ロックを導入(high #6)。
8. CSRFガードを認証Cookie有無ベースの判定に修正、本番での Prisma例外メッセージ抑制、MF_TOKEN_ENCRYPTION_KEY の本番必須化(medium×3、いずれも fail-open/情報漏洩)。
9. インラインBody型を専用DTOクラス化し class-validator を効かせる(medium)。

**フェーズ3: 性能とスケール(中期)**
10. MF同期と各 N+1 書き込みを findMany→createMany/updateMany の $transaction バッチへ(medium×2 + low群)。journal-review の実装を手本にする。
11. briefing Cron を p-limit で並列化。
12. org/tenant 解決の重複クエリ排除、findAccessibleOrganizations の in 句化。

**フェーズ4: アーキテクチャ・保守性の整理(継続)**
13. AuthCoreModule を切り出し循環依存と forwardRef を解消(medium×2)。
14. packages/shared を実稼働させ、formatYen/Severity型/業種マスタ/formatRelative/resolveTenantId を一本化(medium・low多数)。同名異挙動の解消が最優先。
15. 巨大ファイル(ai.service/chosho.service/lib/api.ts)の分割、死にコード削除、plain Error→NotFoundException 統一。

**フェーズ5: 防御の底上げ(設計レベル)**
16. JwtAuthGuard をグローバル化し @Public() opt-out 方式へ転換、ログイン時のメンバーシップ検証、RLS方針の明文化と where 句 CI チェック、kintone/Slack/CORS の入力検証統一。
