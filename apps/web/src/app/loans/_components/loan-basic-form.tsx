"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RATE_TYPE_LABELS,
  RATE_TYPE_OPTIONS,
  REPAYMENT_METHOD_LABELS,
  REPAYMENT_METHOD_OPTIONS,
  STATUS_LABELS,
  STATUS_OPTIONS,
  type LoanFormState,
} from "../_lib/loan-format";
import type { LoanRateType, LoanRepaymentMethod, LoanStatus } from "@/lib/api-types";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

export function LoanBasicForm({
  value,
  onChange,
  disabled,
}: {
  value: LoanFormState;
  onChange: (patch: Partial<LoanFormState>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1.5">
        <Label>
          借入先(銀行名) <span className="text-destructive">*</span>
        </Label>
        <Input
          value={value.lenderName}
          disabled={disabled}
          onChange={(e) => onChange({ lenderName: e.target.value })}
          placeholder="〇〇銀行"
        />
      </div>
      <div className="space-y-1.5">
        <Label>支店名</Label>
        <Input
          value={value.branchName}
          disabled={disabled}
          onChange={(e) => onChange({ branchName: e.target.value })}
          placeholder="〇〇支店"
        />
      </div>
      <div className="space-y-1.5">
        <Label>借入種別</Label>
        <Input
          value={value.loanType}
          disabled={disabled}
          onChange={(e) => onChange({ loanType: e.target.value })}
          placeholder="証書貸付 / 手形貸付 等"
        />
      </div>

      <div className="space-y-1.5">
        <Label>
          借入総額(円) <span className="text-destructive">*</span>
        </Label>
        <Input
          type="number"
          inputMode="numeric"
          value={value.principal}
          disabled={disabled}
          onChange={(e) => onChange({ principal: e.target.value })}
          placeholder="10000000"
          className="text-right tabular-nums"
        />
      </div>
      <div className="space-y-1.5">
        <Label>
          利率(年%) <span className="text-destructive">*</span>
        </Label>
        <Input
          type="number"
          step="0.001"
          inputMode="decimal"
          value={value.interestRate}
          disabled={disabled}
          onChange={(e) => onChange({ interestRate: e.target.value })}
          placeholder="1.5"
          className="text-right tabular-nums"
        />
      </div>
      <div className="space-y-1.5">
        <Label>利率区分</Label>
        <select
          className={selectClass}
          value={value.rateType}
          disabled={disabled}
          onChange={(e) => onChange({ rateType: e.target.value as LoanRateType })}
        >
          {RATE_TYPE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {RATE_TYPE_LABELS[opt]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label>
          借入開始日 <span className="text-destructive">*</span>
        </Label>
        <Input
          type="date"
          value={value.startDate}
          disabled={disabled}
          onChange={(e) => onChange({ startDate: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>
          返済期間(月数) <span className="text-destructive">*</span>
        </Label>
        <Input
          type="number"
          inputMode="numeric"
          value={value.termMonths}
          disabled={disabled}
          onChange={(e) => onChange({ termMonths: e.target.value })}
          placeholder="60"
          className="text-right tabular-nums"
        />
      </div>
      <div className="space-y-1.5">
        <Label>返済期日(最終)</Label>
        <Input
          type="date"
          value={value.maturityDate}
          disabled={disabled}
          onChange={(e) => onChange({ maturityDate: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>返済方式</Label>
        <select
          className={selectClass}
          value={value.repaymentMethod}
          disabled={disabled}
          onChange={(e) =>
            onChange({ repaymentMethod: e.target.value as LoanRepaymentMethod })
          }
        >
          {REPAYMENT_METHOD_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {REPAYMENT_METHOD_LABELS[opt]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>状態</Label>
        <select
          className={selectClass}
          value={value.status}
          disabled={disabled}
          onChange={(e) => onChange({ status: e.target.value as LoanStatus })}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {STATUS_LABELS[opt]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
        <Label>Drive リンク URL</Label>
        <Input
          type="url"
          value={value.driveUrl}
          disabled={disabled}
          onChange={(e) => onChange({ driveUrl: e.target.value })}
          placeholder="https://drive.google.com/..."
        />
      </div>
    </div>
  );
}
