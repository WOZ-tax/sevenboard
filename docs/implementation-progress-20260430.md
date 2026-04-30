# SevenBoard 実装進捗メモ

作成日: 2026-04-30

## 今回実装済み

- Prisma に論理マルチテナントの土台を追加した。
  - `Tenant`
  - `PlatformMembership`
  - `TenantMembership`
  - `Organization.tenantId`
  - `OrganizationMembership.tenantId / side`
  - `SystemMasterCatalog`
  - `SystemMasterVersion`
  - `OrganizationMasterSource`
- 既存 SEVENRICH 環境を default tenant に戻す migration を追加した。
- `AuthorizationService` / `PermissionGuard` / `RequirePermission` / permission catalog を追加した。
- org scope の controller から、実利用としての旧 `OrgAccessGuard` / `RolesGuard` 依存を外した。
- 主要 API を permission ベースに移行した。
  - organization
  - master / user
  - MoneyForward OAuth / integration
  - sync / data-health / agent-runs
  - budgets / actuals / cashflow / reports / comments
  - actions / business-events / calendar
  - monthly-close / monthly-review / cashflow-certainty
  - ai / copilot / drafter / auditor / sentinel / alerts / triage / briefing
  - notifications / MF read APIs / simulation / onboarding
- AI や agent run を発生させる入口は `org:ai:run` に寄せ、client 側ユーザーからは起動できない設計にした。
- client 側は原則 read-only、会計事務所側の担当者だけが更新・インポート・承認・AI 実行をできるようにした。
- MF OAuth state に `tenantId` を含め、callback 時に tenant mismatch を検出するようにした。
- 旧 `/internal/users` を tenant-scoped な `/tenants/:tenantId/staff` に作り替えた。
  - staff 権限は `TenantMembership` を正とする。
  - `firm_owner` だけが staff 管理できる。
  - 既存 `platform_owner` は、対象 tenant から招待されない限り業務データを読めない。
  - 既存ユーザーはメールアドレスだけで staff 招待できる。
  - staff 権限削除は user 削除ではなく membership revoke にした。
- Railway 前提の repo 設定を削除し、Cloud Run 前提のドキュメントと runbook を追加した。

## 検証済み

```bash
npm run db:generate
npm exec -w packages/database -- prisma validate --schema=prisma/schema.prisma
npm test -w apps/api -- authorization.service.spec.ts internal-users.service.spec.ts --runInBand
npm run build -w apps/api
npm test -w apps/api -- --runInBand
npm run build -w apps/web
```

直近の API 全体テストは `6 suites / 56 tests` が pass。

## まだ残っている重要課題

1. 残りの業務データ table に `tenantId` を追加する。
2. service 層の全 query に `tenantId + orgId` の複合条件を入れる。
3. 重要 table に composite FK を張り、`orgId` だけでは cross-tenant 参照できない形にする。
4. PostgreSQL RLS を入れるか、少なくとも migration と Prisma middleware で tenant 条件漏れを検知する。
5. 新しい会計事務所 tenant を作る onboarding script を作る。
6. Cloud Run 本番 secret を Secret Manager version pin で注入し、Railway 側 secret を rotate してから停止・削除する。

## 判断

正式リリース前なので、ここまでの権限モデル刷新はやる価値がある。  
ただし、route-level authorization だけでは production-grade のマルチテナント分離としては不十分。次は DB schema と query-level isolation に進むべき。
