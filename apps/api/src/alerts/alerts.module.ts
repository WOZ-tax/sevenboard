import { Module } from '@nestjs/common';
import { MfModule } from '../mf/mf.module';
import { MonthlyCloseModule } from '../monthly-close/monthly-close.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

@Module({
  imports: [MfModule, MonthlyCloseModule],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
