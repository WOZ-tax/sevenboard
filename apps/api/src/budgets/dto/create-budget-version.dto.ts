import { IsString, IsEnum, IsOptional } from 'class-validator';

export class CreateBudgetVersionDto {
  @IsString()
  name: string;

  @IsEnum(['BASE', 'UPSIDE', 'DOWNSIDE'])
  @IsOptional()
  scenarioType?: 'BASE' | 'UPSIDE' | 'DOWNSIDE' = 'BASE';
}
