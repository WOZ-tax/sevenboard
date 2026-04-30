import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from '../auth/auth.module';
import { TriageModule } from '../triage/triage.module';
import { MfModule } from '../mf/mf.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AgentRunsModule } from '../agent-runs/agent-runs.module';
import { BriefingController } from './briefing.controller';
import { BriefingService } from './briefing.service';
import { BriefingSchedulerService } from './briefing-scheduler.service';

@Module({
  imports: [
    HttpModule.register({ timeout: 60000, maxRedirects: 3 }),
    AuthModule,
    TriageModule,
    MfModule,
    NotificationsModule,
    AgentRunsModule,
  ],
  controllers: [BriefingController],
  providers: [BriefingService, BriefingSchedulerService],
  exports: [BriefingService],
})
export class BriefingModule {}
