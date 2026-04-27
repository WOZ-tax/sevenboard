import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountCategory } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class MastersService {
  constructor(private prisma: PrismaService) {}

  // ===================== 勘定科目 =====================

  async getAccounts(orgId: string) {
    return this.prisma.accountMaster.findMany({
      where: { orgId },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async createAccount(orgId: string, dto: CreateAccountDto) {
    return this.prisma.accountMaster.create({
      data: {
        orgId,
        code: dto.code,
        name: dto.name,
        category: dto.category as any,
        isVariableCost: dto.isVariableCost ?? false,
        displayOrder: dto.displayOrder ?? 0,
      },
    });
  }

  async updateAccount(orgId: string, accountId: string, dto: UpdateAccountDto) {
    const account = await this.prisma.accountMaster.findFirst({
      where: { id: accountId, orgId },
    });
    if (!account) throw new NotFoundException('勘定科目が見つかりません');

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.isVariableCost !== undefined) data.isVariableCost = dto.isVariableCost;
    if (dto.displayOrder !== undefined) data.displayOrder = dto.displayOrder;

    return this.prisma.accountMaster.update({
      where: { id: accountId },
      data,
    });
  }

  /**
   * 変動費フラグの一括更新。MFから来る勘定科目名(name)で引いて、なければupsertする。
   * 変動損益分析画面のトグル保存に使う。category 不明な場合は ADMIN_EXPENSE で作成。
   */
  async bulkUpdateVariableCostFlags(
    orgId: string,
    updates: Array<{ name: string; isVariableCost: boolean }>,
  ) {
    const results: Array<{ name: string; updated: boolean }> = [];
    for (const u of updates) {
      if (!u.name || typeof u.isVariableCost !== 'boolean') continue;
      const existing = await this.prisma.accountMaster.findFirst({
        where: { orgId, name: u.name },
        select: { id: true, isVariableCost: true },
      });
      if (existing) {
        if (existing.isVariableCost !== u.isVariableCost) {
          await this.prisma.accountMaster.update({
            where: { id: existing.id },
            data: { isVariableCost: u.isVariableCost },
          });
        }
        results.push({ name: u.name, updated: true });
      } else {
        // Prisma 6.19 系の UUID handler バグ（P2023 Error creating UUID）回避のため
        // raw SQL で直接 upsert する。Postgres 側の gen_random_uuid() を id に使い、
        // ON CONFLICT で is_variable_cost のみ更新する。
        await this.prisma.$executeRaw`
          INSERT INTO account_masters
            (id, org_id, code, name, category, is_variable_cost, display_order, created_at)
          VALUES (
            gen_random_uuid(),
            ${orgId}::uuid,
            ${u.name},
            ${u.name},
            'ADMIN_EXPENSE'::"AccountCategory",
            ${u.isVariableCost},
            0,
            NOW()
          )
          ON CONFLICT (org_id, code)
          DO UPDATE SET is_variable_cost = EXCLUDED.is_variable_cost
        `;
        results.push({ name: u.name, updated: true });
      }
    }
    return { ok: true, count: results.length };
  }

  async deleteAccount(orgId: string, accountId: string) {
    const account = await this.prisma.accountMaster.findFirst({
      where: { id: accountId, orgId },
    });
    if (!account) throw new NotFoundException('勘定科目が見つかりません');
    // Check for related budget entries
    const budgetCount = await this.prisma.budgetEntry.count({
      where: { accountId },
    });
    if (budgetCount > 0) {
      throw new BadRequestException(
        '予算データが紐づいているため削除できません',
      );
    }

    // Check for related actual entries
    const actualCount = await this.prisma.actualEntry.count({
      where: { accountId },
    });
    if (actualCount > 0) {
      throw new BadRequestException(
        '実績データが紐づいているため削除できません',
      );
    }

    // Check for related journal entries
    const journalCount = await this.prisma.journalEntry.count({
      where: {
        OR: [
          { debitAccountId: accountId },
          { creditAccountId: accountId },
        ],
      },
    });
    if (journalCount > 0) {
      throw new BadRequestException(
        '仕訳データが紐づいているため削除できません',
      );
    }

    return this.prisma.accountMaster.delete({
      where: { id: accountId },
    });
  }

  // ===================== 部門 =====================

  async getDepartments(orgId: string) {
    return this.prisma.department.findMany({
      where: { orgId },
      orderBy: { displayOrder: 'asc' },
      include: { children: true },
    });
  }

  async createDepartment(orgId: string, dto: CreateDepartmentDto) {
    return this.prisma.department.create({
      data: {
        orgId,
        name: dto.name,
        parentId: dto.parentId ?? null,
        type: dto.type ?? null,
        displayOrder: dto.displayOrder ?? 0,
      },
    });
  }

  async updateDepartment(orgId: string, deptId: string, dto: UpdateDepartmentDto) {
    const dept = await this.prisma.department.findFirst({
      where: { id: deptId, orgId },
    });
    if (!dept) throw new NotFoundException('部門が見つかりません');

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.parentId !== undefined) data.parentId = dto.parentId;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.displayOrder !== undefined) data.displayOrder = dto.displayOrder;

    return this.prisma.department.update({
      where: { id: deptId },
      data,
    });
  }

  async deleteDepartment(orgId: string, deptId: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id: deptId, orgId },
    });
    if (!dept) throw new NotFoundException('部門が見つかりません');
    // Check for child departments
    const childCount = await this.prisma.department.count({
      where: { parentId: deptId },
    });
    if (childCount > 0) {
      throw new BadRequestException(
        '子部門が存在するため削除できません',
      );
    }

    // Check for related budget entries
    const budgetCount = await this.prisma.budgetEntry.count({
      where: { departmentId: deptId },
    });
    if (budgetCount > 0) {
      throw new BadRequestException(
        '予算データが紐づいているため削除できません',
      );
    }

    // Check for related actual entries
    const actualCount = await this.prisma.actualEntry.count({
      where: { departmentId: deptId },
    });
    if (actualCount > 0) {
      throw new BadRequestException(
        '実績データが紐づいているため削除できません',
      );
    }

    return this.prisma.department.delete({
      where: { id: deptId },
    });
  }

  // ===================== ユーザー =====================

  async getUsers(orgId: string) {
    return this.prisma.user.findMany({
      where: { orgId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createUser(orgId: string, dto: CreateUserDto) {
    const hashedPassword = await bcrypt.hash(dto.password, 12);

    // CL 側ユーザーは role に関わらず viewer 固定（G-1 ロール設計）
    return this.prisma.user.create({
      data: {
        orgId,
        email: dto.email,
        name: dto.name,
        password: hashedPassword,
        role: 'viewer',
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
      },
    });
  }

  async updateUser(orgId: string, userId: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, orgId },
    });
    if (!user) throw new NotFoundException('ユーザーが見つかりません');

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.password !== undefined) {
      data.password = await bcrypt.hash(dto.password, 12);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
      },
    });
  }

  async deleteUser(orgId: string, userId: string, currentUserId: string) {
    if (userId === currentUserId) {
      throw new BadRequestException('自分自身を削除することはできません');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, orgId },
    });
    if (!user) throw new NotFoundException('ユーザーが見つかりません');

    return this.prisma.user.delete({
      where: { id: userId },
    });
  }
}
