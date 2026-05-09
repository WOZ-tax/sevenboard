"use client";

/**
 * 行ルール編集 Dialog (Phase 1 Unit 2B-5b)。
 *
 * 編集可能項目:
 *   - expectedRule: NONE / EXPECTED_VALUE / AGING_3M
 *   - expectedValue: 数値 (EXPECTED_VALUE のときだけ有効)
 *   - agingCheckEnabled: 滞留チェックの ON/OFF (expectedRule とは独立)
 *
 * ガード:
 *   - editable=false (APPROVED) のときは閲覧のみ + 「承認済のため編集できません」
 *   - API 側でも DRAFT 以外は 409 ConflictException で拒否される
 */

import { useEffect, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ChoshoExpectedRuleValue } from "@/lib/api";
import { cn } from "@/lib/utils";

interface RowRuleState {
  expectedRule: ChoshoExpectedRuleValue;
  expectedValue: number | null;
  agingCheckEnabled: boolean;
}

export function RuleEditDialog({
  open,
  onOpenChange,
  rowName,
  initial,
  onSave,
  isSaving,
  editable,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rowName: string;
  initial: RowRuleState;
  onSave: (rule: RowRuleState) => void;
  isSaving: boolean;
  /** false = 閲覧のみ (APPROVED 時) */
  editable: boolean;
}) {
  const [rule, setRule] = useState<ChoshoExpectedRuleValue>(initial.expectedRule);
  const [valueInput, setValueInput] = useState<string>(
    initial.expectedValue == null ? "" : String(initial.expectedValue),
  );
  const [aging, setAging] = useState<boolean>(initial.agingCheckEnabled);

  useEffect(() => {
    if (open) {
      setRule(initial.expectedRule);
      setValueInput(initial.expectedValue == null ? "" : String(initial.expectedValue));
      setAging(initial.agingCheckEnabled);
    }
  }, [open, initial.expectedRule, initial.expectedValue, initial.agingCheckEnabled]);

  const handleSubmit = () => {
    const num = valueInput === "" ? null : Number(valueInput.replace(/,/g, ""));
    if (rule === "EXPECTED_VALUE" && (num == null || !Number.isFinite(num))) {
      // EXPECTED_VALUE で値が空 = 期待残高未設定。null で送信 (検知スキップ)
      onSave({ expectedRule: rule, expectedValue: null, agingCheckEnabled: aging });
      return;
    }
    onSave({
      expectedRule: rule,
      expectedValue: rule === "EXPECTED_VALUE" ? num : null,
      agingCheckEnabled: aging,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            {rowName}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            この行の期待残高ルールと滞留チェックを設定します
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 期待残高ルール */}
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold text-muted-foreground">
              期待残高ルール
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <RuleButton
                selected={rule === "NONE"}
                onClick={() => editable && setRule("NONE")}
                disabled={!editable}
                label="チェックなし"
                sub="—"
              />
              <RuleButton
                selected={rule === "EXPECTED_VALUE"}
                onClick={() => editable && setRule("EXPECTED_VALUE")}
                disabled={!editable}
                label="期待残高"
                sub="任意の数値"
              />
              <RuleButton
                selected={rule === "AGING_3M"}
                onClick={() => editable && setRule("AGING_3M")}
                disabled={!editable}
                label="滞留チェック強制"
                sub="3ヶ月同額"
              />
            </div>
          </div>

          {/* 期待残高値 (EXPECTED_VALUE 時のみ) */}
          {rule === "EXPECTED_VALUE" && (
            <div className="space-y-1.5 rounded border bg-muted/20 p-2.5">
              <label className="block text-[11px] font-semibold text-muted-foreground">
                期待残高 (円)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={valueInput}
                onChange={(e) => editable && setValueInput(e.target.value.replace(/[^\d-]/g, ""))}
                placeholder="例: 0 / 300000 / 165000"
                disabled={!editable}
                className="w-full rounded border px-2 py-1.5 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] disabled:bg-muted"
              />
              <p className="text-[10px] text-muted-foreground">
                空欄 = 未設定 (検知スキップ)。選択月の残高がこの値と一致しないと「期待残高ズレ」を発火。
              </p>
            </div>
          )}

          {/* 滞留チェック */}
          <div className="flex items-center justify-between rounded border bg-muted/20 p-2.5">
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground">
                3ヶ月以上滞留チェック
              </div>
              <div className="text-[10px] text-muted-foreground">
                対象月含む直近3ヶ月の残高が同額・非ゼロなら検知
              </div>
            </div>
            <button
              type="button"
              onClick={() => editable && setAging((v) => !v)}
              disabled={!editable}
              className={cn(
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                aging ? "bg-[var(--color-primary)]" : "bg-muted",
                !editable && "cursor-not-allowed opacity-60",
              )}
              aria-pressed={aging}
            >
              <span
                className={cn(
                  "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                  aging ? "translate-x-5" : "translate-x-0.5",
                )}
              />
            </button>
          </div>

          {!editable && (
            <p className="text-[10px] italic text-muted-foreground">
              この調書は承認済のため、ルールは編集できません
            </p>
          )}
        </div>

        <DialogFooter className="gap-1.5">
          <DialogClose render={<Button variant="ghost" size="sm" className="h-7 text-xs">閉じる</Button>} />
          {editable && (
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSubmit}
              disabled={isSaving}
            >
              {isSaving ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
              保存
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleButton({
  selected,
  onClick,
  disabled,
  label,
  sub,
}: {
  selected: boolean;
  onClick: () => void;
  disabled: boolean;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded border px-2 py-1.5 text-left transition-colors",
        selected
          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
          : "border-input bg-card hover:bg-muted/40",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <div
        className={cn(
          "text-[11px] font-semibold",
          selected ? "text-[var(--color-primary)]" : "text-foreground",
        )}
      >
        {label}
      </div>
      <div className="text-[9px] text-muted-foreground">{sub}</div>
    </button>
  );
}
