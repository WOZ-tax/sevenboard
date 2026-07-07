"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  emptyScheduleRowForm,
  toNumberOrNull,
  yen,
  type ScheduleRowForm,
} from "../_lib/loan-format";

const cellInput =
  "h-8 w-full min-w-0 rounded border border-input bg-background px-2 text-right text-xs tabular-nums";
const cellInputLeft =
  "h-8 w-full min-w-0 rounded border border-input bg-background px-2 text-xs";

/**
 * 編集可能な償還スケジュール表。行の追加/削除/セル修正に対応。
 * rowIssues (seq → メッセージ配列) がある行は赤ハイライト + メッセージを表示。
 */
export function ScheduleEditor({
  rows,
  onChange,
  rowIssues,
}: {
  rows: ScheduleRowForm[];
  onChange: (rows: ScheduleRowForm[]) => void;
  rowIssues?: Map<number, string[]>;
}) {
  const updateRow = (key: string, patch: Partial<ScheduleRowForm>) => {
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const removeRow = (key: string) => {
    onChange(rows.filter((r) => r.key !== key));
  };
  const addRow = () => {
    const maxSeq = rows.reduce(
      (acc, r) => Math.max(acc, toNumberOrNull(r.seq) ?? 0),
      0,
    );
    onChange([...rows, emptyScheduleRowForm(maxSeq + 1)]);
  };

  const totalPrincipal = rows.reduce(
    (acc, r) => acc + (toNumberOrNull(r.principalAmount) ?? 0),
    0,
  );
  const totalInterest = rows.reduce(
    (acc, r) => acc + (toNumberOrNull(r.interestAmount) ?? 0),
    0,
  );

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b text-[11px] text-muted-foreground">
              <th className="w-12 py-1.5 text-right font-medium">回数</th>
              <th className="w-36 py-1.5 text-left font-medium">約定日</th>
              <th className="py-1.5 text-right font-medium">元金</th>
              <th className="py-1.5 text-right font-medium">利息</th>
              <th className="py-1.5 text-right font-medium">元利合計</th>
              <th className="py-1.5 text-right font-medium">残高</th>
              <th className="w-20 py-1.5 text-right font-medium">利率</th>
              <th className="w-16 py-1.5 text-center font-medium">見直し</th>
              <th className="w-10 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  行がありません。「行を追加」または自動生成で作成してください。
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const seqNum = toNumberOrNull(row.seq);
                const issues =
                  seqNum != null ? rowIssues?.get(seqNum) : undefined;
                const hasIssue = !!issues && issues.length > 0;
                return (
                  <tr
                    key={row.key}
                    className={
                      hasIssue
                        ? "border-b bg-destructive/5"
                        : "border-b last:border-b-0"
                    }
                  >
                    <td className="py-1 pr-1 align-top">
                      <Input
                        value={row.seq}
                        onChange={(e) =>
                          updateRow(row.key, { seq: e.target.value })
                        }
                        className={cellInput}
                        inputMode="numeric"
                      />
                    </td>
                    <td className="py-1 pr-1 align-top">
                      <input
                        type="date"
                        value={row.dueDate}
                        onChange={(e) =>
                          updateRow(row.key, { dueDate: e.target.value })
                        }
                        className={cellInputLeft}
                      />
                    </td>
                    <td className="py-1 pr-1 align-top">
                      <Input
                        value={row.principalAmount}
                        onChange={(e) =>
                          updateRow(row.key, {
                            principalAmount: e.target.value,
                          })
                        }
                        className={cellInput}
                        inputMode="numeric"
                      />
                    </td>
                    <td className="py-1 pr-1 align-top">
                      <Input
                        value={row.interestAmount}
                        onChange={(e) =>
                          updateRow(row.key, { interestAmount: e.target.value })
                        }
                        className={cellInput}
                        inputMode="numeric"
                      />
                    </td>
                    <td className="py-1 pr-1 align-top">
                      <Input
                        value={row.totalAmount}
                        onChange={(e) =>
                          updateRow(row.key, { totalAmount: e.target.value })
                        }
                        className={cellInput}
                        inputMode="numeric"
                      />
                    </td>
                    <td className="py-1 pr-1 align-top">
                      <Input
                        value={row.balanceAfter}
                        onChange={(e) =>
                          updateRow(row.key, { balanceAfter: e.target.value })
                        }
                        className={cellInput}
                        inputMode="numeric"
                      />
                    </td>
                    <td className="py-1 pr-1 align-top">
                      <Input
                        value={row.interestRate}
                        onChange={(e) =>
                          updateRow(row.key, { interestRate: e.target.value })
                        }
                        className={cellInput}
                        inputMode="decimal"
                      />
                    </td>
                    <td className="py-1 text-center align-middle">
                      <input
                        type="checkbox"
                        checked={row.isEstimated}
                        onChange={(e) =>
                          updateRow(row.key, { isEstimated: e.target.checked })
                        }
                        aria-label="見直し待ち"
                      />
                    </td>
                    <td className="py-1 text-center align-middle">
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="行を削除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      {hasIssue && (
                        <div className="sr-only">{issues!.join(" / ")}</div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 text-xs font-semibold">
                <td colSpan={2} className="py-1.5 text-right">
                  合計
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {yen(totalPrincipal)}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {yen(totalInterest)}
                </td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* 行ごとの検算メッセージ */}
      {rowIssues && rowIssues.size > 0 && (
        <ul className="space-y-1 text-xs text-destructive">
          {rows.map((row) => {
            const seqNum = toNumberOrNull(row.seq);
            const issues = seqNum != null ? rowIssues.get(seqNum) : undefined;
            if (!issues || issues.length === 0) return null;
            return (
              <li key={`issue-${row.key}`}>
                {seqNum}回目: {issues.join(" / ")}
              </li>
            );
          })}
        </ul>
      )}

      <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addRow}>
        <Plus className="h-4 w-4" />
        行を追加
      </Button>
    </div>
  );
}
