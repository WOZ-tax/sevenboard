import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MonthlyReviewApprovalController } from './monthly-review-approval.controller';
import { MonthlyReviewApprovalService } from './monthly-review-approval.service';

@Module({
  imports: [AuthModule],
  controllers: [MonthlyReviewApprovalController],
  providers: [MonthlyReviewApprovalService],
  exports: [MonthlyReviewApprovalService],
})
export class MonthlyReviewApprovalModule {}
