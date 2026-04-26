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

/**
 * 顧客基本情報アプリ(appId:16)の主要フィールド。
 * kintone側のフィールド名が違う場合は環境変数で上書きできるようにするのが理想だが、
 * まずは一般的な名称で実装し、運用で調整する。
 */
export interface CustomerBasic {
  clientId: string;
  clientName: string;
  industry?: string;
  capital?: string;
  employees?: string;
  establishedAt?: string;
  closingMonth?: string;
  mainBanks?: string[];
  representativeName?: string;
  headOffice?: string;
  contractStatusTax?: string;
  /** そのままLLMに渡すための生フィールド（フィールド名が違っても拾えるように） */
  rawFields: Record<string, string>;
}

@Injectable()
export class KintoneApiService {
  private readonly logger = new Logger(KintoneApiService.name);
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly appId: string;
  private readonly customerAppId: string;

  constructor(private httpService: HttpService) {
    this.baseUrl = process.env.KINTONE_BASE_URL || 'https://plvu6.cybozu.com';
    this.appId = process.env.KINTONE_MONTHLY_APP_ID || '139';
    this.customerAppId = process.env.KINTONE_CUSTOMER_APP_ID || '16';

    const user = process.env.KINTONE_USERNAME || '';
    const pass = process.env.KINTONE_PASSWORD || '';
    this.authHeader = Buffer.from(`${user}:${pass}`).toString('base64');
  }

  /**
   * 月次進捗レコードを取得
   */
  async getMonthlyProgress(
    fiscalYear?: string,
    query?: string,
    assignee?: string,
  ): Promise<MonthlyProgressRecord[]> {
    const esc = (s: string) => {
      if (/[()"]/.test(s)) throw new Error('Invalid search characters');
      return s.replace(/\\/g, '\\\\');
    };
    const conditions: string[] = [];
    if (fiscalYear) {
      conditions.push(`管理年度 in ("${esc(fiscalYear)}")`);
    }
    conditions.push('契約状況 in ("継続中")');
    if (query) {
      const q = esc(query);
      conditions.push(`(クライアント名 like "${q}" or 顧客ID like "${q}")`);
    }
    if (assignee) {
      const a = esc(assignee);
      conditions.push(`(InCharge in ("${a}") or Reviewer in ("${a}") or Preparer in ("${a}"))`);
    }

    const q = conditions.join(' and ') + ' order by クライアント名 asc limit 500';

    try {
      const res: AxiosResponse = await lastValueFrom(
        this.httpService.get(`${this.baseUrl}/k/v1/records.json`, {
          params: { app: this.appId, query: q },
          headers: {
            'X-Cybozu-Authorization': this.authHeader,
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
    const esc = (s: string) => s.replace(/"/g, '\\"');
    const conditions = [`MF事業者番号 = "${esc(mfOfficeCode)}"`];
    if (fiscalYear) {
      conditions.push(`管理年度 in ("${esc(fiscalYear)}")`);
    }
    const q = conditions.join(' and ') + ' order by 管理年度 desc limit 1';

    try {
      const res: AxiosResponse = await lastValueFrom(
        this.httpService.get(`${this.baseUrl}/k/v1/records.json`, {
          params: { app: this.appId, query: q },
          headers: {
            'X-Cybozu-Authorization': this.authHeader,
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

  /**
   * recordId から「MF事業者番号」だけを取得（access 検証用）。
   * 月次進捗の所属 org を引くために使う。
   */
  async getRecordMfCode(recordId: string): Promise<string | null> {
    try {
      const res: AxiosResponse = await lastValueFrom(
        this.httpService.get(`${this.baseUrl}/k/v1/record.json`, {
          params: { app: this.appId, id: recordId },
          headers: { 'X-Cybozu-Authorization': this.authHeader },
        }) as any,
      );
      const r = res.data?.record;
      const code = r?.['MF事業者番号']?.value;
      return typeof code === 'string' && code.length > 0 ? code : null;
    } catch (err: any) {
      this.logger.error('kintone getRecordMfCode error', err?.message);
      return null;
    }
  }

  /**
   * 顧客基本情報アプリ(appId:16)から顧客IDで検索して返す。
   * フィールド名が想定と違っても rawFields に全部入れるので、LLMには食わせられる。
   */
  async getCustomerBasicByClientId(
    clientId: string,
  ): Promise<CustomerBasic | null> {
    if (!clientId) return null;
    const esc = (s: string) => s.replace(/"/g, '\\"');
    const q = `顧客ID = "${esc(clientId)}" limit 1`;
    try {
      const res: AxiosResponse = await lastValueFrom(
        this.httpService.get(`${this.baseUrl}/k/v1/records.json`, {
          params: { app: this.customerAppId, query: q },
          headers: { 'X-Cybozu-Authorization': this.authHeader },
        }) as any,
      );
      const records = res.data.records || [];
      if (records.length === 0) return null;
      return this.transformCustomerBasic(records[0]);
    } catch (err: any) {
      this.logger.warn(
        `kintone customer lookup failed (clientId=${clientId}): ${err?.message}`,
      );
      return null;
    }
  }

  /**
   * MF事業者番号から、顧客基本情報レコードを取得。
   * 月次進捗レコード→顧客ID→顧客基本情報の2段階引き。
   */
  async getCustomerBasicByMfCode(
    mfOfficeCode: string,
  ): Promise<CustomerBasic | null> {
    const monthly = await this.getByMfOfficeCode(mfOfficeCode);
    if (!monthly?.clientId) return null;
    return this.getCustomerBasicByClientId(monthly.clientId);
  }

  private transformCustomerBasic(r: KintoneRecord): CustomerBasic {
    const pick = (name: string): string => {
      const f = r[name];
      if (!f) return '';
      if (Array.isArray(f.value)) {
        return f.value.map((v: any) => v?.name ?? v?.value ?? v).join(', ');
      }
      return String(f.value ?? '');
    };
    const rawFields: Record<string, string> = {};
    // 一般的にLLMに渡しても意味のある文字列/数値系フィールドだけ抽出
    const SKIP = new Set([
      'レコード番号', '$id', '$revision',
      '作成者', '更新者', '作成日時', '更新日時',
      'ステータス', '作業者', 'カテゴリー',
    ]);
    for (const [k, v] of Object.entries(r)) {
      if (SKIP.has(k)) continue;
      if (!v || v.value == null || v.value === '') continue;
      if (typeof v.value === 'object' && !Array.isArray(v.value)) continue;
      const str = Array.isArray(v.value)
        ? v.value.map((x: any) => x?.name ?? x?.value ?? x).join(', ')
        : String(v.value);
      if (str.length > 0 && str.length < 200) rawFields[k] = str;
    }
    return {
      clientId: pick('顧客ID') || pick('ルックアップ'),
      clientName: pick('クライアント名') || pick('顧客名'),
      industry: pick('業種') || undefined,
      capital: pick('資本金') || undefined,
      employees: pick('従業員数') || undefined,
      establishedAt: pick('設立年月日') || pick('設立日') || undefined,
      closingMonth: pick('決算月') || undefined,
      mainBanks: pick('取引銀行')
        ? pick('取引銀行').split(/[,、]/).map((s) => s.trim()).filter(Boolean)
        : undefined,
      representativeName: pick('代表者') || pick('代表者名') || undefined,
      headOffice: pick('本社所在地') || pick('住所') || undefined,
      contractStatusTax: pick('契約状況(税務)') || pick('契約状況税務') || undefined,
      rawFields,
    };
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
