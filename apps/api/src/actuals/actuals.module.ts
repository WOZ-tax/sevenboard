import { Module } from '@nestjs/common';
import { ActualsController } from './actuals.controller';
import { ActualsService } from './actuals.service';

@Module({
  controllers: [ActualsController],
  providers: [ActualsService],
  exports: [ActualsService],
})
export class ActualsModule {}
