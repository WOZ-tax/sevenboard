import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
} from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('organizations/:orgId/integrations')
@UseGuards(JwtAuthGuard, OrgAccessGuard)
export class IntegrationsController {
  constructor(private integrationsService: IntegrationsService) {}

  @Get()
  async findAll(@Param('orgId') orgId: string) {
    return this.integrationsService.findAll(orgId);
  }

  @Post(':provider/connect')
  @Roles('ADMIN', 'ADVISOR')
  @UseGuards(RolesGuard)
  async connect(
    @Param('orgId') orgId: string,
    @Param('provider') provider: string,
  ) {
    return this.integrationsService.connect(orgId, provider);
  }

  @Post(':provider/disconnect')
  @Roles('ADMIN', 'ADVISOR')
  @UseGuards(RolesGuard)
  async disconnect(
    @Param('orgId') orgId: string,
    @Param('provider') provider: string,
  ) {
    return this.integrationsService.disconnect(orgId, provider);
  }

  @Post(':provider/sync')
  @Roles('ADMIN', 'CFO', 'ADVISOR')
  @UseGuards(RolesGuard)
  async sync(
    @Param('orgId') orgId: string,
    @Param('provider') provider: string,
  ) {
    return this.integrationsService.sync(orgId, provider);
  }

  @Get(':provider/status')
  async getStatus(
    @Param('orgId') orgId: string,
    @Param('provider') provider: string,
  ) {
    return this.integrationsService.getStatus(orgId, provider);
  }
}
