import { Module } from '@nestjs/common';
import { MfModule } from '../mf/mf.module';
import { SentinelController } from './sentinel.controller';
import { SentinelService } from './sentinel.service';

@Module({
  imports: [MfModule],
  controllers: [SentinelController],
  providers: [SentinelService],
  exports: [SentinelService],
})
export class SentinelModule {}
