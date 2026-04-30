# Railway Shutdown Runbook

作成日: 2026-04-30

## 目的

SevenBoard API を Cloud Run に一本化し、旧バックエンド実行面を完全に停止・削除する。

## 削除前チェック

- Cloud Run production の `/health` が成功する。
- Vercel production の `NEXT_PUBLIC_API_URL` が Cloud Run URL を指している。
- Web CSP から旧バックエンドドメインが消えている。
- MoneyForward OAuth redirect URI が Cloud Run callback URL に変更済み。
- Cloud Run に必要な secret が Secret Manager から注入されている。
- 旧環境に入れていた secret のローテーション予定がある。
- 旧環境がDBを持っていた場合、必要なバックアップまたは移行が完了している。

## 推奨手順

1. Vercel production を Cloud Run API 向けに再デプロイする。
2. Cloud Run logs で本番トラフィックが来ていることを確認する。
3. 旧バックエンドURLへのアクセスが残っていないことを確認する。
4. 旧環境の環境変数を削除する。
5. 旧サービスまたは旧プロジェクトを削除する。
6. 旧環境に保存していた secret を発行元でrotateする。
7. repo 内検索で旧バックエンドURLがCSPや運用手順に残っていないことを確認する。

## CLIで削除する場合

Railway公式CLIでは、project削除は `railway delete` または `railway project delete` を使う。削除は不可逆なので、最初は `-y` を付けず確認プロンプトを通す。

```powershell
railway login
railway list
railway delete --project <PROJECT_ID_OR_NAME>
```

2FAが有効な場合:

```powershell
railway delete --project <PROJECT_ID_OR_NAME> --2fa-code <CODE>
```

最終自動化時だけ:

```powershell
railway delete --project <PROJECT_ID_OR_NAME> --yes
```

注意:

- `railway down` は最新のsuccessful deploymentを消すだけで、service/project自体は残る。
- 完全に止める目的ならproject削除、または管理画面のDanger tabからDelete Projectを使う。
- 削除後も、旧環境に入れていたsecretは発行元でrotateする。

## 削除後チェック

- VercelからCloud Run APIへの主要画面操作が成功する。
- 旧バックエンドURLへアクセスできない。
- repo 内のCSPに旧バックエンドドメインがない。
- Cloud Run logs / Sentry / Uptime監視が正常。
- Google Secret Managerのproduction secret versionが明示的に管理されている。

## 参考

- Railway CLI delete: https://docs.railway.com/cli/delete
- Railway project delete: https://docs.railway.com/cli/project
- Railway project deletion UI: https://docs.railway.com/guides/projects
- Railway down behavior: https://docs.railway.com/cli/down
