import { Module } from '@nestjs/common';
import { AgentRunsController } from './agent-runs.controller';
import { AgentRunsService } from './agent-runs.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AgentRunsController],
  providers: [AgentRunsService],
  exports: [AgentRunsService],
})
export class AgentRunsModule {}
