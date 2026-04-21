import { Module } from '@nestjs/common';
import { AgentRunsModule } from '../agent-runs/agent-runs.module';
import { AuditorController } from './auditor.controller';
import { AuditorService } from './auditor.service';

@Module({
  imports: [AgentRunsModule],
  controllers: [AuditorController],
  providers: [AuditorService],
  exports: [AuditorService],
})
export class AuditorModule {}
