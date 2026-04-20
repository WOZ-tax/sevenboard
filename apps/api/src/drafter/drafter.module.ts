import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MfModule } from '../mf/mf.module';
import { DrafterController } from './drafter.controller';
import { DrafterService } from './drafter.service';

@Module({
  imports: [HttpModule.register({ timeout: 30000 }), MfModule],
  controllers: [DrafterController],
  providers: [DrafterService],
  exports: [DrafterService],
})
export class DrafterModule {}
