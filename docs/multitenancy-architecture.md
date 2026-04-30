# SevenBoard マルチテナント設計メモ

作成日: 2026-04-30

## 結論

他の会計事務所へSevenBoardを販売する前提なら、正式リリース前にマルチテナント設計を入れ直す価値がある。

現行の `User.role + User.orgId` を拡張して「会計事務所tenant」を表現する案は採用しない。短期的には動かせても、事務所オーナー、顧問担当者、顧問先ユーザー、SevenBoard運用者の境界が混ざり、権限事故を起こしやすい。

ベストプラクティスとしては、次の6層で分ける。

1. `User`: 認証された人間のアイデンティティ。権限は直接持たせない。
2. `PlatformMembership`: SevenBoard運用者の権限。
3. `SystemMaster`: 全tenant共通の標準マスター、テンプレート、permission catalog。
4. `Tenant`: 販売先の会計事務所。
5. `TenantMembership`: 会計事務所内での権限。
6. `OrganizationMembership`: 顧問先単位での権限。

データ分離は、まず論理分離で進める。全テナント保有データに `tenantId` を持たせ、`orgId` だけで参照できないようにする。将来、特定tenantだけ物理分離DBへ移せるよう、`Tenant` に分離モードやDBシークレット参照を持たせる。

## 現行実装で見えている破綻点

確認した主な現行ファイル:

- `packages/database/prisma/schema.prisma`
- `apps/api/src/auth/staff.helpers.ts`
- `apps/api/src/auth/roles.guard.ts`
- `apps/api/src/auth/org-access.guard.ts`
- `apps/api/src/auth/org-access.service.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/auth/internal-staff.guard.ts`
- `apps/api/src/advisor/advisor.controller.ts`
- `apps/api/src/internal-users/internal-users.controller.ts`
- `apps/api/src/masters/masters.controller.ts`
- `apps/api/src/auth/mf-oauth.controller.ts`

現行では、`users.org_id IS NULL` かつ `role IN ('owner', 'advisor')` をSevenBoard内部スタッフとして扱っている。これは単一会計事務所、つまりSEVENRICHだけを内部事務所として扱うなら成立する。

ただし、販売先の会計事務所tenantを増やすと、次の矛盾が出る。

- 会計事務所Aのオーナーも「事務所側ユーザー」なので `orgId = null` になりがち。
- その人に `role = owner` を付けると、現行の `isInternalOwner()` ではSevenBoard全体のownerに見える。
- `RolesGuard` では内部ownerが全orgでowner扱いになる。
- `OrgAccessService` でも内部ownerは全organizationアクセスになり得る。
- `/advisor` や `/internal/users` のようなorgIdを持たないAPIでは、global role判定が残りやすい。

つまり、ロール名を増やすだけではなく、権限の「スコープ」をDBモデルから分離する必要がある。

## 用語

| 用語 | 意味 |
| --- | --- |
| Platform | SevenBoard運営側。SaaS全体を管理する主体。 |
| Tenant | 販売先の会計事務所。例: SEVENRICH、A会計事務所。 |
| Organization | 会計事務所が担当する顧問先企業。 |
| User | ログインする人間。複数tenant、複数organizationに所属し得る。 |
| Membership | Userがどのスコープで何をできるかを表す関係。 |
| Permission | 実際に許可する操作。role名ではなくpermissionで判定する。 |
| SystemMaster | 全tenant共通の標準マスター、テンプレート、機能定義。顧客データは入れない。 |
| TenantMaster | 会計事務所tenantごとの標準設定やテンプレート。初期実装では作らず、将来の拡張枠に留める。 |
| OrganizationMaster | 顧問先企業ごとの実体マスター。現行の `AccountMaster` や `Department` はここに近い。 |
| Break-glass | 障害・監査対応などでSevenBoard運用者が一時的にtenantへ入る例外運用。 |

## 推奨ロール設計

ロールは1種類に統合しない。Platform、Tenant、Organizationで別enumにする。

### PlatformRole

| Role | 用途 |
| --- | --- |
| `platform_owner` | SaaS全体の最高権限。tenant作成、停止、課金、緊急対応。人数を最小化。 |
| `platform_admin` | 運用管理。tenant設定変更は可能だが、機微データ閲覧は原則不可。 |
| `platform_support` | サポート担当。通常はtenantデータへ入れない。break-glass時のみ入る。 |
| `security_admin` | 監査ログ、セキュリティ設定、鍵ローテーション管理。 |

### TenantRole

| Role | 用途 |
| --- | --- |
| `firm_owner` | 会計事務所tenantの契約・管理責任者。tenant内の全org管理。 |
| `firm_admin` | 事務所スタッフ管理、顧問先作成、担当者割当。 |
| `firm_manager` | チーム配下の顧問先管理。組織階層を使う場合に有効。 |
| `firm_advisor` | 割り当てられた顧問先のみ操作。 |
| `firm_viewer` | tenant内の閲覧専用、または限定的な監査閲覧。 |

### OrganizationRole

| Role | 用途 |
| --- | --- |
| `advisor_owner` | 当該顧問先に対する会計事務所側の管理者。 |
| `advisor_editor` | 当該顧問先のデータ編集、AI実行、レポート作成。 |
| `advisor_viewer` | 当該顧問先の閲覧のみ。 |
| `client_admin` | 顧問先企業側の管理者。自社ユーザー招待など。 |
| `client_member` | 顧問先企業側の一般編集者。 |
| `client_viewer` | 顧問先企業側の閲覧者。 |

注意点:

- `owner` という単語をグローバルに再利用しない。
- `firm_owner` はtenant内のownerであり、Platform ownerではない。
- 顧問先企業側に「owner」が必要なら `client_admin` など別名にする。
- APIではロール名を直接見ず、permissionに展開して判定する。

## Systemマスター層

必要。むしろSaaS化するなら、Systemマスターを明示的に作らないと、各tenant/orgのマスターがseedやコード内定数に散らばり、更新・監査・互換性管理が難しくなる。

ただし、Systemマスターは「隠れたsuper tenant」ではない。`tenantId = null` の業務データ置き場にしない。全tenant共通の標準、テンプレート、機能定義、permission catalogだけを置く。

### Systemマスターに置くもの

置いてよいもの:

- 標準勘定科目テンプレート。
- 勘定科目カテゴリ定義。
- 固定費/変動費の標準判定テンプレート。
- キャッシュフロー分類テンプレート。
- KPIテンプレート。
- レポートテンプレート。
- 月次レビュー項目テンプレート。
- 仕訳生成・検証ルールの標準テンプレート。
- AI prompt/tool policyの標準テンプレート。
- feature flag/plan feature catalog。
- role to permission catalog。
- 業種別テンプレート。

置いてはいけないもの:

- 顧客の実データ。
- tenant固有の外部連携token。
- tenant固有のSlack webhookやKintone設定。
- 顧問先ごとの勘定科目実体。
- 顧問先ごとの部門。
- tenantごとのユーザーやmembership。

### 初期は2層マスター

プロダクト方針として「全tenantで一律同じ標準」を採用するなら、初期実装ではTenantMasterを作らない。マスターは次の2層で進める。

| 層 | 例 | 所有者 | 更新権限 | 使い方 |
| --- | --- | --- | --- | --- |
| SystemMaster | 標準勘定科目、標準KPI、標準レポート、permission catalog | SevenBoard Platform | `platform_owner` / `platform_admin` | 新tenant/org作成時の雛形。読み取りはtenantにも可能。 |
| OrganizationMaster | X社の実勘定科目、部門、MF連携後の科目、個別ルール | 顧問先organization | advisor/client権限に応じる | 実際の取引、予算、仕訳が参照する実体。 |

現行の `AccountMaster` と `Department` はOrganizationMasterに近い。SaaS化後も、仕訳や予算が直接参照するのはOrganizationMasterにする。SystemMasterを直接参照させると、SystemMaster更新で過去データの意味が変わるため危険。

将来、会計事務所ごとの標準テンプレートを売り物にする、または大手事務所ごとに標準科目体系やレポートセットを持たせる段階で、TenantMasterを追加する。その場合の構造は `SystemMaster -> TenantMaster -> OrganizationMaster` だが、初期リリースでは `SystemMaster -> OrganizationMaster` に固定する。

### Systemマスターのバージョン管理

Systemマスターは必ずversionを持つ。

理由:

- 標準勘定科目テンプレートを更新しても、既存tenant/orgを勝手に変えないため。
- AI promptや仕訳ルールの変更が、過去の生成結果やレビュー基準に影響しないようにするため。
- どの標準versionからtenant/orgが作られたか監査できるようにするため。

基本方針:

- SystemMasterはpublish制にする。
- orgは作成時に利用したSystemMaster versionを記録する。
- tenantはSystemMasterを直接編集しない。
- org作成時はSystemMasterからOrganizationMasterへcopyする。
- 既存orgへ標準更新を適用する場合はmigration planを作り、差分レビュー後に適用する。

### 概念モデル

```prisma
model SystemMasterCatalog {
  id               String             @id @default(uuid()) @db.Uuid
  key              String             @unique
  type             SystemMasterType
  name             String
  status           String             @default("active")
  currentVersionId String?            @db.Uuid
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt

  versions SystemMasterVersion[]
}

model SystemMasterVersion {
  id          String   @id @default(uuid()) @db.Uuid
  catalogId   String   @db.Uuid
  version     Int
  payload     Json
  checksum    String
  status      String   @default("draft")
  publishedAt DateTime?
  createdById String   @db.Uuid

  catalog SystemMasterCatalog @relation(fields: [catalogId], references: [id])

  @@unique([catalogId, version])
}

model OrganizationMasterSource {
  id                    String   @id @default(uuid()) @db.Uuid
  tenantId              String   @db.Uuid
  orgId                 String   @db.Uuid
  type                  String
  sourceSystemVersionId String   @db.Uuid
  copiedAt              DateTime @default(now())
  copiedById            String?  @db.Uuid

  @@unique([tenantId, orgId, type])
  @@index([tenantId, orgId])
}
```

AccountMasterのように業務参照が多いものは、汎用 `payload Json` だけに寄せすぎない。SystemMasterのテンプレートはJSONでもよいが、OrganizationMasterとして実取引が参照するテーブルは、現在のような型付きテーブルを維持する方が安全。

### Systemマスターの権限

必要permission:

- `system_masters:read`
- `system_masters:create_draft`
- `system_masters:publish`
- `system_masters:retire`
- `org_masters:copy_from_system`
- `org_masters:update`

原則:

- PlatformだけがSystemMasterを書ける。
- tenantはSystemMasterを読めるが書けない。
- orgの実体マスターはOrganization権限で編集する。
- TenantMaster向けのpermissionは初期実装では作らない。将来、事務所別テンプレートを正式機能にするときに追加する。

## 推奨DBモデル

概念レベルのPrisma案。

```prisma
model User {
  id        String   @id @default(uuid()) @db.Uuid
  email     String   @unique
  name      String
  password  String
  avatarUrl String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  platformMemberships PlatformMembership[]
  tenantMemberships   TenantMembership[]
  orgMemberships      OrganizationMembership[]
  sessions            Session[]
}

model Tenant {
  id        String       @id @default(uuid()) @db.Uuid
  name      String
  slug      String       @unique
  status    TenantStatus @default(active)
  plan      TenantPlan   @default(starter)

  // 将来の物理分離やシャーディング用。初期は shared のみ。
  isolationMode String  @default("shared")
  shardId       String?
  dbSecretName  String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  organizations     Organization[]
  tenantMemberships TenantMembership[]
}

model PlatformMembership {
  id        String       @id @default(uuid()) @db.Uuid
  userId    String       @db.Uuid
  role      PlatformRole
  createdAt DateTime     @default(now())

  user User @relation(fields: [userId], references: [id])

  @@unique([userId, role])
}

model TenantMembership {
  id        String     @id @default(uuid()) @db.Uuid
  userId    String     @db.Uuid
  tenantId  String     @db.Uuid
  role      TenantRole
  status    String     @default("active")
  createdAt DateTime   @default(now())

  user   User   @relation(fields: [userId], references: [id])
  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([userId, tenantId])
  @@index([tenantId, role])
}

model Organization {
  id        String  @id @default(uuid()) @db.Uuid
  tenantId  String  @db.Uuid
  name      String
  code      String?
  status    String  @default("active")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])
  memberships OrganizationMembership[]

  @@unique([tenantId, code])
  @@unique([id, tenantId])
  @@index([tenantId])
}

model OrganizationMembership {
  id        String           @id @default(uuid()) @db.Uuid
  userId    String           @db.Uuid
  tenantId  String           @db.Uuid
  orgId     String           @db.Uuid
  role      OrganizationRole
  side      MembershipSide
  status    String           @default("active")
  createdAt DateTime         @default(now())

  user User @relation(fields: [userId], references: [id])
  organization Organization @relation(
    fields: [orgId, tenantId],
    references: [id, tenantId]
  )

  @@unique([userId, orgId])
  @@index([tenantId, userId])
  @@index([tenantId, orgId])
}
```

重要なのは、`OrganizationMembership` が `orgId` だけでOrganizationへ紐づかないこと。`tenantId + orgId` の複合関係にして、別tenantのorgへ誤接続しにくくする。

## tenantIdを持たせるべきテーブル

原則として、顧問先や会計事務所に属するデータにはすべて `tenantId` を持たせる。`organization.orgId` を辿ればtenantが分かる、という設計だけでは不十分。JOIN漏れ、IDOR、キャッシュキー漏れ、バッチ処理漏れを起こす。

優先度高:

- `Organization`
- `OrganizationMembership`
- `OrganizationMasterSource`
- `Integration`
- `AuditLog`
- `AgentRun`
- `Notification`
- `DataSyncLog`
- `BriefingSnapshot`
- `ActualEntry`
- `JournalEntry`
- `FiscalYear`
- `BudgetVersion`
- `BudgetEntry`
- `Report`
- `AiComment`
- `MonthlyClose`
- `MonthlyReviewApproval`
- `Action`
- `ActionEvent`
- `BusinessEvent`
- `CalendarEvent`
- `CashFlowCategory`
- `CashFlowEntry`
- `CashFlowForecast`
- `CollectionProfile`
- `RunwaySnapshot`
- `LoanSimulation`
- `KpiDefinition`
- `KpiValue`
- `Department`
- `AccountMaster`

実装方針:

- 一覧系は必ず `tenantId` をWHEREに入れる。
- 詳細取得は `id` だけで取らず、`tenantId + id` または `tenantId + orgId + id` で取る。
- 作成時の `tenantId` はrequest bodyから受け取らない。
- `orgId` からOrganizationを引き、ログインユーザーのmembershipと照合したうえでサーバー側で `tenantId` を確定する。
- 外部連携、AI実行、通知、ジョブキュー、監査ログにも同じ `tenantId` を入れる。

例外:

- `SystemMasterCatalog`
- `SystemMasterVersion`
- `PlanFeatureCatalog`
- `PermissionCatalog`

これらはtenantに属さない。ただし、orgがどのSystemMaster versionからコピーされたかを表す関連テーブルには `tenantId` と `orgId` を持たせる。

## 権限判定の設計

ControllerやServiceで `user.role === 'owner'` のような判定をしない。

推奨構成:

- `AuthorizationService`
- `@RequirePermission('org:reports:read')`
- `@RequirePermission('tenant:users:invite')`
- `@RequirePermission('platform:tenants:create')`
- `TenantContext`
- `OrganizationContext`

判定アルゴリズム:

1. JWTやセッションから `userId` を取得する。
2. request内の `tenantId`、`orgId`、resource idを正規化する。
3. 対象resourceがどのtenant/orgに属するかをDBで確認する。
4. `PlatformMembership`、`TenantMembership`、`OrganizationMembership` を取得する。
5. roleをpermissionへ展開する。
6. resource属性、tenant状態、org状態、break-glass状態を加味して許可/拒否する。
7. 拒否理由を監査ログへ残す。ただしレスポンスには機微情報を出さない。

JWTに入れてよいもの:

- `sub` / `userId`
- `sessionId`
- `currentTenantId`
- `currentOrgId`
- `iat`
- `exp`

JWTに入れすぎないもの:

- 全membership一覧
- 実効permission一覧
- Platform権限の詳細

理由は、権限変更や招待取り消しを即時反映しにくくなるため。

## ストリクトなユースケース確認

### 1. SevenBoard運用者が会計事務所tenantを作成する

期待:

- `platform_owner` または許可された `platform_admin` のみ可能。
- tenant作成時に初期 `firm_owner` を招待する。
- tenant作成、初期オーナー招待、初期設定は監査ログに残る。

穴:

- `firm_owner` を `User.role = owner` で作ると、SevenBoard全体ownerと混ざる。

対策:

- `PlatformMembership` と `TenantMembership` を分ける。

### 2. 会計事務所ownerが顧問先Organizationを作成する

期待:

- `firm_owner` / `firm_admin` のみ可能。
- 作成されたOrganizationは必ず作成者の `tenantId` に属する。
- `code` はグローバルuniqueではなく `tenantId + code` uniqueにする。

穴:

- request bodyの `tenantId` を信じると、別tenantにorgを作れる。

対策:

- `tenantId` はセッション上のcurrentTenant、またはtenant routeから解決し、membership確認後にサーバー側でセットする。

### 3. 会計事務所Aのownerが会計事務所Bの顧問先を開こうとする

期待:

- 403または404。
- 監査ログにcross-tenant access attemptとして記録。

穴:

- `orgId` がUUIDなので推測困難でも、漏洩やログ経由で取得される前提で考えるべき。
- `findUnique({ id })` だけの実装はIDORになる。

対策:

- `where: { id, tenantId }` または `where: { id, orgId, tenantId }` を徹底する。
- 重要テーブルには複合indexを張る。

### 4. 会計事務所adminがスタッフを招待する

期待:

- 自tenantにだけ招待可能。
- 付与できるroleは自分以下、または明示的に許可された範囲のみ。
- `firm_owner` の追加・削除は強めの制約を入れる。

穴:

- adminが自分をownerへ昇格できると権限昇格になる。

対策:

- role付与にもpermissionを定義する。
- `tenant:users:grant_owner` のように分ける。

### 5. 会計事務所advisorが担当顧問先だけを見る

期待:

- `firm_advisor` はtenant内の全orgを見られない。
- `OrganizationMembership` があるorgだけ見られる。

穴:

- tenant-level `firm_advisor` を「tenant内閲覧可」と解釈すると担当外が見える。

対策:

- `firm_advisor` はtenantログイン権限であり、orgデータ権限は `OrganizationMembership` で判定する。

### 6. 会計事務所managerがチーム配下の顧問先を管理する

期待:

- チームや部門の概念が必要になったら、`Team` / `TeamMembership` / `OrganizationAssignment` を追加する。
- まずは `firm_manager` を全tenant管理者にしない。

穴:

- managerをadmin相当にすると、大規模事務所で権限が広すぎる。

対策:

- manager導入時はteamスコープをDBで表現する。

### 7. 顧問先企業のclient_adminが自社ユーザーを招待する

期待:

- 自org内だけ招待可能。
- 会計事務所側roleは付与できない。
- 別tenantや別orgのユーザーを勝手に紐づけられない。

穴:

- `OrganizationMembership` にsideがないと、advisor側とclient側が混ざる。

対策:

- `MembershipSide = advisor | client` を持たせる。
- client側が付与できるroleを `client_*` に限定する。

### 8. 顧問先企業ユーザーが同じ会計事務所の別顧問先を見る

期待:

- 完全に拒否。

穴:

- tenantIdだけで絞る一覧APIは、clientユーザーにとって広すぎる。

対策:

- org-scoped APIでは `OrganizationMembership` を必須にする。
- clientユーザーの一覧は、自分が所属するorgだけに限定する。

### 9. 同じメールアドレスの人が複数tenantに所属する

例:

- 外部CFOがA会計事務所tenantではadvisor、B会計事務所tenantではclient_admin。

期待:

- 1つの `User` に複数membershipを持てる。
- ログイン後にcurrentTenantを選択できる。
- tenant切替時にcurrentOrgとpermissionを再解決する。

穴:

- `User.role` が1つだけだと表現不能。

対策:

- `User` からroleを外し、membershipで表現する。

### 10. SevenBoardサポートが顧客tenantを調査する

期待:

- 通常時はデータ閲覧不可。
- 顧客同意、理由、期限つきでbreak-glassを発行。
- 全アクセスを監査ログへ残す。

穴:

- `platform_support` に全tenant readを常時付けると、内部不正や誤操作のリスクが大きい。

対策:

- `SupportAccessGrant` を作る。
- 期限、対象tenant、対象org、理由、承認者、アクセス範囲を持たせる。

### 11. MoneyForward OAuth連携

期待:

- OAuth stateに `tenantId`, `orgId`, `userId`, `nonce`, `exp` を含め、署名する。
- callback時に対象orgがtenantに属し、userに連携権限があることを再確認する。
- token保存先にも `tenantId` を持たせる。

穴:

- stateが `orgId + userId` だけだと、tenant境界の検証が弱い。
- callback時のmembership再確認がないと、権限剥奪後にも連携できる可能性がある。

対策:

- OAuth開始時とcallback時の両方でAuthorizationServiceを通す。

### 12. Kintone連携

期待:

- Kintone設定はtenant/org単位。
- API tokenやpasswordはSecret Manager、DBには参照名または暗号化済み値のみ。
- 連携先app idやdomainをtenant外へ流用できない。

穴:

- IntegrationをorgIdだけで取ると、jobやadmin APIでtenant漏れが起きやすい。

対策:

- `Integration(tenantId, orgId, provider)` でunique制約を作る。

### 13. AI/Copilot実行

期待:

- AI実行前に対象データのtenant/org権限を確認する。
- prompt、retrieval、tool call、結果保存、通知までtenantIdを伝播する。
- tenantの `aiOptOut` やorgのAI設定を尊重する。

穴:

- AI処理は非同期化されやすく、HTTPリクエスト時の認可だけで終わると危険。
- AgentRunにtenantIdがないと、結果取得や再実行で漏れる。

対策:

- `AgentRun`、tool input、job payloadに `tenantId` と `orgId` を必須化する。
- worker側でも再認可またはsystem actor権限のスコープ確認を行う。

### 14. Slack/メール/通知

期待:

- 通知先はtenant/orgごとに分離。
- webhook URLやメール送信設定はtenant外から参照不可。

穴:

- 通知ジョブがorgIdだけを持つと、tenant停止時やorg移管時に誤送信しやすい。

対策:

- Notification、NotificationSetting、Webhook設定にtenantIdを持たせる。
- 送信直前にtenant/org statusを確認する。

### 15. 月次締め・レビュー承認

期待:

- advisor側とclient側で承認可能な操作が違う。
- clientが会計事務所側レビュー状態を勝手に変更できない。

穴:

- `role=admin` だけで許可するとclient_adminが事務所側承認までできる可能性がある。

対策:

- permissionを `org:monthly_close:client_approve` と `org:monthly_close:advisor_approve` に分ける。

### 16. 顧問先の会計事務所移管

期待:

- 初期リリースでは原則禁止または運用手順でのみ対応。
- 将来対応するなら、データ、連携token、監査ログ、ユーザー、通知設定の移管境界を明確にする。

穴:

- `Organization.tenantId` を単純更新すると、過去監査ログや外部連携tokenの意味が壊れる。

対策:

- 移管は新org作成 + データエクスポート/インポート、または専用のtransfer workflowにする。

### 17. tenant停止・解約

期待:

- API write停止。
- worker停止。
- OAuth refresh停止。
- 通知停止。
- データ保持期間と削除予定日を記録。

穴:

- HTTP APIだけ止めても、cron/workerが動き続ける。

対策:

- worker側も毎回 `Tenant.status` を見る。
- `tenant_suspended` を監査ログへ残す。

### 18. orgアーカイブ

期待:

- 読み取りは契約・設定に応じて可能。
- 書き込み、同期、AI実行、通知は停止。

穴:

- UIで非表示にするだけだとAPIから更新できる。

対策:

- AuthorizationServiceで `org.status` を見てwrite permissionを拒否する。

### 19. バッチ・定期同期

期待:

- job payloadに `tenantId` と `orgId` を必須で持つ。
- queue key、lock key、cache keyにもtenantIdを入れる。
- tenantごとのrate limitを持つ。

穴:

- in-memory rate limitやglobal lockでは、Cloud Runスケール時に効きにくい。
- noisy neighborで1tenantが他tenantの処理を詰まらせる。

対策:

- Redis/DBベースのrate limit/lockを検討する。
- tenant単位で同時実行数を制御する。

### 20. エクスポート・削除・監査

期待:

- tenant ownerが自tenantデータをエクスポートできる。
- client_adminが自orgデータをエクスポートできるかは契約・設定で決める。
- 削除は論理削除、保持期間、完全削除を分ける。

穴:

- エクスポートは大量データを横断するため、1つの漏れで重大事故になる。

対策:

- export jobはtenantId必須。
- 出力ファイルの保存先パスにもtenantIdを含める。
- ダウンロードURLは短期限、監査ログ必須。

### 21. Systemマスター更新とtenant/orgへの反映

期待:

- SevenBoard Platformが標準勘定科目や標準ルールの新versionをpublishできる。
- 新規tenant/orgは最新versionを初期値として使える。
- 既存tenant/orgは勝手に変更されない。
- orgはSystemMasterからOrganizationMasterへcopyできる。
- TenantMasterなしでも全tenantで一律の標準を運用できる。

穴:

- SystemMasterを実取引が直接参照すると、標準更新で過去データの意味が変わる。
- `tenantId = null` のマスター行を特別扱いすると、クエリ条件漏れで全tenantに混ざりやすい。
- SystemMasterにtenant固有設定や秘密情報を入れると、全tenantへ漏れる危険がある。
- TenantMasterを初期から入れると、会計事務所ごとの分岐が増え、リリース前に運用・テストが重くなる。

対策:

- SystemMasterはversioned read-only templateとして扱う。
- OrganizationMasterSourceに、コピー元のSystemMaster versionを記録する。
- 実取引、予算、仕訳が参照するのはOrganizationMasterにする。
- SystemMaster publish、copy、applyはすべて監査ログに残す。
- SystemMaster書き込みはPlatform権限だけに限定する。

## TenantMasterなし案の仮想テスト

前提:

```txt
SystemMaster
  ↓ org作成時にcopy
OrganizationMaster
```

TenantMasterは初期実装では作らない。会計事務所ごとの独自標準は正式機能にしない。全tenantでSevenBoard標準を一律に使う。

### テスト結果

| No | ユースケース | 判定 | 理由 |
| --- | --- | --- | --- |
| 1 | 新しい会計事務所tenantを作る | OK | tenant作成はマスター実体を持たないため、SystemMasterだけで足りる。 |
| 2 | tenant内に新しい顧問先orgを作る | OK | org作成時にSystemMaster最新版からOrganizationMasterを生成すればよい。 |
| 3 | A会計事務所とB会計事務所が同じ標準を使う | OK | SystemMasterが一律標準なので、TenantMasterなしの方がむしろ単純。 |
| 4 | X社だけMF同期で勘定科目が増える | OK | 増えるのはOrganizationMaster。SystemMasterや他orgには影響しない。 |
| 5 | SystemMasterに新しい標準勘定科目を追加する | OK | 新規orgには反映。既存orgには自動反映しない。必要時だけmigrationで適用。 |
| 6 | 過去の予算・実績・仕訳を見る | OK | 実データはOrganizationMasterを参照するため、SystemMaster更新で意味が変わらない。 |
| 7 | 会計事務所Aだけ標準科目体系を変えたい | Product制約 | 初期方針では非対応。Organization単位の編集で吸収する。将来TenantMasterで対応可能。 |
| 8 | 大手tenantが独自テンプレートを求める | Future | その段階でTenantMasterを追加する。今のDBに `tenantId` が通っていれば拡張可能。 |
| 9 | AIルールやレポートテンプレートを全tenantで改善する | OK | SystemMaster versionをpublishし、新規orgへ適用。既存orgは明示applyにする。 |
| 10 | 既存orgへSystemMaster更新を一括適用する | 条件付きOK | dry-run、差分表示、監査ログ、rollback相当の復旧手順が必要。 |
| 11 | client_adminがマスターを編集する | 条件付きOK | `org_masters:update` をclient側に開放するかは契約判断。API側permissionで制御できる。 |
| 12 | tenant停止中にマスター更新jobが走る | OK | workerが `Tenant.status` と `Organization.status` を確認すれば防げる。 |
| 13 | exportでSystemMasterとOrganizationMasterが混ざる | OK | export対象はtenant/org scoped data。SystemMasterは参照メタデータとして扱う。 |
| 14 | 顧問先を別tenantへ移管する | 条件付きOK | 移管は専用workflowが必要。OrganizationMasterごと新tenantへ複製する前提なら破綻しない。 |
| 15 | SystemMasterの誤publish | 条件付きOK | 既存orgへ自動反映しないため被害は新規org作成に限定される。publish承認とretireが必要。 |

結論:

- TenantMasterなし案は破綻しない。
- むしろ正式リリース前は、TenantMasterを作らない方が実装・テスト・運用が単純になる。
- ただし、SystemMasterをライブ参照する設計にすると破綻する。
- 必須条件は、`copy on org creation`、`OrganizationMasterSource`、`no auto apply to existing orgs` の3つ。

## ユースケース別の許可マトリクス

| 操作 | Platform | Firm owner | Firm admin | Firm advisor | Client admin | Client member/viewer |
| --- | --- | --- | --- | --- | --- | --- |
| tenant作成 | owner/adminのみ | 不可 | 不可 | 不可 | 不可 | 不可 |
| tenant停止 | owner/adminのみ | 不可 | 不可 | 不可 | 不可 | 不可 |
| 顧問先org作成 | 原則不可 | 可 | 可 | 不可 | 不可 | 不可 |
| 事務所スタッフ招待 | 原則不可 | 可 | 制限つき可 | 不可 | 不可 | 不可 |
| 顧問先ユーザー招待 | 原則不可 | 可 | 可 | 担当orgのみ可 | 自orgのみ可 | 不可 |
| 顧問先データ閲覧 | break-glassのみ | tenant内可 | tenant内可 | 担当orgのみ可 | 自orgのみ可 | 自orgのみ可 |
| 顧問先データ編集 | break-glassのみ | tenant内可 | tenant内可 | 担当orgのみ可 | 自orgの許可範囲のみ | role次第 |
| 外部連携設定 | 原則不可 | tenant内可 | 可 | 担当orgのみ制限つき | 原則不可 | 不可 |
| AI実行 | 原則不可 | tenant内可 | tenant内可 | 担当orgのみ可 | 契約次第 | 契約次第 |
| 監査ログ閲覧 | security/adminのみ | tenant内可 | 制限つき可 | 担当orgのみ | 自orgのみ | 原則不可 |
| Systemマスターpublish | owner/adminのみ | 不可 | 不可 | 不可 | 不可 | 不可 |
| Organizationマスター編集 | break-glassのみ | tenant内可 | tenant内可 | 担当orgのみ可 | 契約次第 | 契約次第 |

Platformは「何でも見られる管理者」ではなく、SaaS運用権限として扱う。顧客データ閲覧はbreak-glassに寄せる。

## API設計

推奨route:

```txt
/platform/system-masters
/platform/system-masters/:catalogId/versions
/platform/tenants
/platform/tenants/:tenantId

/tenants/:tenantId
/tenants/:tenantId/users
/tenants/:tenantId/organizations
/tenants/:tenantId/audit-logs

/organizations/:orgId/dashboard
/organizations/:orgId/masters
/organizations/:orgId/reports
/organizations/:orgId/integrations
/organizations/:orgId/monthly-close
```

`/organizations/:orgId/...` は既存APIとの互換性を保ちやすい。ただし内部実装では必ずOrganizationからtenantIdを解決し、request userのmembershipと照合する。

request bodyで `tenantId` を受けるAPIは原則作らない。必要な場合でも、bodyの値は希望値として扱い、必ずroute/contextと一致確認する。

## フロントエンド設計

ログイン後にフロントが持つべき状態:

- `currentUser`
- `availableTenants`
- `currentTenant`
- `availableOrganizations`
- `currentOrganization`
- `effectivePermissions`

注意点:

- UI表示制御はUX目的に限定する。
- 最終的な認可はAPI側で行う。
- tenant切替時はcurrentOrgを再選択させる。
- localStorageに長期JWTを置かない方針へ寄せる。cookie-based sessionまたは短命access token + refresh cookieへ移行する。

## RLSの位置づけ

PostgreSQL Row Level Securityは、アプリ層認可の代替ではなく防御層として使う。

初期段階:

- アプリ層で `AuthorizationService` とtenantId WHEREを徹底する。
- テストでcross-tenantを潰す。

中期:

- `audit_logs`, `integrations`, `agent_runs`, `journal_entries`, `reports` など高リスクテーブルからRLSを検討する。

例:

```sql
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_reports ON reports
USING (tenant_id = current_setting('app.tenant_id')::uuid)
WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
```

注意:

- Prismaのconnection poolingと `SET app.tenant_id` の扱いを慎重に設計する。
- RLSを入れても、アプリ側のpermission判定は省略しない。

## 移行計画

### Phase 1: 新モデル追加とseed/backfill

やること:

- `Tenant` を追加。
- `SystemMasterCatalog` / `SystemMasterVersion` を追加。
- 現行seed内の標準勘定科目や標準設定をSystemMaster seedへ移す。
- 既存データ用に `sevenrich` tenantを作る。
- 既存OrganizationMasterに相当する `AccountMaster` / `Department` などは維持し、コピー元を追える `OrganizationMasterSource` を追加する。
- `PlatformMembership`、`TenantMembership` を追加。
- 既存 `User.role/orgId` からmembershipを生成する。
- `Organization.tenantId` を追加して既存orgを `sevenrich` に紐づける。

この段階では既存APIを壊さず、新旧モデルを並行させる。

### Phase 2: AuthorizationService導入

やること:

- `AuthorizationService` を作る。
- `@RequirePermission()` を作る。
- 主要APIから順に `@Roles()` と `isInternalStaff()` 依存を剥がす。
- org-scoped routeの共通context resolverを作る。

この段階で、権限判定の中心を1箇所へ寄せる。

### Phase 3: 主要APIのtenant-aware化

優先:

- auth/session/current user
- organization一覧/詳細
- advisor APIs
- internal users APIs
- integrations
- MF OAuth
- journal/report/monthly close
- agent/AI
- notifications
- audit logs

この段階では、`findUnique({ id })` のようなtenantなし参照を重点的に消す。

### Phase 4: tenantIdを子テーブルへ伝播

やること:

- 高リスクテーブルから `tenantId` を追加。
- backfill migrationを作る。
- composite indexを張る。
- create/update処理でtenantIdをサーバー側セットにする。
- job payloadにもtenantIdを入れる。

### Phase 5: 旧ロール設計の撤去

やること:

- `User.role` を廃止または互換用に限定。
- `User.orgId` を廃止または互換用に限定。
- `staff.helpers.ts` の `isInternalOwner/isInternalStaff` を削除。
- `@Roles()` を削除またはdeprecated化。
- DB CHECK制約 `user_role_orgid_partition` を新設計に合わせて撤去。

## 必須テスト

単体テスト:

- role to permission展開。
- tenant status/org statusによる拒否。
- break-glass有無。
- role付与可能範囲。
- currentTenant/currentOrg切替。

統合テスト:

- firm owner Aがtenant Bのorgを読めない。
- firm advisorが未担当orgを読めない。
- client_adminが同tenant別orgを読めない。
- platform_supportがbreak-glassなしで顧客データを読めない。
- tenant userがSystemMasterを更新できない。
- SystemMaster publish後も既存OrganizationMasterが勝手に変わらない。
- 新規org作成時にSystemMasterからOrganizationMasterがコピーされる。
- OrganizationMaster copy時にtenantId/orgIdが正しく付く。
- OrganizationMasterSourceにコピー元SystemMaster versionが残る。
- OAuth callbackでtenant/org/user不一致を拒否する。
- workerが停止tenantのsyncを実行しない。
- export jobがtenant外データを含まない。

回帰テスト:

- 既存SEVENRICH運用のowner/advisor/admin/member/viewerが、移行後も想定通り動く。
- 既存顧問先データが `sevenrich` tenant配下で参照できる。

## 運用・監査

必須ログ:

- login
- tenant switch
- org switch
- invitation created/accepted/revoked
- role changed
- system master published/retired
- organization master copied/updated
- system master applied to existing organization
- permission denied
- cross-tenant access attempt
- break-glass grant created/used/expired
- export started/completed/downloaded
- integration connected/disconnected/token refreshed
- AI job started/completed/failed

監査ログには `tenantId`, `orgId`, `actorUserId`, `actorMembershipScope`, `action`, `resourceType`, `resourceId`, `requestId`, `ip`, `userAgent` を入れる。

## 今後の秘密鍵管理との接続

Cloud Run一本化後は、tenantや外部連携の秘密情報もGoogle Secret Managerへ寄せる。

方針:

- 環境変数へ直値の秘密情報を置かない。
- Cloud Runサービスアカウントに必要なsecretだけを最小権限で付与する。
- Secret Managerのversionをpinする。`latest` 常用は避ける。
- tenant専用の外部連携tokenを作る場合、secret名にtenantIdまたはtenant slugを含める。
- DBに保存する場合は、少なくともアプリケーションレベル暗号化と鍵ローテーション手順を持つ。

例:

```txt
sevenboard/prod/global/jwt-secret
sevenboard/prod/global/mf-token-encryption-key
sevenboard/prod/tenant/{tenantSlug}/kintone-api-token
sevenboard/prod/tenant/{tenantSlug}/slack-webhook
```

## 将来の物理分離・スケール戦略

初期は共有DB + 論理分離でよい。ただし、将来の大口顧客や規制要件に備えて、`Tenant` に次を持たせる。

- `isolationMode`: `shared`, `dedicated_schema`, `dedicated_database`
- `shardId`
- `dbSecretName`
- `region`

アプリ側は `TenantConnectionResolver` のような層を用意し、今は常に共有DBを返す。将来、大口tenantだけ専用DBへ移すときにService層を大改修しないようにする。

## こちらで実装できること

Codex側で進められるもの:

- Prisma schemaの新モデル追加。
- migration作成。
- 既存データのbackfill migration作成。
- SystemMaster/OrganizationMasterの初期設計とseed移行。
- OrganizationMasterSourceの追加。
- `AuthorizationService` とpermission定義。
- `@RequirePermission()` guard。
- org/tenant context resolver。
- 主要APIのtenant-aware化。
- MF OAuth stateのtenant対応。
- job payloadのtenant対応。
- cross-tenant統合テスト追加。
- 旧 `@Roles()` / `staff.helpers.ts` 依存の段階的撤去。
- docs更新。

## Hiroki側で決める必要があること

プロダクト判断:

- tenantの単位を「会計事務所」で固定するか。
- SystemマスターとしてPlatform管理にする範囲。
- 初期リリースでは会計事務所別TenantMasterを作らない方針で固定するか。
- SystemMaster更新を既存orgへ自動提案するか、手動適用だけにするか。
- 顧問先企業が複数会計事務所に同時所属するケースを許すか。
- 顧問先移管を正式機能にするか、当面は運用対応にするか。
- client_adminが自社ユーザー招待をできるか。
- client側にAI実行を開放するか。
- firm_managerのチームスコープを初期から入れるか。
- SevenBoardサポートのbreak-glass承認者と運用ルール。
- 解約後のデータ保持期間。
- export権限と対象データ範囲。

インフラ・運用判断:

- Cloud Run本番/stagingのGCP project分離。
- Secret Managerの命名規則。
- tenantごとの外部連携secretをSecret Managerに置くか、DB暗号化にするか。
- 監査ログの保存期間。
- 大口tenantの専用DB移行条件。

## 参考

- OWASP Multi Tenant Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html
- OWASP Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- PostgreSQL Row Security Policies: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- Google Cloud Identity Platform multi-tenancy: https://cloud.google.com/identity-platform/docs/multi-tenancy
- Google Secret Manager best practices: https://docs.cloud.google.com/secret-manager/regional-secrets/best-practices-rs
- Cloud Run secrets: https://docs.cloud.google.com/run/docs/configuring/services/secrets
