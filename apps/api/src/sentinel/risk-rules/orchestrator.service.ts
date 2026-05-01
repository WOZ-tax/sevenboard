import { Inject, Injectable, Logger } from '@nestjs/common';
import { RiskLayer } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MfApiService } from '../../mf/mf-api.service';
import { MfTransformService } from '../../mf/mf-transform.service';
import type { RiskRule, RiskRuleContext, RiskFindingDraft } from './types';

/**
 * ルール集合をプロバイダ経由で受け取るための DI トークン。
 * sentinel.module.ts で各層のルール配列をまとめて登録する。
 */
export const RISK_RULES_L1 = Symbol('RISK_RULES_L1');
export const RISK_RULES_L2 = Symbol('RISK_RULES_L2');
export const RISK_RULES_L3 = Symbol('RISK_RULES_L3');

export interface RiskScanResult {
  layer: RiskLayer;
  ruleCount: number;
  findingCount: number;
  errors: { ruleKey: string; message: string }[];
  startedAt: Date;
  finishedAt: Date;
}

@Injectable()
export class RiskScanOrchestrator {
  private readonly logger = new Logger('RiskScanOrchestrator');

  constructor(
    private prisma: PrismaService,
    private mfApi: MfApiService,
    private mfTransform: MfTransformService,
    @Inject(RISK_RULES_L1) private readonly l1Rules: RiskRule[],
    @Inject(RISK_RULES_L2) private readonly l2Rules: RiskRule[],
    @Inject(RISK_RULES_L3) private readonly l3Rules: RiskRule[],
  ) {}

  /**
   * L1 ルール (決定的ルール) を実行。MF 同期完了時のフックから呼ばれる想定。
   */
  async runL1(
    orgId: string,
    fiscalYear: number,
    month: number,
  ): Promise<RiskScanResult> {
    return this.runLayer(RiskLayer.L1_RULE, this.l1Rules, orgId, fiscalYear, month);
  }

  /**
   * L2 ルール (統計逸脱) を実行。MF 同期完了時のフックから呼ばれる想定。
   */
  async runL2(
    orgId: string,
    fiscalYear: number,
    month: number,
  ): Promise<RiskScanResult> {
    return this.runLayer(RiskLayer.L2_STATS, this.l2Rules, orgId, fiscalYear, month);
  }

  /**
   * L3 ルール (LLM 摘要異常) を実行。「AI詳細チェック」ボタン押下時のみ呼ばれる。
   * トークンコストがかかるため日次バッチでは実行しない。
   */
  async runL3(
    orgId: string,
    fiscalYear: number,
    month: number,
  ): Promise<RiskScanResult> {
    return this.runLayer(RiskLayer.L3_LLM, this.l3Rules, orgId, fiscalYear, month);
  }

  private async runLayer(
    layer: RiskLayer,
    rules: RiskRule[],
    orgId: string,
    fiscalYear: number,
    month: number,
  ): Promise<RiskScanResult> {
    const startedAt = new Date();
    const errors: { ruleKey: string; message: string }[] = [];
    let findingCount = 0;

    if (rules.length === 0) {
      this.logger.warn(`[${layer}] no rules registered, skipping scan`);
      return {
        layer,
        ruleCount: 0,
        findingCount: 0,
        errors,
        startedAt,
        finishedAt: new Date(),
      };
    }

    const ctx = await this.buildContext(orgId, fiscalYear, month);

    for (const rule of rules) {
      if (rule.layer !== layer) {
        this.logger.warn(
          `Rule ${rule.key} is registered under ${layer} but declares layer=${rule.layer}; skipping`,
        );
        continue;
      }

      try {
        const drafts = await rule.detect(ctx);
        for (const d of drafts) {
          await this.upsertFinding(ctx, d);
          findingCount += 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Rule ${rule.key} failed: ${message}`);
        errors.push({ ruleKey: rule.key, message });
      }
    }

    return {
      layer,
      ruleCount: rules.length,
      findingCount,
      errors,
      startedAt,
      finishedAt: new Date(),
    };
  }

  private async buildContext(
    orgId: string,
    fiscalYear: number,
    month: number,
  ): Promise<RiskRuleContext> {
    const { tenantId } = await this.prisma.orgScope(orgId);
    // JST 基準で月初 / 月末を作る
    const periodStart = new Date(Date.UTC(fiscalYear, month - 1, 1));
    const periodEnd = new Date(Date.UTC(fiscalYear, month, 0, 23, 59, 59, 999));
    return {
      tenantId,
      orgId,
      fiscalYear,
      month,
      periodStart,
      periodEnd,
      prisma: this.prisma,
      mfApi: this.mfApi,
      mfTransform: this.mfTransform,
    };
  }

  private async upsertFinding(
    ctx: RiskRuleContext,
    draft: RiskFindingDraft,
  ): Promise<void> {
    if (draft.riskScore < 0 || draft.riskScore > 100) {
      this.logger.warn(
        `Rule ${draft.ruleKey} produced out-of-range riskScore=${draft.riskScore}, clamping`,
      );
    }
    const score = Math.max(0, Math.min(100, Math.round(draft.riskScore)));

    await this.prisma.riskFinding.upsert({
      where: {
        tenantId_orgId_fiscalYear_month_layer_ruleKey_scopeKey: {
          tenantId: ctx.tenantId,
          orgId: ctx.orgId,
          fiscalYear: ctx.fiscalYear,
          month: ctx.month,
          layer: draft.layer,
          ruleKey: draft.ruleKey,
          scopeKey: draft.scopeKey,
        },
      },
      update: {
        title: draft.title,
        body: draft.body,
        riskScore: score,
        flags: draft.flags,
        evidence: draft.evidence as object,
        recommendedAction: draft.recommendedAction,
        // status は触らない (顧問が CONFIRMED / DISMISSED にしていたら維持する)
      },
      create: {
        tenantId: ctx.tenantId,
        orgId: ctx.orgId,
        fiscalYear: ctx.fiscalYear,
        month: ctx.month,
        layer: draft.layer,
        ruleKey: draft.ruleKey,
        scopeKey: draft.scopeKey,
        title: draft.title,
        body: draft.body,
        riskScore: score,
        flags: draft.flags,
        evidence: draft.evidence as object,
        recommendedAction: draft.recommendedAction,
      },
    });
  }
}
