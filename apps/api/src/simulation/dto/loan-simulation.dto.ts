import { IsNumber, IsOptional, IsEnum, Min, Max } from 'class-validator';

enum RepaymentType {
  EQUAL_INSTALLMENT = 'EQUAL_INSTALLMENT',
  EQUAL_PRINCIPAL = 'EQUAL_PRINCIPAL',
  BULLET = 'BULLET',
}

export class LoanSimulationDto {
  @IsNumber()
  @Min(1)
  principal: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  interestRate: number;

  @IsNumber()
  @Min(1)
  @Max(600)
  termMonths: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(120)
  graceMonths?: number;

  @IsEnum(RepaymentType)
  repaymentType: 'EQUAL_INSTALLMENT' | 'EQUAL_PRINCIPAL' | 'BULLET';
}
