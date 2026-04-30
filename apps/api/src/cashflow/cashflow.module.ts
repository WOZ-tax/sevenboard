import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CashflowController } from './cashflow.controller';
import { CashflowService } from './cashflow.service';

@Module({
  imports: [AuthModule],
  controllers: [CashflowController],
  providers: [CashflowService],
  exports: [CashflowService],
})
export class CashflowModule {}
