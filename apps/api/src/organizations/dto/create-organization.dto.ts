import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  IsArray,
  IsUUID,
} from 'class-validator';

export class CreateOrganizationDto {
  /** 顧問先名（表示名） */
  @IsString()
  @MaxLength(100)
  name!: string;

  /** MF 事業者コード（任意。MF Cloud 連携時にキーとして使う） */
  @IsString()
  @IsOptional()
  @MaxLength(40)
  code?: string;

  /** factory-hybrid 等の社内システムでの管理No（任意） */
  @IsString()
  @IsOptional()
  @MaxLength(40)
  managementNo?: string;

  /** 決算月（1-12） */
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalMonthEnd!: number;

  /** 業種（任意） */
  @IsString()
  @IsOptional()
  @MaxLength(40)
  industry?: string;

  /**
   * 原価計算を運用しているか。未指定時は false（売上総利益率を信用しないモード）
   * 中小企業向けデフォルト。
   */
  @IsBoolean()
  @IsOptional()
  usesCostAccounting?: boolean;

  /** この顧問先に最初から担当アサインする SEVENRICH スタッフの user.id 配列 */
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  advisorUserIds?: string[];
}
