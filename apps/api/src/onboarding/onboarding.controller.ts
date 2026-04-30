import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';

@Controller('organizations/:orgId/onboarding')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class OnboardingController {
  constructor(private onboardingService: OnboardingService) {}

  @Post('start')
  @RequirePermission('org:onboarding:manage')
  async startOnboarding(@Param('orgId') orgId: string) {
    return this.onboardingService.startOnboarding(orgId);
  }

  @Get('status')
  @RequirePermission('org:onboarding:read')
  async getStatus(@Param('orgId') orgId: string) {
    return this.onboardingService.getStatus(orgId);
  }
}
