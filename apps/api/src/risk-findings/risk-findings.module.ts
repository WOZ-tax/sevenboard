import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SentinelModule } from '../sentinel/sentinel.module';
import { RiskFindingsController } from './risk-findings.controller';
import { RiskFindingsService } from './risk-findings.service';

/**
 * 会計レビュー画面 ② 要確認アイテムの API モジュール。
 * RiskScanOrchestrator は SentinelModule から export されているので、それを利用する。
 */
@Module({
  imports: [forwardRef(() => AuthModule), PrismaModule, SentinelModule],
  controllers: [RiskFindingsController],
  providers: [RiskFindingsService],
  exports: [RiskFindingsService],
})
export class RiskFindingsModule {}
