"use client";

import { useState, useCallback } from "react";
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
import { budgetData as initialBudgetData } from "@/lib/mock-data";
import { Save } from "lucide-react";

type MonthKey = "apr" | "may" | "jun" | "jul" | "aug" | "sep";

const months: { key: MonthKey; label: string }[] = [
  { key: "apr", label: "4月" },
  { key: "may", label: "5月" },
  { key: "jun", label: "6月" },
  { key: "jul", label: "7月" },
  { key: "aug", label: "8月" },
  { key: "sep", label: "9月" },
];

export default function BudgetPage() {
  const [data, setData] = useState(initialBudgetData);
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    month: MonthKey;
  } | null>(null);

  const isTotal = (category: string) =>
    category === "売上総利益" || category === "営業利益";

  const handleCellClick = (
    rowId: string,
    month: MonthKey,
    category: string
  ) => {
    if (isTotal(category)) return;
    setEditingCell({ rowId, month });
  };

  const handleCellChange = useCallback(
    (rowId: string, month: MonthKey, value: string) => {
      const numValue = parseInt(value.replace(/[^0-9-]/g, ""), 10);
      if (isNaN(numValue)) return;

      setData((prev) =>
        prev.map((row) =>
          row.id === rowId ? { ...row, [month]: numValue } : row
        )
      );
    },
    []
  );

  const handleBlur = () => {
    setEditingCell(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "Escape") {
      setEditingCell(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-navy)]">
            予算入力
          </h1>
          <p className="text-sm text-muted-foreground">
            2026年度 月次予算（単位: 万円）
          </p>
        </div>
        <Button className="bg-[var(--color-navy)] hover:bg-[var(--color-navy-light)] text-white gap-2">
          <Save className="h-4 w-4" />
          保存
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-[var(--color-navy)]">
            損益予算（セルをクリックして編集）
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[var(--color-navy)]">
                  <TableHead className="text-white font-semibold w-44">
                    科目
                  </TableHead>
                  {months.map((m) => (
                    <TableHead
                      key={m.key}
                      className="text-white font-semibold text-right w-28"
                    >
                      {m.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => {
                  const total = isTotal(row.category);
                  return (
                    <TableRow
                      key={row.id}
                      className={cn(total && "bg-muted/50 font-semibold")}
                    >
                      <TableCell
                        className={cn(
                          "text-sm",
                          row.category.startsWith("  ") &&
                            "text-muted-foreground",
                          total && "font-bold text-[var(--color-navy)]"
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
                              "text-right font-[family-name:var(--font-inter)] text-sm tabular-nums p-0",
                              !total &&
                                "cursor-pointer hover:bg-[var(--color-gold)]/10"
                            )}
                            onClick={() =>
                              handleCellClick(row.id, m.key, row.category)
                            }
                          >
                            {isEditing ? (
                              <input
                                type="text"
                                defaultValue={value.toString()}
                                autoFocus
                                className="w-full h-full text-right px-3 py-2 text-sm font-[family-name:var(--font-inter)] border-2 border-[var(--color-gold)] outline-none bg-[var(--color-gold)]/5"
                                onBlur={(e) => {
                                  handleCellChange(
                                    row.id,
                                    m.key,
                                    e.target.value
                                  );
                                  handleBlur();
                                }}
                                onKeyDown={handleKeyDown}
                              />
                            ) : (
                              <div className="px-3 py-2">
                                ¥{value.toLocaleString()}
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
        </CardContent>
      </Card>
    </div>
  );
}
