import { IsString, IsNotEmpty, IsOptional, IsIn, IsDateString } from 'class-validator';

export class CreateCalendarEventDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  @IsIn(['deadline', 'meeting', 'task'])
  type?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
