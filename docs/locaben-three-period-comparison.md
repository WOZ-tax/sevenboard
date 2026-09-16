# ロカベンの3期比較

- ヘッダーの選択年度・前年度・前々年度を、青（実線）・橙（破線）・紫（点線）で重ねる。凡例で各期を表示・非表示にできる。
- 月指定時は各期の同じ月までの累計、通期選択時は各期の年間データを使う。前年売上も同じ対象月まで取得する。進行中の期はMF入力済みの実績であり、年換算・着地予想ではない。
- 3期とも選択業種の同じベンチマークを使用する。従来どおり業種平均100、0〜200にクリップし、低いほど良い指標は反転する。ロカベン公式の5段階評点ではない。
- 未入力・算出不能はnullのまま。Rechartsはnullを中心に配置するため、独自shapeで欠損頂点と隣接辺を省く。6指標が揃った期だけ面を描く。実績値はホバーと「3期の実績値を見る」で確認できる。
- MFの会計期間一覧にない年度は取得せず「会計期間なし」と表示する。特定年度の取得失敗時はその期の図形を隠し、他の期は表示する。

## 入力と保存

元データの年度ボタンで、編集する期を切り替える。従業員数を含む手入力は既存feature-state APIを使用し、`locaben.source-overrides` / scope=`{MF年度}:{対象月|full}`に明示的な入力だけを保存する。MFの自動取得値は保存せず、取得のたびに反映する。DBの変更は不要。

手入力の0と意図的な空欄を保持する。「MF値に戻す」では当該キーを削除する。顧問先・年度・対象月の切り替えで別スコープの値を引き継がない。保存は600msでまとめ、順序を保証する。保存失敗時は未保存と表示して再試行できる。閲覧だけでは書き込まない。

旧`locaben_states.values/manualKeys`には対象期情報がないため、自動で3期に流用しない。保存済みの手入力を一覧で確認し、指定した期に反映できる。旧データは削除しない。業種・非財務シートは従来どおり顧問先共通。Excelは元データで選んでいる期を出力する。

## 確認

```text
npm test -w apps/api -- --runInBand locaben
node --test apps/web/src/lib/locaben/comparison.spec.mjs
npm run lint -w apps/web -- src/app/locaben/page.tsx src/app/locaben/_components/comparison-radar.tsx src/hooks/use-locaben-comparison.ts src/lib/locaben/comparison.ts
npm run build -w apps/api
npm run build -w apps/web
```

ブラウザーでは3期の色分け・凡例切替・過年度の保存・欠損表示・月別保存・旧入力の引継ぎ・保存失敗・一部年度の取得失敗・年度切替・390px表示・顧問先切替・会計期間不足を架空APIで検証する。
