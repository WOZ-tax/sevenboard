import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentStatusDto } from './dto/update-comment-status.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';

@Controller('organizations/:orgId/comments')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CommentsController {
  constructor(private commentsService: CommentsService) {}

  @Get()
  @RequirePermission('org:comments:read')
  async findAll(@Param('orgId') orgId: string, @Query('month') month?: string) {
    return this.commentsService.findAll(orgId, month);
  }

  @Post()
  @RequirePermission('org:comments:manage')
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateCommentDto,
    @Request() req: any,
  ) {
    return this.commentsService.create(orgId, dto, req.user.id);
  }

  @Patch(':commentId/status')
  @RequirePermission('org:comments:manage')
  async updateStatus(
    @Param('orgId') orgId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentStatusDto,
    @Request() req: any,
  ) {
    return this.commentsService.updateStatus(
      orgId,
      commentId,
      dto,
      req.user.id,
    );
  }

  @Delete(':commentId')
  @RequirePermission('org:comments:manage')
  async remove(
    @Param('orgId') orgId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.commentsService.remove(commentId, orgId);
  }
}
