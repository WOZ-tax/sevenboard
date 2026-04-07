import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentStatusDto } from './dto/update-comment-status.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('organizations/:orgId/comments')
@UseGuards(JwtAuthGuard, OrgAccessGuard)
export class CommentsController {
  constructor(private commentsService: CommentsService) {}

  @Get()
  async findAll(
    @Param('orgId') orgId: string,
    @Query('month') month?: string,
  ) {
    return this.commentsService.findAll(orgId, month);
  }

  @Post()
  @Roles('ADMIN', 'CFO', 'ADVISOR')
  @UseGuards(RolesGuard)
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateCommentDto,
    @Request() req: any,
  ) {
    return this.commentsService.create(orgId, dto, req.user.id);
  }

  @Patch(':commentId/status')
  @Roles('ADVISOR')
  @UseGuards(RolesGuard)
  async updateStatus(
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentStatusDto,
    @Request() req: any,
  ) {
    return this.commentsService.updateStatus(commentId, dto, req.user.id);
  }

  @Delete(':commentId')
  @Roles('ADMIN', 'ADVISOR')
  @UseGuards(RolesGuard)
  async remove(
    @Param('orgId') orgId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.commentsService.remove(commentId, orgId);
  }
}
