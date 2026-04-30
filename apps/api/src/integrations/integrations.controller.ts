import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
} from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';

@Controller('organizations/:orgId/integrations')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class IntegrationsController {
  constructor(private integrationsService: IntegrationsService) {}

  @Get()
  @RequirePermission('org:integrations:read')
  async findAll(@Param('orgId') orgId: string) {
    return this.integrationsService.findAll(orgId);
  }

  @Post(':provider/connect')
  @RequirePermission('org:integrations:manage')
  async connect(
    @Param('orgId') orgId: string,
    @Param('provider') provider: string,
  ) {
    return this.integrationsService.connect(orgId, provider);
  }

  @Post(':provider/disconnect')
  @RequirePermission('org:integrations:manage')
  async disconnect(
    @Param('orgId') orgId: string,
    @Param('provider') provider: string,
  ) {
    return this.integrationsService.disconnect(orgId, provider);
  }

  @Post(':provider/sync')
  @RequirePermission('org:integrations:sync')
  async sync(
    @Param('orgId') orgId: string,
    @Param('provider') provider: string,
  ) {
    return this.integrationsService.sync(orgId, provider);
  }

  @Get(':provider/status')
  @RequirePermission('org:integrations:read')
  async getStatus(
    @Param('orgId') orgId: string,
    @Param('provider') provider: string,
  ) {
    return this.integrationsService.getStatus(orgId, provider);
  }
}
