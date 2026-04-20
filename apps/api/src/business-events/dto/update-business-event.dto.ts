import {
  IsString,
  IsOptional,
  IsDateString,
  IsArray,
  IsIn,
} from 'class-validator';

const IMPACT_TAGS = ['sales', 'cost', 'cash', 'headcount'] as const;
type ImpactTag = (typeof IMPACT_TAGS)[number];

export class UpdateBusinessEventDto {
  @IsOptional()
  @IsDateString()
  eventDate?: string;

  @IsOptional()
  @IsString()
  eventType?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @IsIn(IMPACT_TAGS, { each: true })
  impactTags?: ImpactTag[];
}
