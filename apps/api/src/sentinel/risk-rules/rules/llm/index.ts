/**
 * L3 LLM ルール (摘要・パターンの意味的異常検知)
 *
 * 「AI詳細チェック」ボタン押下時のみ実行 (トークン消費するため)。
 */

import type { Provider } from '@nestjs/common';
import { JournalAnomalyLlmRule } from './journal-anomaly.rule';

export const LLM_RULE_PROVIDERS: Provider[] = [JournalAnomalyLlmRule];
export const LLM_RULE_TOKENS = [JournalAnomalyLlmRule];

export { JournalAnomalyLlmRule };
