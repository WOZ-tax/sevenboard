import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsBoolean,
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
}
