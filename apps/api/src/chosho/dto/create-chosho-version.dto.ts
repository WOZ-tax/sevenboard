import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * POST /organizations/:orgId/chosho/versions の body。
 *
 * IMPORTANT: row 配列はクライアントから受け取らない。
 * server 側で MF 推移表を再取得 → buildChoshoPreviewRows を再実行して snapshot を確定する。
 * これにより client の row 改ざんでマルチテナント越境が起きる経路を消す。
 */
export class CreateChoshoVersionDto {
  @IsInt()
  fiscalYear!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
