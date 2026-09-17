import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { BulkStaffService } from "./bulk-staff.service";
import { AuthorizationService } from "../auth/authorization.service";
import { AuthService } from "../auth/auth.service";
import { DEMO_TENANT_ID, DEMO_USER_ID } from "../demo/demo.constants";
import * as bcrypt from "bcryptjs";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { BulkAssignmentsDto, BulkStaffDto } from "./dto/bulk-staff.dto";

describe("bulk staff administration", () => {
  let db: any, service: BulkStaffService;
  const actor = { id: "owner", role: "owner", orgId: null };
  const dto = {
    role: "firm_advisor" as const,
    rows: [{ name: "新規スタッフ", email: "new@example.com" }],
  };
  beforeEach(() => {
    db = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: "new" }),
      },
      tenantMembership: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            role: "firm_owner",
            status: "active",
            tenant: { status: "active" },
          }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      organization: {
        findMany: jest.fn().mockResolvedValue([{ id: "org", name: "会社" }]),
      },
      organizationMembership: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((fn: any) => fn(db)),
    };
    service = new BulkStaffService(db, new AuthorizationService(db));
  });
  it("previews normalized duplicates and errors without issuing passwords or writing", async () => {
    const result = await service.previewStaff(actor, "tenant", {
      ...dto,
      rows: [
        { name: " 新規 ", email: " NEW@example.com " },
        { name: "重複", email: "new@example.com" },
        { name: "無効", email: "bad" },
      ],
    });
    expect(result).toMatchObject({
      newCount: 1,
      skippedCount: 1,
      errorCount: 1,
    });
    expect(result.rows[0]).toMatchObject({
      name: "新規",
      email: "new@example.com",
    });
    expect(JSON.stringify(result)).not.toContain("initialPassword");
    expect(db.user.create).not.toHaveBeenCalled();
    await expect(
      service.createStaff(actor, "tenant", {
        ...dto,
        rows: [...dto.rows, { name: "", email: "bad" }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("creates only new accounts and preserves already registered users and duplicate rows", async () => {
    db.user.findMany.mockResolvedValue([
      { id: "existing", email: "existing@example.com", orgId: null },
      { id: "active", email: "active@example.com", orgId: null },
    ]);
    db.tenantMembership.findMany.mockResolvedValue([
      { userId: "active", status: "active" },
    ]);
    const result = await service.createStaff(actor, "tenant", {
      ...dto,
      rows: [
        ...dto.rows,
        { name: "既存", email: "existing@example.com" },
        { name: "登録済み", email: "active@example.com" },
        dto.rows[0],
      ],
    });
    expect(result).toMatchObject({
      newCount: 1,
      existingCount: 1,
      skippedCount: 2,
      errorCount: 0,
    });
    expect(db.user.create).toHaveBeenCalledTimes(1);
    expect(db.tenantMembership.create).toHaveBeenCalledTimes(2);
    expect(result.rows[0].initialPassword).toHaveLength(24);
    expect(
      await bcrypt.compare(
        result.rows[0].initialPassword!,
        db.user.create.mock.calls[0][0].data.password,
      ),
    ).toBe(true);
    expect(result.rows.slice(1).every((r) => !r.initialPassword)).toBe(true);
  });
  it.each(["suspended", "revoked", "invited"])(
    "does not reactivate a %s membership",
    async (status) => {
      db.user.findMany.mockResolvedValue([
        { id: "new", email: "new@example.com", orgId: null },
      ]);
      db.tenantMembership.findMany.mockResolvedValue([
        { userId: "new", status },
      ]);
      await expect(
        service.createStaff(actor, "tenant", dto),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.tenantMembership.create).not.toHaveBeenCalled();
    },
  );
  it.each([
    { id: DEMO_USER_ID, orgId: null },
    { id: "customer", orgId: "client-org" },
  ])("rejects demo and customer identities", async (user) => {
    db.user.findMany.mockResolvedValue([{ ...user, email: "new@example.com" }]);
    await expect(
      service.createStaff(actor, "tenant", dto),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each(["firm_admin", "firm_manager", "firm_advisor", "firm_viewer"])(
    "rejects %s for both bulk actions before any writes",
    async (role) => {
      db.tenantMembership.findUnique.mockResolvedValue({
        role,
        status: "active",
      });
      await expect(
        service.createStaff(actor, "tenant", dto),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.assign(actor, "tenant", {
          orgIds: ["org"],
          userIds: ["staff"],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );
  it("denies demo actors and the demo tenant even with a mistakenly broad membership", async () => {
    await expect(
      service.previewStaff({ ...actor, id: DEMO_USER_ID }, "tenant", dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.previewStaff(actor, DEMO_TENANT_ID, dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("rechecks membership changes before creating users", async () => {
    db.user.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        { id: "new", email: "new@example.com", orgId: "client" },
      ]);
    await expect(
      service.createStaff(actor, "tenant", dto),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it("validates every company and staff member belongs to the current tenant", async () => {
    db.tenantMembership.findMany.mockResolvedValue([
      {
        userId: "staff",
        role: "firm_advisor",
        user: { name: "担当", email: "staff@example.com" },
      },
    ]);
    await expect(
      service.assign(actor, "tenant", {
        orgIds: ["org", "outside"],
        userIds: ["staff"],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.assign(actor, "tenant", {
        orgIds: ["org"],
        userIds: ["staff", "outside"],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.organizationMembership.createMany).not.toHaveBeenCalled();
  });
  it("adds missing assignments only, preserves existing roles and keeps viewers read-only", async () => {
    db.tenantMembership.findMany.mockResolvedValue([
      {
        userId: "staff",
        role: "firm_advisor",
        user: { name: "担当", email: "staff@example.com" },
      },
      {
        userId: "viewer",
        role: "firm_viewer",
        user: { name: "閲覧", email: "viewer@example.com" },
      },
    ]);
    db.organizationMembership.findMany.mockResolvedValue([
      { orgId: "org", userId: "staff" },
    ]);
    const input = { orgIds: ["org", "org"], userIds: ["staff", "viewer"] };
    const preview = await service.previewAssignments(actor, "tenant", input);
    expect(preview).toMatchObject({ addCount: 1, skippedCount: 1 });
    expect(await service.assign(actor, "tenant", input)).toMatchObject({
      addedCount: 1,
      skippedCount: 1,
      companyCount: 1,
      staffCount: 2,
    });
    expect(db.organizationMembership.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        {
          tenantId: "tenant",
          orgId: "org",
          userId: "staff",
          role: "advisor",
          side: "advisor",
        },
        {
          tenantId: "tenant",
          orgId: "org",
          userId: "viewer",
          role: "viewer",
          side: "advisor",
        },
      ],
    });
    db.organizationMembership.createMany.mockResolvedValue({ count: 0 });
    expect(await service.assign(actor, "tenant", input)).toMatchObject({
      addedCount: 0,
      skippedCount: 2,
    });
  });
  it("reports transaction conflicts without retrying account creation", async () => {
    db.$transaction.mockRejectedValue({ code: "P2034" });
    await expect(
      service.assign(actor, "tenant", { orgIds: ["org"], userIds: ["staff"] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
  it("checks a revoked owner permission again inside the write transaction", async () => {
    db.tenantMembership.findUnique
      .mockResolvedValueOnce({
        role: "firm_owner",
        status: "active",
        tenant: { status: "active" },
      })
      .mockResolvedValue({
        role: "firm_owner",
        status: "revoked",
        tenant: { status: "active" },
      });
    await expect(
      service.assign(actor, "tenant", { orgIds: ["org"], userIds: ["staff"] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.organizationMembership.createMany).not.toHaveBeenCalled();
  });
  it("retains the tenant owner role when the owner also has an explicit company assignment", async () => {
    const org = { id: "org", tenantId: "tenant", name: "会社" };
    db.user.findUnique = jest.fn().mockResolvedValue(actor);
    db.tenantMembership.findMany.mockResolvedValue([
      {
        tenantId: "tenant",
        role: "firm_owner",
        status: "active",
        tenant: { status: "active", organizations: [org] },
      },
    ]);
    db.organizationMembership.findMany.mockResolvedValue([
      { role: "advisor", side: "advisor", organization: org },
    ]);
    const auth = new AuthService(db, {} as any, new AuthorizationService(db));
    expect(await auth.getUserMemberships(actor.id, actor.role)).toEqual([
      expect.objectContaining({ tenantRole: "firm_owner", orgRole: "advisor" }),
    ]);
  });
  it("rejects empty/oversized batches, invalid roles and nested non-string input", async () => {
    for (const payload of [
      { ...dto, rows: [] },
      { ...dto, rows: Array(101).fill(dto.rows[0]) },
      { ...dto, role: "owner" },
      { ...dto, rows: [{ name: {}, email: "a@b.com" }] },
    ]) {
      expect(
        (await validate(plainToInstance(BulkStaffDto, payload))).length,
      ).toBeGreaterThan(0);
    }
    expect(
      (
        await validate(
          plainToInstance(BulkAssignmentsDto, { orgIds: ["bad"], userIds: [] }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
