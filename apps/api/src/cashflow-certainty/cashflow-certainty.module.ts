import { Module } from '@nestjs/common';
import { CashflowCertaintyController } from './cashflow-certainty.controller';
import { CashflowCertaintyService } from './cashflow-certainty.service';

@Module({
  controllers: [CashflowCertaintyController],
  providers: [CashflowCertaintyService],
  exports: [CashflowCertaintyService],
})
export class CashflowCertaintyModule {}
