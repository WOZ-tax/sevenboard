import { Module } from '@nestjs/common';
import { DataHealthController } from './data-health.controller';
import { DataHealthService } from './data-health.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [DataHealthController],
  providers: [DataHealthService],
  exports: [DataHealthService],
})
export class DataHealthModule {}
