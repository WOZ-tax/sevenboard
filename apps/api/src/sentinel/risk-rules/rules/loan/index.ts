/**
 * D. 借入金ルール (2 個)
 *
 * 借入残高と返済予定の乖離 / 支払利息計上漏れ
 */

import type { Provider } from '@nestjs/common';
import { BorrowingDeviationRule } from './borrowing-deviation.rule';
import { InterestMissingRule } from './interest-missing.rule';

export const LOAN_RULE_PROVIDERS: Provider[] = [
  BorrowingDeviationRule,
  InterestMissingRule,
];

export const LOAN_RULE_TOKENS = [
  BorrowingDeviationRule,
  InterestMissingRule,
];

export { BorrowingDeviationRule, InterestMissingRule };
