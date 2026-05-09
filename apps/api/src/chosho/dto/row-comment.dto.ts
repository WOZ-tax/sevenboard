import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * 行コメント (chosho_row_comments) 追加 DTO。
 * 1 行あたり複数コメント可 (1:N)。URL は 0..10 件まで。
 */
export class CreateRowCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  urls?: string[];
}
