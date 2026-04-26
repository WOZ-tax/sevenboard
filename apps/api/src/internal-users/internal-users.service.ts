import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInternalUserDto } from './dto/create-internal-user.dto';
import { UpdateInternalUserDto } from './dto/update-internal-user.dto';

/**
 * SEVENRICH 事務所スタッフ（owner / advisor）の管理。
 * - すべて user.orgId = NULL （クロステナント）
 * - owner のみ操作可能（controller 側で @Roles('owner') ガード済）
 */
@Injectable()
export class InternalUsersService {
  constructor(private prisma: PrismaService) {}

  async list() {
    return this.prisma.user.findMany({
      where: {
        orgId: null,
        role: { in: ['owner', 'advisor'] },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { memberships: true } },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(dto: CreateInternalUserDto) {
    const dup = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (dup) {
      throw new ConflictException(`メールアドレス ${dto.email} は既に登録されています`);
    }

    const hashed = await bcrypt.hash(dto.password, 12);
    return this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: hashed,
        role: dto.role,
        orgId: null,
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

  async update(userId: string, dto: UpdateInternalUserDto) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, orgId: true },
    });
    if (!target) throw new NotFoundException('ユーザーが見つかりません');
    if (target.orgId !== null) {
      // 事務所スタッフ扱いではないので、この API では触らない
      throw new ForbiddenException('CL 側ユーザーは /masters/users から操作してください');
    }
    if (target.role !== 'owner' && target.role !== 'advisor') {
      throw new ForbiddenException('対象は事務所スタッフ (owner / advisor) ではありません');
    }

    const data: Record<string, unknown> = {};
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
        updatedAt: true,
      },
    });
  }

  async remove(actorUserId: string, userId: string) {
    if (actorUserId === userId) {
      throw new BadRequestException('自分自身は削除できません');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, orgId: true },
    });
    if (!target) throw new NotFoundException('ユーザーが見つかりません');
    if (target.orgId !== null) {
      throw new ForbiddenException('CL 側ユーザーは /masters/users から削除してください');
    }

    // owner が 1 人しかいない場合は削除不可（事務所オーナー不在を防ぐ）
    if (target.role === 'owner') {
      const ownerCount = await this.prisma.user.count({
        where: { orgId: null, role: 'owner' },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException('最後の事務所オーナーは削除できません');
      }
    }

    // 担当アサイン (OrganizationMembership) を先に削除
    await this.prisma.organizationMembership.deleteMany({
      where: { userId },
    });
    await this.prisma.user.delete({ where: { id: userId } });
    return { success: true };
  }
}
