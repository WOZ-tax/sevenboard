import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AgentRunsModule } from '../agent-runs/agent-runs.module';
import { AuditorController } from './auditor.controller';
import { AuditorService } from './auditor.service';

@Module({
  imports: [AuthModule, AgentRunsModule],
  controllers: [AuditorController],
  providers: [AuditorService],
  exports: [AuditorService],
})
export class AuditorModule {}
