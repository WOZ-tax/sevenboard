import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsArray,
  IsIn,
} from 'class-validator';

const IMPACT_TAGS = ['sales', 'cost', 'cash', 'headcount'] as const;
type ImpactTag = (typeof IMPACT_TAGS)[number];

export class CreateBusinessEventDto {
  @IsDateString()
  eventDate: string;

  @IsString()
  @IsNotEmpty()
  eventType: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @IsIn(IMPACT_TAGS, { each: true })
  impactTags?: ImpactTag[];
}
