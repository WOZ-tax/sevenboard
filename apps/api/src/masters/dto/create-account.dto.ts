import { IsString, IsBoolean, IsNumber, IsOptional, IsEnum } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

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
  category: string;

  @IsBoolean()
  @IsOptional()
  isVariableCost?: boolean;

  @IsNumber()
  @IsOptional()
  displayOrder?: number;
}
