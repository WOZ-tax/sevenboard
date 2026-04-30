# 権限設定・テナント分離 ストリクトレビュー

作成日: 2026-04-30

## 前提

- Railway の停止・削除は最後に回す。
- Cloud Run 一本化を前提にする。
- テナントは「会計事務所」単位。
- 現段階の分離方式は論理分離。共有 DB に `tenantId` を持たせ、将来 `dedicated_database` へ移れる構造にする。
- SystemMaster は全テナント共通の標準テンプレート。実データや事務所固有設定は置かない。

## 今回コード側で進めたこと

- 主要 business data table に `tenantId` を追加した。
- `Organization` との FK を `orgId` 単独ではなく `(orgId, tenantId)` に寄せた。
- `PrismaService.orgScope(orgId)` を追加し、service 層で `tenantId + orgId` を解決するようにした。
- `AuthorizationService` を tenant / organization membership ベースに整理した。
- 旧 `User.role + User.orgId` fallback は `AuthorizationService` から外した。
- `/auth/me/memberships` は tenant membership / organization membership から返すようにした。
- `/advisor` は `owner = 全 org` ではなく、`AuthorizationService.findAccessibleOrganizations()` に一本化した。
- Kintone 側の `OrgAccessService` は `all` wildcard を返さず、アクセス可能な orgId 配列だけを返す形にした。
- MF OAuth state は `tenantId + orgId + userId` で検証する。
- Frontend の current-org membership 型に `tenantId`, `tenantRole`, `orgRole`, `side` を追加した。

## 仮想テスト結果

| ケース | 判定 | 理由 |
| --- | --- | --- |
| Firm owner A が tenant A の全 org を見る | OK | active `TenantMembership(firm_owner)` から tenant A の org だけを取得する |
| Firm owner A が tenant B の orgId を直接叩く | NG | `tenantMembership(userId, tenantB)` が無いので `assertOrgPermission` で拒否 |
| Firm advisor が未担当 org を読む | NG | tenant role だけでは tenant-wide read を持たず、org membership が必要 |
| Client viewer が自社 org を読む | OK | `OrganizationMembership(side=client, role=viewer)` の read permission で許可 |
| Client viewer が AI / sync / agent run を実行・閲覧 | NG | `org:ai:run`, `org:sync:run`, `org:agent_runs:read` は client read から除外 |
| OAuth callback の state を別 tenant/org に差し替える | NG | callback で `tenantId` mismatch を検出 |
| `/advisor` で owner が全 tenant を見る | NG 化済み | accessible org 解決を tenant/org membership 経由に変更 |
| Kintone record 更新で担当外 mfCode を指定 | NG 化済み | mfCode から org を引き、accessible orgId に含まれるか確認 |

## 検証済みコマンド

```bash
npm exec -w packages/database -- prisma validate --schema=prisma/schema.prisma
npm run build -w apps/api
npm test -w apps/api -- --runInBand
npm run build -w apps/web
```

結果:

- API build: pass
- API test: 6 suites / 56 tests pass
- Web build: pass
- Prisma schema validate: pass

## 追加で解消した穴

### `/internal/users` の tenant-scoped 化

旧 `/internal/users` は廃止方向にし、会計事務所スタッフ管理を `/tenants/:tenantId/staff` に移した。

- 認可は `PermissionGuard + tenant:staff:read/manage`。
- `firm_owner` だけが staff 管理できる。
- staff の実権限は `TenantMembership` を正とする。
- `platform_owner` はこれだけでは業務データを読めない。
- SevenBoard 運営者をサポート用途で業務データに入れる場合は、対象 tenant から通常 staff として招待する。
- 既存ユーザーはメールアドレスだけで招待可能。新規ユーザーは名前と初期パスワードが必要。
- staff 権限削除は user 削除ではなく `TenantMembership.status = revoked` とし、その tenant 内の advisor assignment だけ解除する。
- 最後の `firm_owner` は削除・降格できない。

追加テスト:

- 既存 platform owner を tenant staff として招待できる。
- 新規 staff 作成では名前と初期パスワードが必要。
- 最後の `firm_owner` は削除できない。
- staff 権限削除で user account 自体は削除しない。
- `platform_owner` 単体では tenant の業務データを読めない。

## ストリクトレビューで残った穴

### 1. `InternalStaffGuard`, `RolesGuard`, `OrgAccessGuard`, `staff.helpers.ts` が legacy として残っている

主要 org-scoped controller は `PermissionGuard` へ移行済みだが、legacy helper はまだコード上に残っている。

本番前には以下のどちらかにする。

- 完全削除する。
- 互換用として残す場合も `@deprecated` として新規利用を禁止し、lint / test で controller 使用を検出する。

### 2. Frontend はまだ `user.role` を見ている箇所がある

API 側の最終認可は効くので即時の情報漏洩ではないが、UI 表示やボタン表示が古い role 前提でズレる可能性がある。

対象例:

- `/comments`
- `/advisor`
- monthly review approval card
- sidebar role label

次は `currentOrg.currentRole` または backend が返す `effectivePermissions` に寄せるべき。

`/advisor/staff` の閲覧可否は `currentOrg.tenantRole === 'firm_owner'` に移行済み。

### 3. RLS はまだ未実装

現在は application-level authorization + `tenantId` query 条件で守っている。

本番グレードにするなら、高リスク table から PostgreSQL RLS を入れる。

優先:

- `integrations`
- `audit_logs`
- `agent_runs`
- `reports`
- `journal_entries`
- `actual_entries`
- `notifications`

### 4. 親経由 tenant の table が残っている

今回 `tenantId` を直接持たせたのは主要 org-owned table。
一方で、以下は親を経由して tenant が決まる。

- `BudgetVersion`
- `BudgetEntry`
- `AiComment`
- `ActionEvent`

設計としては成立するが、クエリ漏れを機械的に防ぎにくい。正式リリース前に直接 `tenantId` を持たせるか、親 join を必須にする test を追加する。

### 5. Kintone / 外部連携 secret は tenant 専用化が必要

今は Kintone credential がグローバル env 前提。
他の会計事務所に売るなら、少なくとも tenant ごとに secret を分ける。

推奨:

```text
sevenboard/prod/tenant/{tenantSlug}/kintone-api-token
sevenboard/prod/tenant/{tenantSlug}/slack-webhook
```

### 6. migration は実 DB で dry-run が必要

Prisma schema validate は通っているが、既存 DB の index / constraint 名と完全一致するかは本番相当 DB で確認する。

必須:

- backup
- staging DB restore
- migration dry-run
- row count / tenant backfill 検証
- representative API smoke test

## 次にやるべき順番

1. Frontend の残り `user.role` 判定を current org membership / permission ベースへ寄せる。
2. 旧 guard / helper の撤去または新規利用検出テストを追加する。
3. 親経由 tenant table の扱いを決める。
4. tenant isolation の integration test を追加する。
5. staging DB で migration dry-run。
6. Cloud Run secret / env / OAuth redirect の本番設定。
7. Cloud Run 側の疎通確認後、最後に Railway を停止・secret rotate・削除する。
