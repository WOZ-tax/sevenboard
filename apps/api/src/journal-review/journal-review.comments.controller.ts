import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { JournalReviewService } from './journal-review.service';
import { AddJournalCommentDto } from './dto/add-comment.dto';

/**
 * 仕訳レビュー: コメント API (Phase 2 / Unit 2-2)。
 *
 * GET    /organizations/:orgId/journal-comments?journalIds=a,b,c
 *   journalIds 省略時は org 配下の全コメント (フラグ立った仕訳数だけなので件数小)。
 *   指定すると該当 journal のコメントのみ。
 *
 * POST   /organizations/:orgId/journal-comments  body: {journalId, body, urls?, parentCommentId?}
 * DELETE /organizations/:orgId/journal-comments/:commentId
 */
@Controller('organizations/:orgId/journal-comments')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class JournalReviewCommentsController {
  constructor(private service: JournalReviewService) {}

  @Get()
  @RequirePermission('org:journal_review:read')
  async list(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('journalIds') journalIdsCsv?: string,
  ) {
    const journalIds = journalIdsCsv
      ? journalIdsCsv.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    return this.service.listComments(orgId, journalIds);
  }

  @Post()
  @RequirePermission('org:journal_review:manage')
  async add(
    @Request() req: { user: { id: string } },
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: AddJournalCommentDto,
  ) {
    return this.service.addComment(
      orgId,
      dto.journalId,
      dto.body,
      dto.urls ?? [],
      dto.parentCommentId ?? null,
      req.user.id,
    );
  }

  @Delete(':commentId')
  @HttpCode(204)
  @RequirePermission('org:journal_review:manage')
  async delete(
    @Request() req: { user: { id: string } },
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ): Promise<void> {
    await this.service.deleteComment(orgId, commentId, req.user.id);
  }
}
