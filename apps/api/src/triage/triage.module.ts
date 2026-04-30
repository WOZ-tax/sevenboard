import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TriageController } from './triage.controller';
import { TriageService } from './triage.service';
import { AlertsModule } from '../alerts/alerts.module';
import { DataHealthModule } from '../data-health/data-health.module';

@Module({
  imports: [AuthModule, AlertsModule, DataHealthModule],
  controllers: [TriageController],
  providers: [TriageService],
  exports: [TriageService],
})
export class TriageModule {}
