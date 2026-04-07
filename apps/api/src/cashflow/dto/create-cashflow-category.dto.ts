import { IsString, IsEnum, IsBoolean, IsOptional, IsInt } from 'class-validator';

export class CreateCashflowCategoryDto {
  @IsString()
  name: string;

  @IsEnum(['IN', 'OUT'])
  direction: 'IN' | 'OUT';

  @IsEnum(['OPERATING', 'INVESTING', 'FINANCING'])
  cfType: 'OPERATING' | 'INVESTING' | 'FINANCING';

  @IsBoolean()
  @IsOptional()
  isFixed?: boolean = false;

  @IsString()
  @IsOptional()
  recurrenceRule?: string;

  @IsInt()
  @IsOptional()
  displayOrder?: number = 0;
}
