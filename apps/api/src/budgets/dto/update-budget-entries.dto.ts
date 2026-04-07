import {
  IsArray,
  IsString,
  IsNumber,
  IsOptional,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BudgetEntryDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  accountId: string;

  @IsString()
  @IsOptional()
  departmentId?: string;

  @IsDateString()
  month: string; // "2026-04-01"

  @IsNumber()
  amount: number;
}

export class UpdateBudgetEntriesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetEntryDto)
  entries: BudgetEntryDto[];
}
