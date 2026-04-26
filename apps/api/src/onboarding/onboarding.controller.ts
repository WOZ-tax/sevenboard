import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from '../auth/org-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('organizations/:orgId/onboarding')
@UseGuards(JwtAuthGuard, OrgAccessGuard)
export class OnboardingController {
  constructor(private onboardingService: OnboardingService) {}

  @Post('start')
  @Roles('owner', 'advisor')
  @UseGuards(RolesGuard)
  async startOnboarding(@Param('orgId') orgId: string) {
    return this.onboardingService.startOnboarding(orgId);
  }

  @Get('status')
  async getStatus(@Param('orgId') orgId: string) {
    return this.onboardingService.getStatus(orgId);
  }
}
