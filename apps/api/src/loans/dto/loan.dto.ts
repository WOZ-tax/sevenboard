import {
  LoanRateType,
  LoanRepaymentMethod,
  LoanStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class LoanScheduleEntryInput {
  @IsInt()
  seq!: number;

  @Matches(DATE_RE, { message: 'dueDate must be YYYY-MM-DD' })
  dueDate!: string;

  @IsInt()
  principalAmount!: number;

  @IsInt()
  interestAmount!: number;

  @IsInt()
  totalAmount!: number;

  @IsInt()
  balanceAfter!: number;

  @IsOptional()
  @IsNumber()
  interestRate?: number | null;

  @IsOptional()
  @IsBoolean()
  isEstimated?: boolean;
}

export class CreateLoanDto {
  @IsString()
  @IsNotEmpty()
  lenderName!: string;

  @IsOptional()
  @IsString()
  branchName?: string;

  @IsOptional()
  @IsString()
  loanNumber?: string;

  @IsOptional()
  @IsString()
  loanType?: string;

  @IsInt()
  @Min(1, { message: 'principal must be greater than 0' })
  principal!: number;

  @IsOptional()
  @IsNumber()
  interestRate?: number | null;

  @IsOptional()
  @IsEnum(LoanRateType)
  rateType?: LoanRateType;

  @IsOptional()
  @Matches(DATE_RE, { message: 'startDate must be YYYY-MM-DD' })
  startDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  termMonths?: number;

  @IsOptional()
  @Matches(DATE_RE, { message: 'maturityDate must be YYYY-MM-DD' })
  maturityDate?: string;

  @IsOptional()
  @IsEnum(LoanRepaymentMethod)
  repaymentMethod?: LoanRepaymentMethod;

  @IsOptional()
  @IsString()
  repaymentAccount?: string;

  @IsOptional()
  @IsString()
  driveUrl?: string;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsOptional()
  @IsEnum(LoanStatus)
  status?: LoanStatus;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => LoanScheduleEntryInput)
  scheduleEntries?: LoanScheduleEntryInput[];

  /** アップロード済み LoanDocument の紐付け（/extract で先に作られたもの） */
  @IsOptional()
  @IsUUID()
  documentId?: string;
}

/** 基本情報のみ更新（スケジュールは PUT /:loanId/schedule で置換）。 */
export class UpdateLoanDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lenderName?: string;

  @IsOptional()
  @IsString()
  branchName?: string;

  @IsOptional()
  @IsString()
  loanNumber?: string;

  @IsOptional()
  @IsString()
  loanType?: string;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'principal must be greater than 0' })
  principal?: number;

  @IsOptional()
  @IsNumber()
  interestRate?: number | null;

  @IsOptional()
  @IsEnum(LoanRateType)
  rateType?: LoanRateType;

  @IsOptional()
  @Matches(DATE_RE, { message: 'startDate must be YYYY-MM-DD' })
  startDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  termMonths?: number;

  @IsOptional()
  @Matches(DATE_RE, { message: 'maturityDate must be YYYY-MM-DD' })
  maturityDate?: string;

  @IsOptional()
  @IsEnum(LoanRepaymentMethod)
  repaymentMethod?: LoanRepaymentMethod;

  @IsOptional()
  @IsString()
  repaymentAccount?: string;

  @IsOptional()
  @IsString()
  driveUrl?: string;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsOptional()
  @IsEnum(LoanStatus)
  status?: LoanStatus;
}

export class ReplaceScheduleDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => LoanScheduleEntryInput)
  entries!: LoanScheduleEntryInput[];
}
