import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MfModule } from '../mf/mf.module';
import { AgentRunsModule } from '../agent-runs/agent-runs.module';
import { MonthlyCloseModule } from '../monthly-close/monthly-close.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SentinelController } from './sentinel.controller';
import { SentinelService } from './sentinel.service';
import {
  RiskScanOrchestrator,
  RISK_RULES_L1,
  RISK_RULES_L2,
  RISK_RULES_L3,
} from './risk-rules/orchestrator.service';
import {
  BS_BALANCE_RULE_PROVIDERS,
  BS_BALANCE_RULE_TOKENS,
} from './risk-rules/rules/bs-balance';
import {
  PL_ANOMALY_RULE_PROVIDERS,
  PL_ANOMALY_RULE_TOKENS,
} from './risk-rules/rules/pl-anomaly';
import {
  PERIOD_COMPARISON_RULE_PROVIDERS,
  PERIOD_COMPARISON_RULE_TOKENS,
} from './risk-rules/rules/period-comparison';
import {
  LOAN_RULE_PROVIDERS,
  LOAN_RULE_TOKENS,
} from './risk-rules/rules/loan';
import {
  TAX_RULE_PROVIDERS,
  TAX_RULE_TOKENS,
} from './risk-rules/rules/tax';
import type { RiskRule } from './risk-rules/types';

/**
 * Sentinel = AI CFO の異常検知層。
 *
 * 既存の SentinelService は資金繰り予兆 (DSO/DPO/CCC) のライブ計算を担当。
 * 新規 RiskScanOrchestrator は会計レビュー ② 要確認アイテム用に
 * RiskFinding を永続化する責務を持つ。両者は補完関係。
 *
 * ルール配列 (RISK_RULES_L1/L2/L3) は Step 2-3 以降で各カテゴリのルールを足していく。
 * 現時点では空配列で登録し、Orchestrator は空でも安全に動く設計。
 */
@Module({
  // AuthModule → MfModule 経由の循環ループに含まれる可能性があるため forwardRef
  imports: [
    forwardRef(() => AuthModule),
    MfModule,
    AgentRunsModule,
    MonthlyCloseModule,
    PrismaModule,
  ],
  controllers: [SentinelController],
  providers: [
    SentinelService,
    RiskScanOrchestrator,
    ...BS_BALANCE_RULE_PROVIDERS,
    ...PL_ANOMALY_RULE_PROVIDERS,
    ...PERIOD_COMPARISON_RULE_PROVIDERS,
    ...LOAN_RULE_PROVIDERS,
    ...TAX_RULE_PROVIDERS,
    {
      provide: RISK_RULES_L1,
      useFactory: (...rules: RiskRule[]) => rules,
      inject: [
        ...BS_BALANCE_RULE_TOKENS,
        ...PL_ANOMALY_RULE_TOKENS,
        ...PERIOD_COMPARISON_RULE_TOKENS,
        ...LOAN_RULE_TOKENS,
        ...TAX_RULE_TOKENS,
      ],
    },
    { provide: RISK_RULES_L2, useValue: [] },
    { provide: RISK_RULES_L3, useValue: [] },
  ],
  exports: [SentinelService, RiskScanOrchestrator],
})
export class SentinelModule {}
