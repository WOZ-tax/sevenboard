import { Module } from '@nestjs/common';
import { MfModule } from '../mf/mf.module';
import { MonthlyCloseModule } from '../monthly-close/monthly-close.module';
import { SimulationController } from './simulation.controller';
import { SimulationService } from './simulation.service';

@Module({
  imports: [MfModule, MonthlyCloseModule],
  controllers: [SimulationController],
  providers: [SimulationService],
  exports: [SimulationService],
})
export class SimulationModule {}
