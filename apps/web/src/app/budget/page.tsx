"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { fiscalMonths } from "@/lib/fiscal-months";
import { useFeatureState, useFeatureStateMutation } from "@/hooks/use-year-end-state";
import { toast } from "sonner";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatYen } from "@/lib/format";
import { MfEmptyState } from "@/components/ui/mf-empty-state";
import {
  useBudgetContext,
  useNormalizedBudgetRows,
  useUpdateBudgetEntries,
} from "@/hooks/use-business-data";
import type { BudgetEntry } from "@/lib/api-types";
import { Badge } from "@/components/ui/badge";
import { Save, Loader2, Check } from "lucide-react";

type BudgetStatus = "DRAFT" | "PENDING" | "APPROVED" | "LOCKED";

const statusConfig: Record<
  BudgetStatus,
  { label: string; badgeClass: string }
> = {
  DRAFT: {
    label: "下書き",
    badgeClass: "bg-gray-200 text-gray-700 border-gray-300",
  },
  PENDING: {
    label: "確認依頼中",
    badgeClass: "bg-yellow-100 text-yellow-800 border-yellow-300",
  },
  APPROVED: {
    label: "承認済み",
    badgeClass: "bg-green-100 text-green-800 border-green-300",
  },
  LOCKED: {
    label: "確定",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-300",
  },
};

type MonthKey = "apr" | "may" | "jun" | "jul" | "aug" | "sep" | "oct" | "nov" | "dec" | "jan" | "feb" | "mar";
type BudgetUiRow = {
  id: string;
  category: string;
  accountId?: string;
  apr: number;
  may: number;
  jun: number;
  jul: number;
  aug: number;
  sep: number;
  oct: number;
  nov: number;
  dec: number;
  jan: number;
  feb: number;
  mar: number;
  sourceEntries?: BudgetEntry[];
};

export default function BudgetPage() {
  const { activeFiscalYear, activeBudgetVersion, budgetEntriesQuery } =
    useBudgetContext();
  const apiRows = useNormalizedBudgetRows(budgetEntriesQuery.data);
  const [data, setData] = useState<BudgetUiRow[]>([]);
  const workflow = useFeatureState<{ status: BudgetStatus }>("budget.workflow", activeBudgetVersion?.id ?? "");
  const workflowMutation = useFeatureStateMutation<{ status: BudgetStatus }>("budget.workflow", activeBudgetVersion?.id ?? "");
  const rawStatus = workflow.data?.value?.status;
  const budgetStatus: BudgetStatus = rawStatus && rawStatus in statusConfig ? rawStatus : "DRAFT";
  const isLocked = budgetStatus === "LOCKED" || workflow.isLoading || workflow.isError;
  const months = useMemo(() => fiscalMonths(activeFiscalYear?.startDate, activeFiscalYear?.endDate), [activeFiscalYear]);
  const monthOrder = months.map(m => m.key);

  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    month: MonthKey;
  } | null>(null);
  const [originalValue, setOriginalValue] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSaveRef = useRef<(() => Promise<void>) | null>(null);
  const editRevisionRef = useRef(0);
  const updateMutation = useUpdateBudgetEntries(activeBudgetVersion?.id ?? null);

  const isTotal = (): boolean => false;

  const getNextMonth = (m: MonthKey): MonthKey | null =>
    monthOrder[monthOrder.indexOf(m) + 1] || null;
  const getPrevMonth = (m: MonthKey): MonthKey | null =>
    monthOrder[monthOrder.indexOf(m) - 1] || null;
  const getNextEditableRow = useCallback(
    (currentId: string, direction: number): string | null => {
      const editableRows = data.filter(() => !isTotal());
      const idx = editableRows.findIndex((r) => r.id === currentId);
      return editableRows[idx + direction]?.id || null;
    },
    [data]
  );

  const seededVersionIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentId = activeBudgetVersion?.id ?? null;
    if (currentId !== seededVersionIdRef.current) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (apiRows.length > 0 || !budgetEntriesQuery.isPending) seededVersionIdRef.current = currentId;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Seed local editable rows when the budget version changes; local edits are preserved across refetches of the same version.
      setData(apiRows);
      setEditingCell(null);
      setSaveStatus("idle");
    }
  }, [apiRows, activeBudgetVersion, budgetEntriesQuery.isPending]);
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  const startEditing = (rowId: string, month: MonthKey) => {
    const row = data.find((r) => r.id === rowId);
    if (row) setOriginalValue(row[month]);
    setEditingCell({ rowId, month });
  };

  const handleCellClick = (rowId: string, month: MonthKey) => {
    if (isLocked) return;
    startEditing(rowId, month);
  };

  const handleStatusTransition = async (next: BudgetStatus, message: string) => {
    if (window.confirm(message)) {
      try {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        if (saveStatus === "dirty") await latestSaveRef.current?.();
        await workflowMutation.mutateAsync({ status: next });
      } catch { toast.error("予算の状態を保存できませんでした。"); }
    }
  };

  const buildPayload = useCallback(() => {
    if (!activeBudgetVersion || !activeFiscalYear || seededVersionIdRef.current !== activeBudgetVersion.id) return null;

    return data.flatMap((row) =>
      months.map((month) => {
        const existing = row.sourceEntries?.find(
          (entry) => entry.month.slice(0, 10) === month.date,
        );

        return {
          id: existing?.id,
          accountId: row.accountId ?? row.id,
          departmentId: existing?.departmentId ?? undefined,
          month: month.date,
          amount: Number(row[month.key]),
        };
      })
    );
  }, [data, activeBudgetVersion, activeFiscalYear, months]);

  const executeSave = useCallback(async () => {
    const payload = buildPayload();
    if (!payload || !activeBudgetVersion || isLocked) return;

    const editRevision = editRevisionRef.current;
    setSaveStatus("saving");
    try {
      await updateMutation.mutateAsync(payload);
      setSaveStatus(editRevision === editRevisionRef.current ? "saved" : "dirty");
    } catch (error) {
      setSaveStatus("dirty");
      toast.error("予算を保存できませんでした。再度保存してください。");
      throw error;
    }
  }, [buildPayload, activeBudgetVersion, updateMutation, isLocked]);
  useEffect(() => { latestSaveRef.current = executeSave; }, [executeSave]);

  const handleCellChange = useCallback(
    (rowId: string, month: MonthKey, value: string) => {
      const numValue = parseInt(value.replace(/[^0-9-]/g, ""), 10);
      if (Number.isNaN(numValue)) return;
      editRevisionRef.current += 1;

      setData((prev) =>
        prev.map((row) =>
          row.id === rowId ? { ...row, [month]: numValue } : row
        )
      );

      setSaveStatus("dirty");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void latestSaveRef.current?.().catch(() => {});
      }, 2000);
    },
    []
  );

  const handleCellRevert = useCallback(
    (rowId: string, month: MonthKey) => {
      if (originalValue !== null) {
        setData((prev) =>
          prev.map((row) =>
            row.id === rowId ? { ...row, [month]: originalValue } : row
          )
        );
      }
    },
    [originalValue]
  );

  const commitAndMove = (
    inputEl: HTMLInputElement,
    rowId: string,
    month: MonthKey,
    nextRowId: string | null,
    nextMonth: MonthKey | null
  ) => {
    handleCellChange(rowId, month, inputEl.value);
    setEditingCell(null);
    if (nextRowId !== null && nextMonth !== null) {
      // Use setTimeout to let state settle before starting new edit
      setTimeout(() => startEditing(nextRowId, nextMonth), 0);
    } else if (nextRowId !== null) {
      setTimeout(() => startEditing(nextRowId, month), 0);
    } else if (nextMonth !== null) {
      setTimeout(() => startEditing(rowId, nextMonth), 0);
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowId: string,
    month: MonthKey
  ) => {
    const input = e.currentTarget;

    if (e.key === "Enter") {
      e.preventDefault();
      const nextRow = getNextEditableRow(rowId, 1);
      commitAndMove(input, rowId, month, nextRow, null);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const nextMonth = e.shiftKey ? getPrevMonth(month) : getNextMonth(month);
      if (nextMonth) {
        commitAndMove(input, rowId, month, null, nextMonth);
      } else {
        handleCellChange(rowId, month, input.value);
        setEditingCell(null);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCellRevert(rowId, month);
      setEditingCell(null);
    }
  };

  const handleSave = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    void latestSaveRef.current?.().catch(() => {});
  };

  return (
    <DashboardShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
              予算策定
            </h1>
            <p className="text-sm text-muted-foreground">
              {activeFiscalYear
                ? `${activeFiscalYear.year}年度 月次予算計画`
                : "月次予算計画"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={cn("text-xs", statusConfig[budgetStatus].badgeClass)}>
              {statusConfig[budgetStatus].label}
            </Badge>

            {workflow.isError && <span role="alert">予算の状態を読み込めませんでした。</span>}
            <fieldset disabled={!activeBudgetVersion || workflow.isLoading || workflow.isError || workflowMutation.isPending || updateMutation.isPending} className="flex items-center gap-2">
            {budgetStatus === "DRAFT" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleStatusTransition("PENDING", "この予算を確認待ちにしますか？")
                }
              >
                確認待ちにする
              </Button>
            )}
            {budgetStatus === "PENDING" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleStatusTransition("APPROVED", "この予算を承認しますか？")
                  }
                >
                  承認
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleStatusTransition("DRAFT", "下書きに差戻しますか？")
                  }
                >
                  差戻し
                </Button>
              </>
            )}
            {budgetStatus === "APPROVED" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleStatusTransition("LOCKED", "予算を確定しますか？確定後は編集できなくなります。")
                }
              >
                確定
              </Button>
            )}
            {budgetStatus === "LOCKED" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleStatusTransition("DRAFT", "この予算の確定を解除して、編集を再開しますか？")
                }
              >
                確定を解除
              </Button>
            )}
            </fieldset>

            {saveStatus === "dirty" && (
              <span className="text-sm text-yellow-600">未保存の変更あり</span>
            )}
            {saveStatus === "saving" && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                保存中...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1 text-sm text-green-600 transition-opacity duration-500">
                <Check className="h-3.5 w-3.5" />
                保存済み
              </span>
            )}
            <Button
              className="gap-2 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
              onClick={handleSave}
              disabled={!activeBudgetVersion || updateMutation.isPending || saveStatus === "saving" || isLocked}
            >
              <Save className="h-4 w-4" />
              保存
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
              損益予算表（セルをクリックして編集 / Enter:下へ / Tab:右へ / Esc:キャンセル）
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.length === 0 ? (
              <MfEmptyState title="予算データがありません" description="会計年度と予算バージョンを作成すると、ここで月次予算を入力できます。" />
            ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[var(--color-background)] border-b-2 border-[var(--color-border)]">
                    <TableHead className="sticky left-0 z-20 w-44 min-w-[11rem] bg-[var(--color-background)] font-semibold text-[var(--color-text-primary)]">
                      勘定科目
                    </TableHead>
                    {months.map((m) => (
                      <TableHead
                        key={m.key}
                        className="w-28 text-right font-semibold text-[var(--color-text-primary)]"
                      >
                        {m.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row) => {
                    const total = isTotal();

                    return (
                      <TableRow
                        key={row.id}
                        className={cn(total && "bg-muted/50 font-semibold")}
                      >
                        <TableCell
                          className={cn(
                            "sticky left-0 z-10 min-w-[11rem] bg-[var(--color-surface)] text-sm",
                            row.category.startsWith("  ") &&
                              "text-muted-foreground",
                            total && "bg-muted/50 font-bold text-[var(--color-text-primary)]"
                          )}
                        >
                          {row.category}
                        </TableCell>
                        {months.map((m) => {
                          const isEditing =
                            editingCell?.rowId === row.id &&
                            editingCell?.month === m.key;
                          const value = row[m.key];

                          return (
                            <TableCell
                              key={m.key}
                              className={cn(
                                "p-0 text-right font-[family-name:var(--font-inter)] text-sm tabular-nums",
                                !total && !isLocked &&
                                  "cursor-pointer hover:bg-[var(--color-tertiary)]/10",
                                !total && isLocked && "cursor-default"
                              )}
                              onClick={() => handleCellClick(row.id, m.key)}
                            >
                              {isEditing ? (
                                <input
                                  type="text"
                                  defaultValue={value.toString()}
                                  autoFocus
                                  className="h-full w-full border-2 border-[var(--color-tertiary)] bg-[var(--color-tertiary)]/5 px-3 py-2 text-right text-sm font-[family-name:var(--font-inter)] outline-none"
                                  onBlur={(e) => {
                                    // Only commit on blur if not already handled by keyboard
                                    if (editingCell) {
                                      handleCellChange(
                                        row.id,
                                        m.key,
                                        e.target.value
                                      );
                                      setEditingCell(null);
                                    }
                                  }}
                                  onKeyDown={(e) =>
                                    handleKeyDown(e, row.id, m.key)
                                  }
                                />
                              ) : (
                                <div className="px-3 py-2">
                                  {formatYen(value)}
                                </div>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
