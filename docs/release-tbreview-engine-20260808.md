# リリースノート: 経理レビューエンジンの tb-review 移行（2026-08-08）

`/accounting-review` の「経理レビュー」タブのエンジンを、自前 analyze.py（subprocess）から
**tb-review 決定論エンジン**（tb-review-api / Cloud Run・月次86項目 + 消費税4階層ルールベース +
仕訳異常の3エンジン）へ切り替えた。`REVIEW_ENGINE=tbreview` によるサービス全体切替
（org 別ではない）。ロールバックは env 除去（→legacy）または旧リビジョンへのトラフィック復帰。

## 強化される検出（Gozal canary 実測: 11件→18件）

- 消費税4階層ルールベース: 社宅家賃(JCT-HOUSING)・礼金/更新料(JCT-KEY-MONEY)・輸出売上確認・
  借方税区分の摘要整合など、税区分の「用途で分かれる論点」の確認アラートが大幅に深くなる
- 国外SaaSリバースチャージ検出（AWS/Anthropic/GitHub/Adobe等・単語境界付きで LAWSON→AWS 型誤検知なし）
- 前期比較の未実施などの「やっていないことの開示」（失敗≠指摘ゼロ契約）
- 入力変換の非可逆置換（CP932非対応文字）を件数付きで開示

## ⚠️ 弱くなる/無くなる検出（意図的なエンジン置換によるもの）

- **重複仕訳**: legacy は HIGH で個別列挙していたが、tb-review は同型集約のうえ
  「参考（要確認候補）」として扱う思想（重要度が下がる）
- **PL連続赤字（連続営業損失）検出**: tb-review 月次チェックに対応項目がなく、**検出されない**
- legacy の PL/BS/クロスチェック集計セクション（画面の生JSON表示部）は空になる
  （指摘一覧は上記のとおり強化される）

## 運用

- タイムアウトチェーン: sevenboard-api inbound 900s > tbreview-client 840s > エンジン合計最大720s
- tb-review-api は IAM 認証（invoker = sevenboard-api-prod SA のみ）・同一イメージを
  tb-review-web（IAP・人間用）と共有
- ルール正本は G:119_定期実行/skills/tb-review。ルール更新の反映は
  brain-team/projects/tb-review-web の sync-vendor.sh → tb-review-web/api の再デプロイ
