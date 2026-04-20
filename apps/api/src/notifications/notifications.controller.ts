import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';
import { NotificationsService } from './notifications.service';

@Controller('organizations/:orgId/notifications')
@UseGuards(JwtAuthGuard, OrgAccessGuard)
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  async list(
    @Param('orgId') orgId: string,
    @Request() req: { user: { id: string } },
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
    @Query('days') days?: string,
  ) {
    return this.notifications.list(orgId, req.user.id, {
      unreadOnly: unreadOnly === 'true' || unreadOnly === '1',
      limit: limit ? Number(limit) : undefined,
      days: days ? Number(days) : undefined,
    });
  }

  @Get('unread-count')
  async unreadCount(
    @Param('orgId') orgId: string,
    @Request() req: { user: { id: string } },
  ) {
    const count = await this.notifications.unreadCount(orgId, req.user.id);
    return { count };
  }

  @Patch(':id/read')
  async markRead(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Request() req: { user: { id: string } },
  ) {
    const row = await this.notifications.markRead(orgId, req.user.id, id);
    return row ?? { ok: false };
  }

  @Post('mark-all-read')
  async markAllRead(
    @Param('orgId') orgId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.notifications.markAllRead(orgId, req.user.id);
  }
}
