import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * POST /organizations/:orgId/journal-comments の body。
 * journalId は MF v3 仕訳の id (UUID 文字列)。parentCommentId 指定時は返信。
 */
export class AddJournalCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  journalId!: string;

  @IsOptional()
  @IsUUID()
  parentCommentId?: string;

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
