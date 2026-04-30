import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CashflowCertaintyController } from './cashflow-certainty.controller';
import { CashflowCertaintyService } from './cashflow-certainty.service';

@Module({
  imports: [AuthModule],
  controllers: [CashflowCertaintyController],
  providers: [CashflowCertaintyService],
  exports: [CashflowCertaintyService],
})
export class CashflowCertaintyModule {}
