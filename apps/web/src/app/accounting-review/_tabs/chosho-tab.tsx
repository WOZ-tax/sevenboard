"use client";

/**
 * 残高調書タブ — Phase 1 Unit 2A/2B-1: MF推移表 (BS) を 3 階層 expandable テーブルで表示。
 *
 * このファイルのスコープ:
 *   - useChoshoPreview で API 取得 (DB 書き込みなしの preview)
 *   - 3 階層 (大区分→勘定→補助→取引先) を expandable rows で展開/折りたたみ
 *   - 期首〜選択月: 通常表示 / 選択月以降: outOfRange (淡くグレー)
 *   - Unit 2B-1: 選択月セルの異常検知結果 (anomalies[]) を赤表示 + tooltip
 *
 * 次の Unit 2B-2 以降で追加:
 *   - 行コメント / 赤セルコメント / 期待ルール編集 / 確認済✓
 *   - chosho_versions テーブルへの保存・承認フロー
 */

import { useMemo, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { useChoshoPreview } from "@/hooks/use-chosho-preview";
import type { ChoshoAnomaly, ChoshoPreviewRow } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  orgId: string;
  fiscalYear: number | undefined;
  month: number | undefined;
}

export function ChoshoTab({ orgId, fiscalYear, month }: Props) {
  const query = useChoshoPreview({ orgId, fiscalYear, month });

  if (!orgId || fiscalYear == null || month == null) {
    return (
      <EmptyState
        message="顧問先と対象月を選択してください"
        sub="期間セレクターから fiscalYear / month を指定するとデータが読み込まれます。"
      />
    );
  }

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        MF推移表を取得中…
      </div>
    );
  }

  if (query.isError) {
    return (
      <EmptyState
        message="残高調書の取得に失敗しました"
        sub="MFクラウド会計の接続状態を確認してください。"
      />
    );
  }

  const data = query.data;
  if (!data || data.rows.length === 0) {
    return (
      <EmptyState
        message="表示できる残高がありません"
        sub="MFクラウド会計を接続すると残高調書が表示されます。"
      />
    );
  }

  return <ChoshoTable data={data} />;
}

function ChoshoTable({
  data,
}: {
  data: {
    fiscalYear: number;
    selectedMonth: number;
    fyStartMonth: number;
    monthOrder: number[];
    rows: ChoshoPreviewRow[];
  };
}) {
  // 親 rowKey の Set。closed なら子は描画しない。
  // 初期状態: level 0 (大区分) と level 1 を開く / level 2 以降は閉じる。
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const init = new Set<string>();
    for (const r of data.rows) {
      if (r.hasChildren && r.level <= 1) init.add(r.rowKey);
    }
    return init;
  });

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 描画対象: 親が全て expanded である行だけ通す。
  const visibleRows = useMemo(() => {
    // rowKey → row 引きの map
    const byKey = new Map(data.rows.map((r) => [r.rowKey, r]));
    return data.rows.filter((r) => {
      // 親を辿って 1 つでも閉じていたら hide
      let cur: ChoshoPreviewRow | undefined = r;
      while (cur && cur.parentRowKey) {
        const parent = byKey.get(cur.parentRowKey);
        if (!parent) break;
        if (!expanded.has(parent.rowKey)) return false;
        cur = parent;
      }
      return true;
    });
  }, [data.rows, expanded]);

  // 選択月の column index (monthOrder ベース)。これより後ろの月は outOfRange。
  const selectedIdx = data.monthOrder.indexOf(data.selectedMonth);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div>
          <span className="font-semibold text-[var(--color-text-primary)]">
            残高調書 (BS)
          </span>
          <span className="ml-2">
            {data.fiscalYear}年度 / {data.selectedMonth}月度時点 (期首{data.fyStartMonth}月)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-muted/40" />
            未確定 (選択月以降)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border-l-2 border-red-500 bg-red-50" />
            異常 (0が正/3ヶ月滞留)
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-[var(--color-border)] bg-[var(--color-background)]">
              <th className="sticky left-0 z-10 min-w-[280px] bg-[var(--color-background)] px-3 py-2 text-left font-semibold text-[var(--color-text-primary)]">
                科目
              </th>
              {data.monthOrder.map((m, i) => {
                const outOfRange = selectedIdx >= 0 && i > selectedIdx;
                return (
                  <th
                    key={m}
                    className={cn(
                      "min-w-[96px] px-2 py-2 text-right font-semibold text-[var(--color-text-primary)] tabular-nums",
                      outOfRange && "bg-muted/30 text-muted-foreground/60",
                    )}
                  >
                    {m}月
                  </th>
                );
              })}
              <th className="min-w-[96px] px-2 py-2 text-right font-semibold text-[var(--color-text-primary)] tabular-nums">
                決算整理
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <ChoshoRow
                key={r.rowKey}
                row={r}
                monthOrder={data.monthOrder}
                selectedIdx={selectedIdx}
                isExpanded={expanded.has(r.rowKey)}
                onToggle={() => toggle(r.rowKey)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChoshoRow({
  row,
  monthOrder,
  selectedIdx,
  isExpanded,
  onToggle,
}: {
  row: ChoshoPreviewRow;
  monthOrder: number[];
  selectedIdx: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  // 大区分 (level 0) は太字背景、勘定 (level 1) は通常太字、補助以降 (level 2+) は通常文字。
  const isHeader = row.level === 0;
  const isAccountRow = row.level === 1;

  return (
    <tr
      className={cn(
        "border-b border-muted/50",
        isHeader && "bg-muted/40 font-bold",
        isAccountRow && "font-semibold",
      )}
    >
      <td
        className="sticky left-0 z-10 bg-card px-3 py-1.5 text-left"
        style={{ paddingLeft: `${0.75 + row.level * 1.25}rem` }}
      >
        <div className="flex items-center gap-1">
          {row.hasChildren ? (
            <button
              type="button"
              onClick={onToggle}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-muted/60"
              aria-label={isExpanded ? "折りたたむ" : "展開する"}
            >
              <ChevronRight
                className={cn(
                  "h-3 w-3 transition-transform",
                  isExpanded && "rotate-90",
                )}
              />
            </button>
          ) : (
            <span className="inline-block h-4 w-4 shrink-0" />
          )}
          <span
            className={cn(
              isHeader
                ? "text-[var(--color-text-primary)]"
                : isAccountRow
                  ? "text-[var(--color-text-primary)]"
                  : "text-muted-foreground",
            )}
          >
            {row.name}
          </span>
        </div>
      </td>
      {monthOrder.map((m, i) => {
        const outOfRange = selectedIdx >= 0 && i > selectedIdx;
        const v = row.monthlyBalances[m];
        // 異常は selectedMonth セルにのみ付く (builder 側保証)。
        // anomalies[0].month と m が一致するセルだけ赤表示。
        const cellAnomalies = row.anomalies.filter((a) => a.month === m);
        const hasAnomaly = cellAnomalies.length > 0 && !outOfRange;
        const cellClass = cn(
          "px-2 py-1.5 text-right tabular-nums",
          v != null && v < 0 && "text-[var(--color-negative)]",
          outOfRange && "bg-muted/20 text-muted-foreground/50",
          hasAnomaly && "border-l-2 border-red-500 bg-red-50 font-semibold text-red-700",
        );
        const content = v != null ? formatYen(v) : "";
        if (hasAnomaly) {
          return (
            <td key={m} className={cellClass}>
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  className="cursor-help bg-transparent p-0 text-inherit underline decoration-red-300 decoration-dotted underline-offset-2"
                >
                  {content}
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <AnomalyTooltipBody anomalies={cellAnomalies} />
                </TooltipContent>
              </Tooltip>
            </td>
          );
        }
        return (
          <td key={m} className={cellClass}>
            {content}
          </td>
        );
      })}
      <td className="px-2 py-1.5 text-right tabular-nums">
        {row.settlementBalance != null ? formatYen(row.settlementBalance) : ""}
      </td>
    </tr>
  );
}

function AnomalyTooltipBody({ anomalies }: { anomalies: ChoshoAnomaly[] }) {
  const labelOf = (type: ChoshoAnomaly["type"]): string => {
    if (type === "ZERO_VIOLATION") return "0が正のはずが残高あり";
    if (type === "AGING_3M") return "3ヶ月以上滞留";
    return type;
  };
  return (
    <div className="space-y-1.5 text-xs">
      {anomalies.map((a, i) => (
        <div key={i}>
          <div className="font-semibold text-red-700">{labelOf(a.type)}</div>
          <div className="text-muted-foreground">{a.message}</div>
        </div>
      ))}
    </div>
  );
}

function formatYen(n: number): string {
  return Math.round(n).toLocaleString();
}

function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="rounded-md border border-dashed bg-muted/20 p-8 text-center">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
        {message}
      </h3>
      {sub && (
        <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}
