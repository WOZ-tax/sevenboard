/**
 * B. PL チェックルール (5 個)
 *
 * マイナス残高 / 減価償却計上漏れ / 棚卸計上漏れ / 役員報酬月途中変動 / 10 万円以上の消耗品費
 */

import type { Provider } from '@nestjs/common';
import { NegativeBalanceRule } from './negative-balance.rule';
import { DepreciationMissingRule } from './depreciation-missing.rule';
import { InventoryMissingRule } from './inventory-missing.rule';
import { ExecutiveCompMidChangeRule } from './executive-comp-mid-change.rule';
import { LargeConsumableRule } from './large-consumable.rule';

export const PL_ANOMALY_RULE_PROVIDERS: Provider[] = [
  NegativeBalanceRule,
  DepreciationMissingRule,
  InventoryMissingRule,
  ExecutiveCompMidChangeRule,
  LargeConsumableRule,
];

export const PL_ANOMALY_RULE_TOKENS = [
  NegativeBalanceRule,
  DepreciationMissingRule,
  InventoryMissingRule,
  ExecutiveCompMidChangeRule,
  LargeConsumableRule,
];

export {
  NegativeBalanceRule,
  DepreciationMissingRule,
  InventoryMissingRule,
  ExecutiveCompMidChangeRule,
  LargeConsumableRule,
};
