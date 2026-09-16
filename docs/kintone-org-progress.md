# kintone月次進捗の顧問先別取得

## 問題と修正

旧`/kintone/monthly-progress/by-mf/:mfCode`は、アクセス可能な顧問先の`Organization.code`とMF事業者番号を照合していた。顧問先コードが空欄・独自コードの場合、MF連携が正常でも403となる。

新しい`GET /organizations/:orgId/kintone/monthly-progress?fiscalYear=2026`では、既存のJwtAuthGuard / PermissionGuardで`org:mf:read`を確認した後、その顧問先のMF接続先から事業者番号を取得する。クライアント指定のMF番号や顧問先コードには依存しない。kintoneレコード未登録時は`{ record: null }`を返す。

ステータス更新も`PUT /organizations/:orgId/kintone/monthly-progress/:recordId`へ移行。`org:mf:read`・`org:monthly_close:manage`・内部スタッフ制約に加えて、対象レコードのMF事業者番号が選択顧問先の接続先と一致することを確認する。

コントローラーは既にMfApiServiceとKintoneApiServiceを参照できるMfModuleへ登録し、新しいモジュール循環は追加しない。旧エンドポイントの認可は維持する。

## ブラウザー

- ヘッダー・期間デフォルト・経理画面は共通の`useKintoneProgress`を使用。
- キャッシュキーを顧問先IDと数値の会計年度に統一。従来の年度の文字列/数値による二重取得を解消。
- 会計年度と認証状態が確定してから取得。
- 403等の恒久的な4xxは再試行せず、一時障害は1回まで。エラー後の再マウント、フォーカス、再接続による自動再試行を停止。
- 顧問先・年度切替は別キーとして取得し、ステータス更新成功時は既存のinvalidateで再取得。

## 検証

- API HTTPテスト11件：正常取得、別顧問先拒否、未認証、未登録、接続先不明、不正年度、正常更新、別レコード拒否、別顧問先更新拒否、権限不足、月の検証。
- Web純関数3件：4xx停止、一時障害の上限、キャッシュの分離。
- ブラウザー7項目：取得の集約、顧問先/年度切替、403停止、未登録、一時障害、更新先、ロカベン表示。
- API/Webビルドと変更WebファイルのESLint。
