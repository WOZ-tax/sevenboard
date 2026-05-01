/**
 * A. BS 残高ルール (11 個 = 売掛 3 + 買掛 2 + 未払 3 + 預り 1 + 仮払・仮受 2)
 *
 * 預り金 3 種 (源泉所得税 / 社会保険 / 住民税) は給与計算データなしでは正確な突合が
 * できないため、L1 では「預り金合計の異常」を 1 ルールに統合し、補助科目別の精緻判定は
 * L3 LLM「AI詳細チェック」で行う設計。
 */

import type { Provider } from '@nestjs/common';
import { ArNegativeRule } from './ar-negative.rule';
import { ApNegativeRule } from './ap-negative.rule';
import { ArSurgeRule } from './ar-surge.rule';
import { ApSurgeRule } from './ap-surge.rule';
import { ArLongOverdueRule } from './ar-long-overdue.rule';
import { UnpaidMissingRule } from './unpaid-missing.rule';
import { UnpaidStagnantRule } from './unpaid-stagnant.rule';
import { AccruedMissingRule } from './accrued-missing.rule';
import { WithholdingAnomalyRule } from './withholding-anomaly.rule';
import { AdvanceStagnantRule } from './advance-stagnant.rule';
import { SuspenseStagnantRule } from './suspense-stagnant.rule';

export const BS_BALANCE_RULE_PROVIDERS: Provider[] = [
  ArNegativeRule,
  ApNegativeRule,
  ArSurgeRule,
  ApSurgeRule,
  ArLongOverdueRule,
  UnpaidMissingRule,
  UnpaidStagnantRule,
  AccruedMissingRule,
  WithholdingAnomalyRule,
  AdvanceStagnantRule,
  SuspenseStagnantRule,
];

export const BS_BALANCE_RULE_TOKENS = [
  ArNegativeRule,
  ApNegativeRule,
  ArSurgeRule,
  ApSurgeRule,
  ArLongOverdueRule,
  UnpaidMissingRule,
  UnpaidStagnantRule,
  AccruedMissingRule,
  WithholdingAnomalyRule,
  AdvanceStagnantRule,
  SuspenseStagnantRule,
];

export {
  ArNegativeRule,
  ApNegativeRule,
  ArSurgeRule,
  ApSurgeRule,
  ArLongOverdueRule,
  UnpaidMissingRule,
  UnpaidStagnantRule,
  AccruedMissingRule,
  WithholdingAnomalyRule,
  AdvanceStagnantRule,
  SuspenseStagnantRule,
};
