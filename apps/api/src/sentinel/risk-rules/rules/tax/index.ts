/**
 * E. 消費税ルール (3 個)
 *
 * 仮払消費税計上漏れ / 仮受消費税計上漏れ / 消費税区分混在
 */

import type { Provider } from '@nestjs/common';
import { ConsumptionTaxAdvanceMissingRule } from './consumption-tax-advance-missing.rule';
import { ConsumptionTaxReceivedMissingRule } from './consumption-tax-received-missing.rule';
import { TaxCategoryMixedRule } from './tax-category-mixed.rule';

export const TAX_RULE_PROVIDERS: Provider[] = [
  ConsumptionTaxAdvanceMissingRule,
  ConsumptionTaxReceivedMissingRule,
  TaxCategoryMixedRule,
];

export const TAX_RULE_TOKENS = [
  ConsumptionTaxAdvanceMissingRule,
  ConsumptionTaxReceivedMissingRule,
  TaxCategoryMixedRule,
];

export {
  ConsumptionTaxAdvanceMissingRule,
  ConsumptionTaxReceivedMissingRule,
  TaxCategoryMixedRule,
};
