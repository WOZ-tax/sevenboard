import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * テナント分離の監査ミドルウェア。
 *
 * 本システムのテナント分離は「アプリ層で全クエリに tenantId/orgId を付ける」ことに
 * 依存する単層防御で、DB の RLS はポリシー未定義 + API は特権接続でバイパスするため
 * 効いていない。1か所でも tenantId スコープを書き忘れると、bulk read で他テナントの
 * データが漏れる(または bulk write が他テナント行を破壊する)。
 *
 * 真の RLS(ポリシー + 非バイパスロール + リクエスト毎の session 変数)は DB 接続を伴う
 * 検証が必要で、本番ロールを誤ると全クエリがロックアウトする高リスク変更になる。
 * その前段の安全策として、ここでは Prisma ミドルウェアで「tenantId スコープを欠いた
 * bulk 操作」を実行時に検出する。既定は warn(ログのみ・挙動不変)で、環境変数
 * TENANT_SCOPE_AUDIT=throw にすると違反クエリを例外にして強制できる。
 */
export type TenantScopeAuditMode = 'off' | 'warn' | 'throw';

/**
 * tenantId を必ず持つビジネスデータモデルのうち、bulk 操作での tenantId 欠落が
 * クロステナント漏洩/破壊に直結するもの。
 * membership / audit_log / organization 等、userId 軸などで横断クエリするのが正当な
 * モデルは誤検知を避けるため含めない。
 */
export const TENANT_SCOPED_MODELS = new Set<string>([
  'ActualEntry',
  'AccountMaster',
  'Department',
  'ChoshoVersion',
  'ChoshoRow',
  'ChoshoCellComment',
  'ChoshoRowComment',
  'JournalReviewSnapshot',
  'JournalReviewSnapshotMonth',
  'JournalReviewFlag',
  'JournalReviewComment',
  'RiskFinding',
  'HealthSnapshot',
  'Action',
  'CalendarEvent',
  'BusinessEvent',
  'CashFlowEntry',
  'CashFlowForecast',
  'CashFlowCategory',
  'Report',
  'Notification',
  'MonthlyReviewApproval',
  'MonthlyClose',
  'KpiValue',
  'JournalEntry',
  'LoanSimulation',
  'RunwaySnapshot',
  'FiscalYear',
]);

/**
 * where を取り、複数行に影響/返却する操作。tenantId 欠落の影響が大きい。
 * findUnique/findFirst(主キーや一意キー指定が多い)はノイズになるため対象外。
 */
export const AUDITED_BULK_ACTIONS = new Set<string>([
  'findMany',
  'updateMany',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

/** where(ネストした AND を含む)に tenantId 条件が含まれるか。 */
export function whereHasTenantScope(where: unknown): boolean {
  if (!where || typeof where !== 'object') return false;
  const w = where as Record<string, unknown>;
  if ('tenantId' in w) return true;
  const and = w.AND;
  if (Array.isArray(and)) return and.some((c) => whereHasTenantScope(c));
  if (and && typeof and === 'object') return whereHasTenantScope(and);
  return false;
}

/** 環境変数からモード解決。未設定/不正値は 'warn'(ログのみ)。 */
export function resolveAuditMode(
  raw: string | undefined = process.env.TENANT_SCOPE_AUDIT,
): TenantScopeAuditMode {
  const v = (raw || '').toLowerCase();
  if (v === 'off' || v === 'warn' || v === 'throw') return v;
  return 'warn';
}

/** 監査が必要なクエリか(モデルが対象 & bulk操作 & tenantスコープ欠落)を判定。 */
export function isTenantScopeViolation(params: {
  model?: string;
  action?: string;
  args?: { where?: unknown };
}): boolean {
  return (
    !!params.model &&
    !!params.action &&
    TENANT_SCOPED_MODELS.has(params.model) &&
    AUDITED_BULK_ACTIONS.has(params.action) &&
    !whereHasTenantScope(params.args?.where)
  );
}

/**
 * Prisma $use 用ミドルウェアを生成する。warn なら logger.warn、throw なら例外。
 */
export function makeTenantScopeAuditMiddleware(logger: Logger): Prisma.Middleware {
  return async (params, next) => {
    const mode = resolveAuditMode();
    if (mode !== 'off' && isTenantScopeViolation(params)) {
      const msg =
        `tenant-scope欠落: ${params.model}.${params.action} の where に tenantId がありません` +
        `（クロステナント漏洩/破壊リスク）。アプリ層スコープの書き忘れを疑ってください。`;
      if (mode === 'throw') throw new Error(msg);
      logger.warn(msg);
    }
    return next(params);
  };
}
