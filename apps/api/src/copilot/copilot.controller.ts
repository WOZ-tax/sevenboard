import {
  Body,
  Controller,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { CopilotService } from './copilot.service';
import { CopilotChatDto } from './copilot.dto';

@Controller('organizations/:orgId/copilot')
@RequirePermission('org:ai:run')
@UseGuards(JwtAuthGuard, PermissionGuard, RateLimitGuard)
export class CopilotController {
  constructor(private copilot: CopilotService) {}

  @Post('chat')
  async chat(
    @Param('orgId') orgId: string,
    @Body() body: CopilotChatDto,
    @Request() req: any,
  ) {
    return this.copilot.chat(orgId, body, req.user.id);
  }
}
