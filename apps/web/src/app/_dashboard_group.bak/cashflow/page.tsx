"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CashflowTable } from "@/components/cashflow/cashflow-table";

export default function CashflowPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-navy)]">
          資金繰り表
        </h1>
        <p className="text-sm text-muted-foreground">
          2026年1月〜6月 月次資金繰り（単位: 万円）
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-[var(--color-navy)]">
            月次資金繰り表
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CashflowTable />
        </CardContent>
      </Card>
    </div>
  );
}
