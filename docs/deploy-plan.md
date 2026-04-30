# SevenBoard デプロイ計画

作成日: 2026-04-30

## 現行方針

SevenBoard は Cloud Run に一本化する。

```txt
Browser
  -> Vercel Web
      NEXT_PUBLIC_API_URL=https://sevenboard-api-889940418983.asia-northeast1.run.app
  -> Cloud Run API
      Secret source: Google Secret Manager
      Runtime identity: user-managed service account
  -> DB / MoneyForward / Kintone / AI Provider / Sentry
```

旧構成のバックエンド実行基盤は廃止対象。新規の本番運用、CSP、OAuth redirect URI、環境変数、ドキュメントは Cloud Run を正とする。

## 環境設計

| 環境 | フロント | バックエンド | DB |
| --- | --- | --- | --- |
| dev | localhost | localhost | local / dev DB |
| staging | Vercel Preview | Cloud Run staging | staging DB |
| production | Vercel Production | Cloud Run production | production DB |

## 本番デプロイ要件

- API は Cloud Run の user-managed service account で実行する。
- 本番 secret は Google Secret Manager に置く。
- Cloud Run の secret 参照は version pin を基本にする。
- Vercel の `NEXT_PUBLIC_API_URL` は Cloud Run URL を指す。
- Web CSP の `connect-src` は Cloud Run と必要な外部 API のみにする。
- DB migration は本番デプロイ前に `prisma migrate deploy` で適用する。
- Cloud Run health check は `/health` を使う。

## 関連ドキュメント

- [Cloud Run security plan](./cloud-run-security-plan.md)
- [Railway shutdown runbook](./railway-shutdown-runbook.md)
- [Multitenancy architecture](./multitenancy-architecture.md)
