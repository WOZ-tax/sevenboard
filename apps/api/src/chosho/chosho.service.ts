import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MfApiService } from '../mf/mf-api.service';
import { buildChoshoPreviewRows } from './chosho-preview.builder';
import type { ChoshoPreviewResult } from './chosho-preview.types';

/**
 * 残高調書 service。
 *
 * Unit 2A スコープ: MF 推移表を取得して純関数 builder で 3 階層 row 配列に変換し、
 * preview として返すだけ。chosho_versions / chosho_rows への INSERT は一切行わない。
 *
 * tenant/org 権限境界は controller の PermissionGuard で担保 (既存パターン準拠)。
 */
@Injectable()
export class ChoshoService {
  constructor(
    private prisma: PrismaService,
    private mfApi: MfApiService,
  ) {}

  /**
   * 指定 (orgId, fiscalYear, selectedMonth) の残高調書プレビューを返す。
   *
   * @param selectedMonth カレンダー月 (1-12)。この月までを「確定」、それ以降を outOfRange 扱いに UI で表現する想定。
   *                      MF API 側にも end_month として渡し、年換算等の影響を抑える。
   */
  async preview(
    orgId: string,
    fiscalYear: number,
    selectedMonth: number,
  ): Promise<ChoshoPreviewResult> {
    // Organization から期首月を導出。fiscalMonthEnd=3 (3月決算) → fyStart=4。
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { fiscalMonthEnd: true },
    });
    const fyStartMonth = (org.fiscalMonthEnd % 12) + 1;

    // MF 接続が無い org でも 200 を返したいので catch して null 化。
    const bsTransition = await this.mfApi
      .getTransitionBS(orgId, fiscalYear, selectedMonth)
      .catch(() => null);

    const { rows, monthOrder } = buildChoshoPreviewRows({
      bsTransition,
      selectedMonth,
      // Unit 2B-1 時点では DB 永続ルールがないため override は渡さない。
      // Unit 2B-2 で chosho_rows から読んで Map<rowKey, ChoshoRuleOverride> に詰める。
    });

    return {
      fiscalYear,
      selectedMonth,
      fyStartMonth,
      monthOrder,
      rows,
    };
  }
}
