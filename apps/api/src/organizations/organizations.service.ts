import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  isInternalAdvisor,
  isInternalOwner,
  isInternalStaff,
  UserLike,
} from '../auth/staff.helpers';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

/**
 * 顧問先 (Organization) 管理。
 *
 * 重要：role 単独で判定せず、必ず isInternalStaff / isInternalOwner で
 * orgId=NULL も併せて確認すること。顧問先側 owner（CL 管理者）が
 * 自社の planType 変更や削除に到達しないように防ぐ。
 *
 * - 一覧: 内部 owner=全件 / 内部 advisor=担当先 / 顧問先側=自社のみ
 * - 作成: 内部スタッフ（owner/advisor）のみ
 * - 更新（基本情報）: 内部 owner=全件、内部 advisor=担当先のみ。顧問先側は不可
 * - planType 変更: 内部 owner のみ
 * - 削除: 内部 owner のみ
 */
@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: UserLike) {
    // 内部 owner: 全顧問先（クロステナント）
    if (isInternalOwner(user)) {
      return this.prisma.organization.findMany({
        orderBy: { name: 'asc' },
      });
    }
    // 内部 advisor: 担当先のみ
    if (isInternalAdvisor(user)) {
      const assignments = await this.prisma.organizationMembership.findMany({
        where: { userId: user.id },
        include: { organization: true },
      });
      return assignments.map((a) => a.organization);
    }
    // 顧問先側ユーザー（orgId 持ち、role 任意）: 自社のみ
    if (!user.orgId) {
      return [];
    }
    const org = await this.prisma.organization.findUnique({
      where: { id: user.orgId },
    });
    return org ? [org] : [];
  }

  async findOne(id: string) {
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
   * 新規顧問先を作成。内部スタッフ (orgId=NULL かつ role=owner/advisor) のみ。
   * - 作成者を自動で OrganizationMembership に登録（advisor が自分で追加した先を担当できるように）
   * - 追加で advisorUserIds の SEVENRICH スタッフをアサイン
   */
  async create(creator: UserLike, dto: CreateOrganizationDto) {
    if (!isInternalStaff(creator)) {
      throw new ForbiddenException('顧問先の新規作成は事務所スタッフのみ可能です');
    }
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
        select: { id: true, role: true },
      });
      const invalid = users.filter(
        (u) => u.role !== 'owner' && u.role !== 'advisor',
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

    // 作成
    const org = await this.prisma.organization.create({
      data: {
        name: dto.name,
        code: dto.code ?? null,
        fiscalMonthEnd: dto.fiscalMonthEnd,
        industry: dto.industry ?? null,
        ...(dto.usesCostAccounting !== undefined
          ? { usesCostAccounting: dto.usesCostAccounting }
          : {}),
        // 担当者を同時に OrganizationMembership に
        memberships: {
          create: Array.from(assigneeIds).map((uid) => ({
            userId: uid,
            role: 'advisor' as const,
          })),
        },
      },
    });

    return org;
  }

  /**
   * 顧問先情報の更新。
   * - 内部 owner: 全顧問先を編集可
   * - 内部 advisor: 担当先のみ
   * - 顧問先側ユーザー（CL 管理者含む）: 編集不可
   * - planType 変更は内部 owner のみ
   */
  async update(user: UserLike, orgId: string, dto: UpdateOrganizationDto) {
    if (isInternalAdvisor(user)) {
      const assignment = await this.prisma.organizationMembership.findUnique({
        where: { userId_orgId: { userId: user.id, orgId } },
      });
      if (!assignment) {
        throw new ForbiddenException('この顧問先の編集権限がありません');
      }
    } else if (!isInternalOwner(user)) {
      // CL 側 owner / admin / member / viewer は到達不可
      throw new ForbiddenException('顧問先の編集は事務所スタッフのみ可能です');
    }

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

    // planType 変更は内部 owner のみ
    if (dto.planType !== undefined && !isInternalOwner(user)) {
      throw new ForbiddenException('プラン変更は事務所オーナーのみ可能です');
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
      },
    });
  }

  /**
   * 顧問先削除。内部 owner のみ。
   * 顧問先側 owner (CL 管理者) からは到達不可。データ全部消えるので注意。
   */
  async remove(user: UserLike, orgId: string) {
    if (!isInternalOwner(user)) {
      throw new ForbiddenException('顧問先の削除は事務所オーナーのみ可能です');
    }
    // FK の onDelete: Cascade を信頼。無い場合は手動で関連削除が必要
    return this.prisma.organization.delete({ where: { id: orgId } });
  }
}
