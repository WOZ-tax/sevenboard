import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * PUT /organizations/:orgId/journal-flags/:journalId の body。
 *
 * - resolved=false (toggle ON): flag を立てる / 既に立っていれば再 open
 * - resolved=true (toggle OFF): 既存 flag を resolved にする (赤ハイライト解除)
 *
 * fiscalYear / month は新規 flag を作成する時の参考保存値。toggle 用なので
 * 必須ではないが、period 集計のため保存する。
 */
export class UpsertJournalFlagDto {
  @IsBoolean()
  resolved!: boolean;

  @IsOptional()
  @IsInt()
  fiscalYear?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;
}
