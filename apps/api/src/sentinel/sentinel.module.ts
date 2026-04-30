import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MfModule } from '../mf/mf.module';
import { AgentRunsModule } from '../agent-runs/agent-runs.module';
import { MonthlyCloseModule } from '../monthly-close/monthly-close.module';
import { SentinelController } from './sentinel.controller';
import { SentinelService } from './sentinel.service';

@Module({
  imports: [AuthModule, MfModule, AgentRunsModule, MonthlyCloseModule],
  controllers: [SentinelController],
  providers: [SentinelService],
  exports: [SentinelService],
})
export class SentinelModule {}
