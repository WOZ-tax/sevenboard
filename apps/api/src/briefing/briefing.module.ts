import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TriageModule } from '../triage/triage.module';
import { MfModule } from '../mf/mf.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BriefingController } from './briefing.controller';
import { BriefingService } from './briefing.service';
import { BriefingSchedulerService } from './briefing-scheduler.service';

@Module({
  imports: [
    HttpModule.register({ timeout: 60000, maxRedirects: 3 }),
    TriageModule,
    MfModule,
    NotificationsModule,
  ],
  controllers: [BriefingController],
  providers: [BriefingService, BriefingSchedulerService],
  exports: [BriefingService],
})
export class BriefingModule {}
