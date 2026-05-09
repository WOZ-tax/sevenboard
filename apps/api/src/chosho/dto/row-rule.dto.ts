import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
} from 'class-validator';

/**
 * PUT /organizations/:orgId/chosho/versions/:vid/rows/:rid/rule の body。
 *
 * - expectedRule: 'NONE' で異常検知無効化 / 'EXPECTED_VALUE' で expectedValue と一致チェック
 *                / 'AGING_3M' で滞留チェック (agingCheckEnabled の代わりに明示的に設定)
 * - expectedValue: EXPECTED_VALUE のときのみ意味を持つ。null 許容 (未設定 = 検知スキップ)
 * - agingCheckEnabled: 滞留チェックの ON/OFF。expectedRule とは独立
 */
export class UpdateRowRuleDto {
  @IsIn(['NONE', 'EXPECTED_VALUE', 'AGING_3M'])
  expectedRule!: 'NONE' | 'EXPECTED_VALUE' | 'AGING_3M';

  /** EXPECTED_VALUE のときに比較する数値。null = 未設定。 */
  @IsOptional()
  @IsNumber()
  expectedValue?: number | null;

  @IsBoolean()
  agingCheckEnabled!: boolean;
}
