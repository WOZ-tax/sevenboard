import { IsString, IsBoolean, IsNumber, IsOptional, IsEnum } from 'class-validator';

export class UpdateAccountDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum([
    'REVENUE',
    'COST_OF_SALES',
    'SELLING_EXPENSE',
    'ADMIN_EXPENSE',
    'NON_OPERATING_INCOME',
    'NON_OPERATING_EXPENSE',
    'EXTRAORDINARY_INCOME',
    'EXTRAORDINARY_EXPENSE',
    'ASSET',
    'LIABILITY',
    'EQUITY',
  ])
  @IsOptional()
  category?: string;

  @IsBoolean()
  @IsOptional()
  isVariableCost?: boolean;

  @IsNumber()
  @IsOptional()
  displayOrder?: number;
}
