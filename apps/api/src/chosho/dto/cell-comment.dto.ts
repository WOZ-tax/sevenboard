import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * 赤セルコメント (chosho_cell_comments) upsert DTO。
 * 1 (row, month) に対して 1 コメント (UNIQUE 制約あり)。PUT で upsert する。
 *
 * anomaly_type は client が送る。理由: コメント発生は赤セルクリック起点で
 * 検知種別がフロントですでに判明している。server で再判定する必要はない。
 * (server でも一致確認はしない。Phase 2 でルール変更が走ったとき過去コメントの
 *  anomaly_type を保持したいため、保存値はクライアント送出を信用する)
 */
export class UpsertCellCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  urls?: string[];

  @IsOptional()
  @IsIn(['EXPECTED_VALUE_VIOLATION', 'AGING_3M'])
  anomalyType?: 'EXPECTED_VALUE_VIOLATION' | 'AGING_3M';
}
