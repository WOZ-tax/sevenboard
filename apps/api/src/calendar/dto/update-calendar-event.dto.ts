import { IsString, IsOptional, IsIn, IsDateString } from 'class-validator';

export class UpdateCalendarEventDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @IsIn(['deadline', 'meeting', 'task'])
  type?: string;

  @IsOptional()
  @IsString()
  @IsIn(['upcoming', 'completed', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
