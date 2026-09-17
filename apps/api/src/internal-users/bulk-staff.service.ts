import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { isEmail } from "class-validator";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuthorizationService } from "../auth/authorization.service";
import { UserLike } from "../auth/staff.helpers";
import { roleHasPermission } from "../auth/permissions";
import { DEMO_TENANT_ID, DEMO_USER_ID } from "../demo/demo.constants";
import { BulkAssignmentsDto, BulkStaffDto } from "./dto/bulk-staff.dto";

type StaffStatus = "new" | "existing" | "skip" | "error";
export interface PlannedStaff {
  row: number;
  name: string;
  email: string;
  status: StaffStatus;
  message: string;
  userId?: string;
}

@Injectable()
export class BulkStaffService {
  constructor(
    private prisma: PrismaService,
    private authorization: AuthorizationService,
  ) {}

  private async authorize(actor: UserLike, tenantId: string) {
    await this.authorization.assertTenantPermission(
      actor,
      "tenant:staff:manage",
      tenantId,
    );
    if (tenantId === DEMO_TENANT_ID)
      throw new ForbiddenException("デモではスタッフの一括管理はできません");
  }

  private summarize(rows: PlannedStaff[]) {
    return {
      rows,
      newCount: rows.filter((r) => r.status === "new").length,
      existingCount: rows.filter((r) => r.status === "existing").length,
      skippedCount: rows.filter((r) => r.status === "skip").length,
      errorCount: rows.filter((r) => r.status === "error").length,
    };
  }

  private async authorizeTransaction(
    tx: Prisma.TransactionClient,
    actor: UserLike,
    tenantId: string,
  ) {
    const membership = await tx.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: actor.id, tenantId } },
      select: {
        role: true,
        status: true,
        tenant: { select: { status: true } },
      },
    });
    if (
      membership?.status !== "active" ||
      membership.tenant.status !== "active" ||
      !roleHasPermission(membership.role, "tenant:staff:manage")
    ) {
      throw new ForbiddenException("スタッフを管理する権限がありません");
    }
  }

  private async planStaff(
    db: Prisma.TransactionClient,
    tenantId: string,
    dto: BulkStaffDto,
  ) {
    const normalized = dto.rows.map((r, index) => ({
      row: index + 1,
      name: r.name.trim(),
      email: r.email.trim().toLowerCase(),
    }));
    const users = await db.user.findMany({
      where: { email: { in: normalized.map((r) => r.email) } },
      select: { id: true, email: true, orgId: true },
    });
    const memberships = await db.tenantMembership.findMany({
      where: { tenantId, userId: { in: users.map((u) => u.id) } },
      select: { userId: true, status: true },
    });
    const usersByEmail = new Map(users.map((u) => [u.email, u]));
    const membershipsByUser = new Map(memberships.map((m) => [m.userId, m]));
    const seen = new Set<string>();
    const rows: PlannedStaff[] = normalized.map((row) => {
      const item = (
        status: StaffStatus,
        message: string,
        userId?: string,
      ): PlannedStaff => ({
        ...row,
        status,
        message,
        ...(userId ? { userId } : {}),
      });
      if (!row.name) return item("error", "名前を入力してください");
      if (!isEmail(row.email))
        return item("error", "メールアドレスの形式を確認してください");
      if (seen.has(row.email))
        return item("skip", "入力内の重複です（先の行を使用）");
      seen.add(row.email);
      const user = usersByEmail.get(row.email);
      if (!user) return item("new", "新規登録・初期パスワードを発行");
      if (user.id === DEMO_USER_ID || user.orgId)
        return item(
          "error",
          "このアカウントは事務所スタッフとして一括登録できません",
        );
      const membership = membershipsByUser.get(user.id);
      if (membership?.status === "active")
        return item("skip", "登録済みです（変更しません）", user.id);
      if (membership)
        return item(
          "error",
          "停止・解除・招待中のスタッフです。個別の管理画面で確認してください",
        );
      return item("existing", "既存アカウントをこの事務所に追加", user.id);
    });
    return this.summarize(rows);
  }

  async previewStaff(actor: UserLike, tenantId: string, dto: BulkStaffDto) {
    await this.authorize(actor, tenantId);
    return this.planStaff(this.prisma, tenantId, dto);
  }

  async createStaff(actor: UserLike, tenantId: string, dto: BulkStaffDto) {
    await this.authorize(actor, tenantId);
    const preview = await this.planStaff(this.prisma, tenantId, dto);
    if (preview.errorCount)
      throw new BadRequestException(
        "入力にエラーがあります。確認画面で修正してください",
      );
    const credentials = new Map<string, { password: string; hash: string }>();
    // Expensive password hashing happens before the database transaction.
    const newRows = preview.rows.filter((r) => r.status === "new");
    for (let offset = 0; offset < newRows.length; offset += 5) {
      await Promise.all(
        newRows.slice(offset, offset + 5).map(async (row) => {
          const password = randomBytes(18).toString("base64url");
          credentials.set(row.email, {
            password,
            hash: await bcrypt.hash(password, 12),
          });
        }),
      );
    }
    await this.authorize(actor, tenantId);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await this.authorizeTransaction(tx, actor, tenantId);
          const plan = await this.planStaff(tx, tenantId, dto);
          if (plan.errorCount)
            throw new ConflictException(
              "登録状況が変更されました。もう一度内容を確認してください",
            );
          const results: (PlannedStaff & { initialPassword?: string })[] = [];
          for (const row of plan.rows) {
            if (row.status === "skip") {
              results.push(row);
              continue;
            }
            let userId = row.userId;
            const credential = credentials.get(row.email);
            if (row.status === "new") {
              if (!credential)
                throw new ConflictException(
                  "登録状況が変更されました。もう一度内容を確認してください",
                );
              const created = await tx.user.create({
                data: {
                  name: row.name,
                  email: row.email,
                  password: credential.hash,
                  role: dto.role === "firm_owner" ? "owner" : "advisor",
                  orgId: null,
                },
                select: { id: true },
              });
              userId = created.id;
            }
            await tx.tenantMembership.create({
              data: {
                tenantId,
                userId: userId!,
                role: dto.role,
                status: "active",
              },
            });
            results.push({
              ...row,
              userId,
              ...(row.status === "new"
                ? { initialPassword: credential!.password }
                : {}),
            });
          }
          return { ...this.summarize(results), rows: results };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30_000,
        },
      );
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  private async planAssignments(
    db: Prisma.TransactionClient,
    tenantId: string,
    dto: BulkAssignmentsDto,
  ) {
    const orgIds = [...new Set(dto.orgIds)];
    const userIds = [...new Set(dto.userIds)];
    if (userIds.includes(DEMO_USER_ID))
      throw new BadRequestException("デモアカウントは担当者に指定できません");
    const [organizations, members] = await Promise.all([
      db.organization.findMany({
        where: { tenantId, id: { in: orgIds } },
        select: { id: true, name: true },
      }),
      db.tenantMembership.findMany({
        where: {
          tenantId,
          status: "active",
          userId: { in: userIds },
          user: { orgId: null, role: { in: ["owner", "advisor"] } },
        },
        select: {
          userId: true,
          role: true,
          user: { select: { name: true, email: true } },
        },
      }),
    ]);
    if (
      organizations.length !== orgIds.length ||
      members.length !== userIds.length
    ) {
      throw new BadRequestException(
        "現在の事務所に所属する顧問先と有効なスタッフだけを選択してください",
      );
    }
    const assigned = await db.organizationMembership.findMany({
      where: { tenantId, orgId: { in: orgIds }, userId: { in: userIds } },
      select: { orgId: true, userId: true },
    });
    const keys = new Set(assigned.map((a) => `${a.orgId}:${a.userId}`));
    const companies = organizations.map((org) => {
      const skippedCount = userIds.filter((id) =>
        keys.has(`${org.id}:${id}`),
      ).length;
      return {
        orgId: org.id,
        orgName: org.name,
        addCount: userIds.length - skippedCount,
        skippedCount,
      };
    });
    return {
      companies,
      staff: members.map((m) => ({
        id: m.userId,
        name: m.user.name,
        email: m.user.email,
      })),
      addCount: companies.reduce((sum, org) => sum + org.addCount, 0),
      skippedCount: assigned.length,
      orgIds,
      userIds,
      roles: new Map(
        members.map((m) => [
          m.userId,
          m.role === "firm_viewer" ? ("viewer" as const) : ("advisor" as const),
        ]),
      ),
    };
  }

  async previewAssignments(
    actor: UserLike,
    tenantId: string,
    dto: BulkAssignmentsDto,
  ) {
    await this.authorize(actor, tenantId);
    const { roles: _roles, ...preview } = await this.planAssignments(
      this.prisma,
      tenantId,
      dto,
    );
    return preview;
  }

  async assign(actor: UserLike, tenantId: string, dto: BulkAssignmentsDto) {
    await this.authorize(actor, tenantId);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await this.authorizeTransaction(tx, actor, tenantId);
          const plan = await this.planAssignments(tx, tenantId, dto);
          const result = await tx.organizationMembership.createMany({
            data: plan.orgIds.flatMap((orgId) =>
              plan.userIds.map((userId) => ({
                tenantId,
                orgId,
                userId,
                role: plan.roles.get(userId)!,
                side: "advisor" as const,
              })),
            ),
            skipDuplicates: true,
          });
          return {
            addedCount: result.count,
            skippedCount:
              plan.orgIds.length * plan.userIds.length - result.count,
            companyCount: plan.orgIds.length,
            staffCount: plan.userIds.length,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30_000,
        },
      );
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  private rethrowConflict(error: unknown): never {
    if (["P2002", "P2034"].includes((error as { code?: string })?.code ?? "")) {
      throw new ConflictException(
        "他の登録操作と重なりました。もう一度内容を確認してください",
      );
    }
    throw error;
  }
}
