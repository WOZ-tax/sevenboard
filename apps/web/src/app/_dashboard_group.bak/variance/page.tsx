"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { varianceData } from "@/lib/mock-data";
import { formatPercent, getValueColor } from "@/lib/format";

export default function VariancePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-navy)]">
          予実分析
        </h1>
        <p className="text-sm text-muted-foreground">
          2026年3月度 予算実績対比表
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-[var(--color-navy)]">
            損益計算書 予実対比（単位: 万円）
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[var(--color-navy)]">
                  <TableHead className="text-white font-semibold w-48">
                    科目
                  </TableHead>
                  <TableHead className="text-white font-semibold text-right w-28">
                    予算
                  </TableHead>
                  <TableHead className="text-white font-semibold text-right w-28">
                    実績
                  </TableHead>
                  <TableHead className="text-white font-semibold text-right w-28">
                    差異
                  </TableHead>
                  <TableHead className="text-white font-semibold text-right w-28">
                    達成率
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {varianceData.map((row, index) => {
                  const isSubItem = row.category.startsWith("  ");
                  const isTotal =
                    row.category === "売上総利益" ||
                    row.category === "営業利益" ||
                    row.category === "経常利益";

                  return (
                    <TableRow
                      key={index}
                      className={cn(isTotal && "bg-muted/50 font-semibold")}
                    >
                      <TableCell
                        className={cn(
                          "text-sm",
                          isSubItem && "text-muted-foreground",
                          isTotal && "font-bold text-[var(--color-navy)]"
                        )}
                      >
                        {row.category}
                      </TableCell>
                      <TableCell className="text-right font-[family-name:var(--font-inter)] text-sm tabular-nums">
                        ¥{row.budget.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-[family-name:var(--font-inter)] text-sm tabular-nums">
                        ¥{row.actual.toLocaleString()}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-[family-name:var(--font-inter)] text-sm tabular-nums",
                          getValueColor(row.variance)
                        )}
                      >
                        {row.variance > 0 ? "+" : ""}
                        ¥{row.variance.toLocaleString()}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-[family-name:var(--font-inter)] text-sm tabular-nums",
                          getValueColor(row.ratio)
                        )}
                      >
                        {formatPercent(row.ratio)}
                      </TableCell>
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
