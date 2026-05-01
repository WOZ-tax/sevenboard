/**
 * L2 統計ルール (会社固有の正常レンジから外れる検知)
 *
 * 過去 24 ヶ月の ActualEntry を元に IQR ベースで判定。
 * 短期間 (12 ヶ月未満) のデータしかない科目は判定保留。
 */

import type { Provider } from '@nestjs/common';
import { ExpenseOutlierRule } from './expense-outlier.rule';

export const STATS_RULE_PROVIDERS: Provider[] = [ExpenseOutlierRule];
export const STATS_RULE_TOKENS = [ExpenseOutlierRule];

export { ExpenseOutlierRule };
