import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  MonthlyProgressRecord,
  CustomerBasic,
} from '../kintone/kintone-api.service';
import {
  DEMO_CODE,
  DEMO_COMPANY_NAME,
  DEMO_MONTH,
  DEMO_ORG_ID,
  DEMO_TENANT_ID,
  DEMO_YEAR,
} from './demo.constants';

@Injectable()
export class DemoService {
  constructor(private readonly prisma: PrismaService) {}

  async monthlyProgress(
    year = String(DEMO_YEAR),
  ): Promise<MonthlyProgressRecord> {
    if (!/^202[2-6]$/.test(year))
      throw new BadRequestException('デモの会計期間は2022〜2026年です');
    const saved = await this.prisma.featureState.findMany({
      where: {
        tenantId: DEMO_TENANT_ID,
        orgId: DEMO_ORG_ID,
        featureKey: 'demo.monthly-progress',
        scope: { startsWith: `${year}:` },
      },
    });
    const monthlyStatus: Record<number, string> = {};
    const meetingDates: Record<number, string | null> = {};
    for (let month = 1; month <= 12; month++) {
      monthlyStatus[month] =
        Number(year) < DEMO_YEAR || month < DEMO_MONTH
          ? '4.納品済'
          : month === DEMO_MONTH
            ? '3.入力済'
            : '0.未作業';
      const value = saved.find((row) => row.scope === `${year}:${month}`)
        ?.value as { status?: string } | undefined;
      if (value?.status) monthlyStatus[month] = value.status;
      meetingDates[month] = null;
    }
    return {
      recordId: `9900${year}`,
      clientName: DEMO_COMPANY_NAME,
      clientId: DEMO_CODE,
      fiscalYear: year,
      closingMonth: '12',
      mfOfficeCode: DEMO_CODE,
      inCharge: ['デモ担当者'],
      reviewer: ['デモ担当者'],
      preparer: ['デモ担当者'],
      commitment: '月次レビュー・経営支援',
      contractStatus: '継続中',
      monthlyStatus,
      meetingDates,
    };
  }

  async updateMonthlyProgress(recordId: string, month: number, status: string) {
    if (
      !/^9900202[2-6]$/.test(recordId) ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      ![
        '0.未作業',
        '1.資料依頼済',
        '2.資料回収済',
        '3.入力済',
        '4.納品済',
        '5.実施不要',
      ].includes(status)
    ) {
      throw new BadRequestException('Invalid demo progress');
    }
    const scope = `${recordId.slice(4)}:${month}`;
    await this.prisma.featureState.upsert({
      where: {
        orgId_featureKey_scope: {
          orgId: DEMO_ORG_ID,
          featureKey: 'demo.monthly-progress',
          scope,
        },
      },
      create: {
        tenantId: DEMO_TENANT_ID,
        orgId: DEMO_ORG_ID,
        featureKey: 'demo.monthly-progress',
        scope,
        value: { status },
      },
      update: { value: { status } },
    });
    return { success: true };
  }

  customer(): CustomerBasic {
    return {
      clientId: DEMO_CODE,
      clientName: DEMO_COMPANY_NAME,
      industry: '卸売業',
      capital: '10000000',
      employees: '8',
      closingMonth: '12',
      mainBanks: ['架空みらい銀行'],
      representativeName: '青空 太郎（架空）',
      headOffice: '東京都（架空所在地）',
      contractStatusTax: '継続中',
      rawFields: {
        事業内容:
          '生活用品を小売店へ販売する架空の卸売会社。法人税等の月次概算は研修用の30%仮定。',
      },
    };
  }
}
