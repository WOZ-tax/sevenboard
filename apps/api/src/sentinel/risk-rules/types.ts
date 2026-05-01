/**
 * AI CFO 異常検知 (会計レビュー ② 要確認アイテム) のルール型定義。
 *
 * 設計方針:
 * - 各ルールは純粋関数として detect() を実装し、副作用 (DB 書き込み) は持たない
 * - 検知結果は RiskFindingDraft として返し、Orchestrator が upsert を担当
 * - 同一ルール内で複数対象 (科目別・取引先別) を検知する場合は scopeKey で識別
 * - 推奨アクション (recommendedAction) は CFO 原則 3「指摘しっぱなし禁止」のため必須
 */

import type { RiskLayer } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MfApiService } from '../../mf/mf-api.service';
import type { MfTransformService } from '../../mf/mf-transform.service';

/**
 * ルール実行時に渡されるコンテキスト。
 * MF API・Prisma へのアクセスはこの ctx 経由で行う。
 */
export interface RiskRuleContext {
  tenantId: string;
  orgId: string;
  fiscalYear: number;
  /** 1-12 (カレンダー月) */
  month: number;
  /** 対象月の開始日 (JST 基準) */
  periodStart: Date;
  /** 対象月の終了日 (JST 基準、月末) */
  periodEnd: Date;
  prisma: PrismaService;
  mfApi: MfApiService;
  mfTransform: MfTransformService;
}

/**
 * ルールが返す検知結果のドラフト。Orchestrator がこれを RiskFinding に変換して upsert する。
 */
export interface RiskFindingDraft {
  layer: RiskLayer;
  /** ルール識別子。例: 'NEGATIVE_BALANCE', 'AR_LONG_OVERDUE' */
  ruleKey: string;
  /**
   * 同一ルール内で複数対象を検知する場合の対象識別子。
   * 例: 取引先別検知なら取引先 ID、科目別検知なら科目コード。
   * 対象が単一なら空文字 '' を渡す。
   */
  scopeKey: string;
  /** ユーザー向けの 1 行サマリー */
  title: string;
  /** ユーザー向けの本文 */
  body: string;
  /** 0-100。基準値 × material_multiplier で算出する */
  riskScore: number;
  /** 検知に紐づくフラグ。例: ['amount_x3', 'first_occurrence'] */
  flags: string[];
  /** 検知の根拠データ。仕訳 ID、科目コード、期間、ベースライン値など */
  evidence: Record<string, unknown>;
  /** CFO 原則: 必ず推奨アクションを書く */
  recommendedAction: string;
}

/**
 * 個別ルールが実装する interface。
 *
 * detect() は何件でも RiskFindingDraft を返してよい。
 * ルール内のエラーは Orchestrator 側で catch する (1 ルールの失敗が全体を止めない)。
 */
export interface RiskRule {
  /** ルール識別子 (RiskFindingDraft.ruleKey と一致させる) */
  readonly key: string;
  /** どの層に属するか */
  readonly layer: RiskLayer;
  /** ヒューマン向けの説明 (ログ・デバッグ用) */
  readonly description: string;
  detect(ctx: RiskRuleContext): Promise<RiskFindingDraft[]>;
}
