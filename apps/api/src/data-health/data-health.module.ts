import { Module } from '@nestjs/common';
import { DataHealthController } from './data-health.controller';
import { DataHealthService } from './data-health.service';

@Module({
  controllers: [DataHealthController],
  providers: [DataHealthService],
  exports: [DataHealthService],
})
export class DataHealthModule {}
