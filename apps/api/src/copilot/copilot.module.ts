import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from '../auth/auth.module';
import { MfModule } from '../mf/mf.module';
import { AlertsModule } from '../alerts/alerts.module';
import { ActionsModule } from '../actions/actions.module';
import { DataHealthModule } from '../data-health/data-health.module';
import { AgentRunsModule } from '../agent-runs/agent-runs.module';
import { MonthlyCloseModule } from '../monthly-close/monthly-close.module';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';

@Module({
  imports: [
    HttpModule.register({ timeout: 60000, maxRedirects: 3 }),
    AuthModule,
    MfModule,
    AlertsModule,
    ActionsModule,
    DataHealthModule,
    AgentRunsModule,
    MonthlyCloseModule,
  ],
  controllers: [CopilotController],
  providers: [CopilotService],
  exports: [CopilotService],
})
export class CopilotModule {}
