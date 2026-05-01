import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserLike } from '../auth/staff.helpers';
import { AuthorizationService } from '../auth/authorization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

/**
 * 顧問先 (Organization) 管理。
 *
 * AuthorizationService で tenant / organization membership を permission に
 * 展開して判定する。旧 User.role + orgId は移行中のfallbackに留める。
 */
@Injectable()
export class OrganizationsService {
  constructor(
    private prisma: PrismaService,
    private authorization: AuthorizationService,
  ) {}

  async findAll(user: UserLike) {
    return this.authorization.findAccessibleOrganizations(user);
  }

  async findOne(user: UserLike, id: string) {
    await this.authorization.assertOrgPermission(
      user,
      id,
      'org:organizations:read',
    );
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        departments: { orderBy: { displayOrder: 'asc' } },
        accounts: { orderBy: { displayOrder: 'asc' } },
      },
    });
    if (!org) {
      throw new NotFoundException(`Organization ${id} not found`);
    }
    return org;
  }

  /**
   * 新規顧問先を作成。
   * - 作成者を自動で OrganizationMembership に登録（advisor が自分で追加した先を担当できるように）
   * - 追加で advisorUserIds の SEVENRICH スタッフをアサイン
   */
  async create(creator: UserLike, dto: CreateOrganizationDto) {
    const { tenantId } = await this.authorization.assertTenantPermission(
      creator,
      'tenant:organizations:create',
    );
    const creatorUserId = creator.id;
    const creatorRole = creator.role;
    // 同一 code が既に存在するなら衝突エラー
    if (dto.code) {
      const dup = await this.prisma.organization.findUnique({
        where: { code: dto.code },
      });
      if (dup) {
        throw new ConflictException(
          `事業者コード ${dto.code} は既に登録されています`,
        );
      }
    }

    // 担当アサイン対象 user.id を集める（重複削除）
    const assigneeIds = new Set<string>();
    if (creatorRole === 'advisor') {
      // advisor が自分で作った先は自動で自分を担当に
      assigneeIds.add(creatorUserId);
    }
    for (const uid of dto.advisorUserIds ?? []) {
      assigneeIds.add(uid);
    }

    // 担当に指定された全員が SEVENRICH スタッフ（owner / advisor）であることを検証
    if (assigneeIds.size > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: Array.from(assigneeIds) } },
        select: { id: true, role: true, orgId: true },
      });
      const invalid = users.filter(
        (u) =>
          u.orgId !== null || (u.role !== 'owner' && u.role !== 'advisor'),
      );
      if (invalid.length > 0) {
        throw new BadRequestException(
          `担当者には事務所スタッフ(owner/advisor)のみ指定可能です: ${invalid.map((u) => u.id).join(', ')}`,
        );
      }
      if (users.length !== assigneeIds.size) {
        throw new BadRequestException('指定された user.id が見つかりません');
      }
    }

    const org = await this.prisma.organization.create({
      data: {
        tenantId,
        name: dto.name,
        code: dto.code ?? null,
        fiscalMonthEnd: dto.fiscalMonthEnd,
        industry: dto.industry ?? null,
        ...(dto.usesCostAccounting !== undefined
          ? { usesCostAccounting: dto.usesCostAccounting }
          : {}),
      },
    });

    if (assigneeIds.size > 0) {
      await this.prisma.organizationMembership.createMany({
        data: Array.from(assigneeIds).map((uid) => ({
          userId: uid,
          tenantId,
          orgId: org.id,
          role: 'advisor' as const,
          side: 'advisor' as const,
        })),
        skipDuplicates: true,
      });
    }

    return org;
  }

  /**
   * 顧問先情報の更新。planType 変更は delete 相当の強い permission を要求する。
   */
  async update(user: UserLike, orgId: string, dto: UpdateOrganizationDto) {
    await this.authorization.assertOrgPermission(
      user,
      orgId,
      'org:organizations:update',
    );

    // code 重複チェック（自分以外）
    if (dto.code) {
      const dup = await this.prisma.organization.findFirst({
        where: { code: dto.code, NOT: { id: orgId } },
      });
      if (dup) {
        throw new ConflictException(
          `事業者コード ${dto.code} は別の顧問先で使用中です`,
        );
      }
    }

    if (dto.planType !== undefined) {
      await this.authorization.assertOrgPermission(
        user,
        orgId,
        'org:organizations:delete',
      );
    }

    return this.prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.fiscalMonthEnd !== undefined
          ? { fiscalMonthEnd: dto.fiscalMonthEnd }
          : {}),
        ...(dto.industry !== undefined ? { industry: dto.industry } : {}),
        ...(dto.planType !== undefined ? { planType: dto.planType } : {}),
        ...(dto.usesCostAccounting !== undefined
          ? { usesCostAccounting: dto.usesCostAccounting }
          : {}),
        ...(dto.websiteUrl !== undefined ? { websiteUrl: dto.websiteUrl } : {}),
        ...(dto.businessContext !== undefined
          ? {
              businessContext: dto.businessContext,
              contextUpdatedAt: new Date(),
              contextUpdatedById: user.id,
            }
          : {}),
      },
    });
  }

  /**
   * kintone 顧客基本情報 (appId 16) から industry / websiteUrl を prefill。
   * 既存値がある場合も上書きする。kintoneSyncedAt を更新。
   *
   * @returns prefill 後の Organization と、kintone から取れた / 取れなかったフィールドのレポート
   */
  async kintoneImport(
    user: UserLike,
    orgId: string,
    customer: {
      industry?: string | null;
      websiteUrl?: string | null;
    },
  ) {
    await this.authorization.assertOrgPermission(
      user,
      orgId,
      'org:organizations:update',
    );
    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(customer.industry !== undefined && customer.industry !== null
          ? { industry: customer.industry }
          : {}),
        ...(customer.websiteUrl !== undefined && customer.websiteUrl !== null
          ? { websiteUrl: customer.websiteUrl }
          : {}),
        kintoneSyncedAt: new Date(),
      },
    });
    return updated;
  }

  /**
   * 顧問先削除。データ全部消えるので強い permission のみ許可する。
   */
  async remove(user: UserLike, orgId: string) {
    await this.authorization.assertOrgPermission(
      user,
      orgId,
      'org:organizations:delete',
    );
    // FK の onDelete: Cascade を信頼。無い場合は手動で関連削除が必要
    return this.prisma.organization.delete({ where: { id: orgId } });
  }

  /**
   * この顧問先に担当としてアサインされている advisor 側スタッフ一覧。
   */
  async listAdvisors(user: UserLike, orgId: string) {
    const { tenantId } = await this.authorization.assertOrgPermission(
      user,
      orgId,
      'org:users:read',
    );
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { orgId, tenantId, side: 'advisor' },
      include: {
        user: {
          select: { id: true, email: true, name: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      userId: m.userId,
      role: m.role,
      side: m.side,
      createdAt: m.createdAt,
      user: m.user,
    }));
  }

  /**
   * 既存の事務所スタッフを既存顧問先の担当として追加。
   * - 同 tenant の active な tenantMembership を持つユーザーのみ許可
   * - 重複は skipDuplicates で無視
   */
  async addAdvisors(user: UserLike, orgId: string, userIds: string[]) {
    const { tenantId } = await this.authorization.assertOrgPermission(
      user,
      orgId,
      'org:users:manage',
    );
    if (userIds.length === 0) {
      throw new BadRequestException('userIds が空です');
    }

    const tenantMembers = await this.prisma.tenantMembership.findMany({
      where: {
        tenantId,
        userId: { in: userIds },
        status: 'active',
      },
      select: { userId: true },
    });
    const validIds = new Set(tenantMembers.map((m) => m.userId));
    const invalid = userIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `指定 user が事務所スタッフではありません: ${invalid.join(', ')}`,
      );
    }

    await this.prisma.organizationMembership.createMany({
      data: userIds.map((userId) => ({
        userId,
        tenantId,
        orgId,
        role: 'advisor' as const,
        side: 'advisor' as const,
      })),
      skipDuplicates: true,
    });

    return this.listAdvisors(user, orgId);
  }

  /**
   * 担当アサインを 1 件解除。
   */
  async removeAdvisor(user: UserLike, orgId: string, userId: string) {
    await this.authorization.assertOrgPermission(
      user,
      orgId,
      'org:users:manage',
    );
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { orgId, userId, side: 'advisor' },
      select: { id: true },
    });
    if (!membership) {
      throw new NotFoundException('担当が見つかりません');
    }
    await this.prisma.organizationMembership.delete({
      where: { id: membership.id },
    });
    return { success: true };
  }
}
