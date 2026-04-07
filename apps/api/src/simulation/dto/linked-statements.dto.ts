import { IsNumber, IsOptional, Min } from 'class-validator';

export class LinkedStatementsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  revenueOverride?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cogsOverride?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sgaOverride?: number;
}
