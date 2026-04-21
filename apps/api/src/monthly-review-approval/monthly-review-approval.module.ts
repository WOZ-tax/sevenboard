import { Module } from '@nestjs/common';
import { MonthlyReviewApprovalController } from './monthly-review-approval.controller';
import { MonthlyReviewApprovalService } from './monthly-review-approval.service';

@Module({
  controllers: [MonthlyReviewApprovalController],
  providers: [MonthlyReviewApprovalService],
  exports: [MonthlyReviewApprovalService],
})
export class MonthlyReviewApprovalModule {}
