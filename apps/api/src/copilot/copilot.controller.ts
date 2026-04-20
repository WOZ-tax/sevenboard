import {
  Body,
  Controller,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { CopilotService } from './copilot.service';
import { CopilotChatDto } from './copilot.dto';

@Controller('organizations/:orgId/copilot')
@UseGuards(JwtAuthGuard, OrgAccessGuard, RateLimitGuard)
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
