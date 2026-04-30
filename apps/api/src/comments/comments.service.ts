import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentStatusDto } from './dto/update-comment-status.dto';

@Injectable()
export class CommentsService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId: string, month?: string) {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const where: any = {
      report: { tenantId, orgId },
    };

    // monthフィルタ: Report.configのJSONからmonthを参照
    if (month) {
      where.report.config = {
        path: ['month'],
        equals: month,
      };
    }

    const comments = await this.prisma.aiComment.findMany({
      where,
      include: {
        report: {
          select: { id: true, name: true, type: true, config: true },
        },
        reviewer: {
          select: { id: true, name: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return comments;
  }

  async create(orgId: string, dto: CreateCommentDto, userId: string) {
    const { tenantId } = await this.prisma.orgScope(orgId);
    // 月を特定（指定がなければ今月）
    const month =
      dto.month || new Date().toISOString().slice(0, 7); // "YYYY-MM"

    // この月のReportを探す（なければ自動作成）
    let report = await this.prisma.report.findFirst({
      where: {
        tenantId,
        orgId,
        type: 'CUSTOM',
        config: {
          path: ['month'],
          equals: month,
        },
      },
    });

    if (!report) {
      report = await this.prisma.report.create({
        data: {
          tenantId,
          orgId,
          name: `月次コメント ${month}`,
          type: 'CUSTOM',
          config: { month },
        },
      });
    }

    const comment = await this.prisma.aiComment.create({
      data: {
        reportId: report.id,
        content: dto.content,
        cellRef: dto.cellRef || null,
        status: 'PENDING',
        confidenceScore: null,
      },
      include: {
        report: {
          select: { id: true, name: true, type: true, config: true },
        },
        reviewer: {
          select: { id: true, name: true, role: true },
        },
      },
    });

    return comment;
  }

  async updateStatus(
    orgId: string,
    commentId: string,
    dto: UpdateCommentStatusDto,
    reviewerId: string,
  ) {
    const comment = await this.prisma.aiComment.findUnique({
      where: { id: commentId },
      include: { report: { select: { tenantId: true, orgId: true } } },
    });

    if (!comment) {
      throw new NotFoundException('コメントが見つかりません');
    }

    // route の :orgId とコメント所属 org が一致するか検証（IDOR 対策）。
    // OrgAccessGuard で route の orgId は user の権限内であることが既に保証されているため、
    // ここで両者一致を確認すれば「他 org のコメントを自 org 経由で更新」を遮断できる。
    const { tenantId } = await this.prisma.orgScope(orgId);
    if (comment.report.orgId !== orgId || comment.report.tenantId !== tenantId) {
      throw new NotFoundException('コメントが見つかりません');
    }

    const updateData: any = {
      status: dto.status,
      reviewedBy: reviewerId,
    };

    // MODIFIEDの場合はcontentも更新可能
    if (dto.status === 'MODIFIED' && dto.content) {
      updateData.content = dto.content;
    }

    // REJECTEDの場合はrejectReasonを保存
    if (dto.status === 'REJECTED' && dto.rejectReason) {
      updateData.rejectReason = dto.rejectReason;
    }

    const updated = await this.prisma.aiComment.update({
      where: { id: commentId },
      data: updateData,
      include: {
        report: {
          select: { id: true, name: true, type: true, config: true },
        },
        reviewer: {
          select: { id: true, name: true, role: true },
        },
      },
    });

    return updated;
  }

  async remove(commentId: string, orgId: string) {
    const comment = await this.prisma.aiComment.findUnique({
      where: { id: commentId },
      include: { report: { select: { tenantId: true, orgId: true } } },
    });

    if (!comment) {
      throw new NotFoundException('コメントが見つかりません');
    }

    const { tenantId } = await this.prisma.orgScope(orgId);
    if (comment.report.orgId !== orgId || comment.report.tenantId !== tenantId) {
      throw new NotFoundException('コメントが見つかりません');
    }

    await this.prisma.aiComment.delete({
      where: { id: commentId },
    });

    return { deleted: true };
  }
}
