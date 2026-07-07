import type {
  LoanRateType,
  LoanRepaymentMethod,
  LoanStatus,
} from '@prisma/client';
import type { ValidationReport, LoanDraft } from './loan-schedule-validator';

/** 一覧行。金額は number(円) で返す（BigInt はシリアライズできないため境界で変換する）。 */
export interface LoanSummaryDto {
  id: string;
  lenderName: string;
  branchName: string | null;
  loanType: string | null;
  principal: number;
  /** 当月適用利率(%)。当月スケジュール行の interestRate ?? Loan.interestRate */
  interestRate: number | null;
  rateType: LoanRateType;
  startDate: string | null;
  termMonths: number | null;
  maturityDate: string | null;
  repaymentMethod: LoanRepaymentMethod;
  status: LoanStatus;
  /** 当月末残高 */
  currentBalance: number;
  nextDueDate: string | null;
  nextPaymentAmount: number | null;
  driveUrl: string | null;
}

export interface LoanTotalsDto {
  outstandingBalance: number;
  monthlyPayment: number;
  monthlyPrincipal: number;
  monthlyInterest: number;
  annualInterestEstimate: number;
}

export interface MfBookBalanceDto {
  amount: number | null;
  accounts: { name: string; amount: number }[];
  diff: number | null;
}

export interface LoansListDto {
  loans: LoanSummaryDto[];
  totals: LoanTotalsDto;
  mfBookBalance: MfBookBalanceDto;
}

export interface LoanScheduleEntryDto {
  id: string;
  seq: number;
  dueDate: string;
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
  balanceAfter: number;
  interestRate: number | null;
  isEstimated: boolean;
}

export interface LoanDocumentDto {
  id: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

export interface LoanDetailDto {
  id: string;
  lenderName: string;
  branchName: string | null;
  loanNumber: string | null;
  loanType: string | null;
  principal: number;
  interestRate: number | null;
  rateType: LoanRateType;
  startDate: string | null;
  termMonths: number | null;
  maturityDate: string | null;
  repaymentMethod: LoanRepaymentMethod;
  repaymentAccount: string | null;
  driveUrl: string | null;
  memo: string | null;
  status: LoanStatus;
  createdAt: string;
  updatedAt: string;
  scheduleEntries: LoanScheduleEntryDto[];
  documents: LoanDocumentDto[];
}

export interface LoanExtractResultDto {
  documentId: string;
  draft: LoanDraft | null;
  validation: ValidationReport | null;
}
