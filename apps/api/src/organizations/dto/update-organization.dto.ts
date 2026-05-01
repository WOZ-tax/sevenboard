import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsBoolean,
  IsUrl,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class UpdateOrganizationDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  code?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  managementNo?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(12)
  fiscalMonthEnd?: number;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  industry?: string;

  /** 契約プラン。請求機能は将来対応 */
  @IsEnum(['STARTER', 'GROWTH', 'PRO'])
  @IsOptional()
  planType?: 'STARTER' | 'GROWTH' | 'PRO';

  /** 原価計算を運用しているかのトグル */
  @IsBoolean()
  @IsOptional()
  usesCostAccounting?: boolean;

  /** 公開 HP URL (AI CFO の事業理解に使う) */
  @IsOptional()
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(500)
  websiteUrl?: string | null;

  /**
   * 経営コンテキスト (自由記述)。業種だけでは表現できない事情を書く。
   * AI 質問生成・L3 LLM 検知の system prompt に注入される。
   */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  businessContext?: string | null;
}
