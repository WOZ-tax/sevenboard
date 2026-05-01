/**
 * C. 期間比較ルール (2 個)
 *
 * 売上の前年同月比 / 主要販管費の前年同月比
 */

import type { Provider } from '@nestjs/common';
import { RevenueYoyRule } from './revenue-yoy.rule';
import { SgaYoyRule } from './sga-yoy.rule';

export const PERIOD_COMPARISON_RULE_PROVIDERS: Provider[] = [
  RevenueYoyRule,
  SgaYoyRule,
];

export const PERIOD_COMPARISON_RULE_TOKENS = [
  RevenueYoyRule,
  SgaYoyRule,
];

export { RevenueYoyRule, SgaYoyRule };
