import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';

export interface KintoneRecord {
  [key: string]: { type: string; value: any };
}

export interface MonthlyProgressRecord {
  recordId: string;
  clientName: string;
  clientId: string;
  fiscalYear: string;
  closingMonth: string;
  mfOfficeCode: string;
  inCharge: string[];
  reviewer: string[];
  preparer: string[];
  commitment: string;
  contractStatus: string;
  monthlyStatus: Record<number, string>; // 1-12 → status
  meetingDates: Record<number, string | null>; // 1-12 → date
}

@Injectable()
export class KintoneApiService {
  private readonly logger = new Logger(KintoneApiService.name);
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly appId: string;

  constructor(private httpService: HttpService) {
    this.baseUrl = process.env.KINTONE_BASE_URL || 'https://plvu6.cybozu.com';
    this.appId = process.env.KINTONE_MONTHLY_APP_ID || '139';

    const user = process.env.KINTONE_USERNAME || '';
    const pass = process.env.KINTONE_PASSWORD || '';
    this.authHeader = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
  }

  /**
   * 月次進捗レコードを取得
   */
  async getMonthlyProgress(
    fiscalYear?: string,
    query?: string,
  ): Promise<MonthlyProgressRecord[]> {
    const conditions: string[] = [];
    if (fiscalYear) {
      conditions.push(`管理年度 in ("${fiscalYear}")`);
    }
    conditions.push('契約状況 in ("継続中")');
    if (query) {
      conditions.push(`(クライアント名 like "${query}" or 顧客ID like "${query}")`);
    }

    const q = conditions.join(' and ') + ' order by クライアント名 asc limit 500';

    try {
      const res: AxiosResponse = await lastValueFrom(
        this.httpService.get(`${this.baseUrl}/k/v1/records.json`, {
          params: { app: this.appId, query: q },
          headers: {
            'X-Cybozu-Authorization': Buffer.from(
              `${process.env.KINTONE_USERNAME || ''}:${process.env.KINTONE_PASSWORD || ''}`,
            ).toString('base64'),
          },
        }) as any,
      );

      return (res.data.records || []).map((r: KintoneRecord) =>
        this.transformRecord(r),
      );
    } catch (err: any) {
      this.logger.error(
        'kintone API error',
        err?.response?.data || err?.message,
      );
      return [];
    }
  }

  /**
   * 特定のMF事業者番号でレコードを検索
   */
  async getByMfOfficeCode(
    mfOfficeCode: string,
    fiscalYear?: string,
  ): Promise<MonthlyProgressRecord | null> {
    const conditions = [`MF事業者番号 = "${mfOfficeCode}"`];
    if (fiscalYear) {
      conditions.push(`管理年度 in ("${fiscalYear}")`);
    }
    const q = conditions.join(' and ') + ' order by 管理年度 desc limit 1';

    try {
      const res: AxiosResponse = await lastValueFrom(
        this.httpService.get(`${this.baseUrl}/k/v1/records.json`, {
          params: { app: this.appId, query: q },
          headers: {
            'X-Cybozu-Authorization': Buffer.from(
              `${process.env.KINTONE_USERNAME || ''}:${process.env.KINTONE_PASSWORD || ''}`,
            ).toString('base64'),
          },
        }) as any,
      );

      const records = res.data.records || [];
      return records.length > 0 ? this.transformRecord(records[0]) : null;
    } catch (err: any) {
      this.logger.error('kintone lookup error', err?.message);
      return null;
    }
  }

  /**
   * kintoneレコードのステータスを更新
   */
  async updateMonthlyStatus(
    recordId: string,
    month: number,
    status: string,
  ): Promise<boolean> {
    const fieldCode = `月${month}`;
    try {
      await lastValueFrom(
        this.httpService.put(
          `${this.baseUrl}/k/v1/record.json`,
          {
            app: this.appId,
            id: recordId,
            record: { [fieldCode]: { value: status } },
          },
          {
            headers: {
              'X-Cybozu-Authorization': Buffer.from(
                `${process.env.KINTONE_USERNAME || ''}:${process.env.KINTONE_PASSWORD || ''}`,
              ).toString('base64'),
              'Content-Type': 'application/json',
            },
          },
        ) as any,
      );
      return true;
    } catch (err: any) {
      this.logger.error('kintone update error', err?.message);
      return false;
    }
  }

  private transformRecord(r: KintoneRecord): MonthlyProgressRecord {
    const monthlyStatus: Record<number, string> = {};
    const meetingDates: Record<number, string | null> = {};

    for (let m = 1; m <= 12; m++) {
      monthlyStatus[m] = r[`月${m}`]?.value || '0.未作業';
      meetingDates[m] = r[`月${m}面談実施日`]?.value || null;
    }

    const extractUsers = (field: any): string[] => {
      if (!field?.value) return [];
      if (Array.isArray(field.value)) {
        return field.value.map((u: any) => u.name || u.code || '');
      }
      return [];
    };

    return {
      recordId: r['レコード番号']?.value || '',
      clientName: r['クライアント名']?.value || '',
      clientId: r['顧客ID']?.value || r['ルックアップ']?.value || '',
      fiscalYear: r['管理年度']?.value || '',
      closingMonth: r['決算月']?.value || '',
      mfOfficeCode: r['MF事業者番号']?.value || '',
      inCharge: extractUsers(r['InCharge']),
      reviewer: extractUsers(r['Reviewer']),
      preparer: extractUsers(r['Preparer']),
      commitment: r['コミット']?.value || '',
      contractStatus: r['契約状況']?.value || '',
      monthlyStatus,
      meetingDates,
    };
  }
}
