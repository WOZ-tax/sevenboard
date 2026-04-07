import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private organizationsService: OrganizationsService) {}

  @Get()
  async findAll(@Request() req) {
    return this.organizationsService.findAll(
      req.user.id,
      req.user.role,
      req.user.orgId,
    );
  }

  @Get(':orgId')
  @UseGuards(OrgAccessGuard)
  async findOne(@Param('orgId') orgId: string) {
    return this.organizationsService.findOne(orgId);
  }
}
