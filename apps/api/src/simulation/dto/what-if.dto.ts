import { IsNumber, IsOptional, Min, Max } from 'class-validator';

export class WhatIfDto {
  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(1000)
  revenueChangePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(500)
  costChangePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  newHires?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  additionalInvestment?: number;
}
