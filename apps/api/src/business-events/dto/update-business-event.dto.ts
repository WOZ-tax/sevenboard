import {
  IsString,
  IsOptional,
  IsDateString,
  IsArray,
  IsIn,
} from 'class-validator';
import { EVENT_TYPES } from './create-business-event.dto';

const IMPACT_TAGS = ['sales', 'cost', 'cash', 'headcount'] as const;
type ImpactTag = (typeof IMPACT_TAGS)[number];

export class UpdateBusinessEventDto {
  @IsOptional()
  @IsDateString()
  eventDate?: string;

  @IsOptional()
  @IsString()
  @IsIn(EVENT_TYPES)
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
