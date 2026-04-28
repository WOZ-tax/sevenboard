"use client";

import { useMemo } from "react";
import { Lock, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePeriodStore } from "@/lib/period-store";
import { useMfOffice } from "@/hooks/use-mf-data";

interface PeriodSegmentControlProps {
  /** 「全期間」ボタンを出すか */
  showAllPeriod?: boolean;
  /** 期首〜選択月の範囲を薄色で塗るか */
  highlightRange?: boolean;
  /** 上部に出すラベル。空文字で非表示 */
  label?: string;
  /** ロック切替ボタンを表示するか（デフォルト true） */
  showLockToggle?: boolean;
  className?: string;
}

/**
 * 会計期首月から 12 ヶ月 + 全期間 を選べるセグメントコントロール。
 * MF会計期間（office.accounting_periods）から期首月を動的取得する。
 */
export function PeriodSegmentControl({
  showAllPeriod = true,
  highlightRange = true,
  label = "表示期間（期首から選択月までの累計）",
  showLockToggle = true,
  className,
}: PeriodSegmentControlProps) {
  const fiscalYear = usePeriodStore((s) => s.fiscalYear);
  const month = usePeriodStore((s) => s.month);
  const setPeriod = usePeriodStore((s) => s.setPeriod);
  const locked = usePeriodStore((s) => s.locked);
  const setLocked = usePeriodStore((s) => s.setLocked);
  const office = useMfOffice();

  const fyStartMonth = useFyStartMonth();
  const isAllPeriod = month === undefined;

  const monthSequence = useMemo(() => {
    const seq: number[] = [];
    for (let i = 0; i < 12; i++) {
      seq.push(((fyStartMonth - 1 + i) % 12) + 1);
    }
    return seq;
  }, [fyStartMonth]);

  if (!office.data) {
    return null;
  }

  return (
    <div className={cn("screen-only space-y-1.5", className)}>
      {label && (
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
      )}
      <div className="inline-flex items-stretch gap-2">
      <div className="inline-flex overflow-hidden rounded-md border border-input">
        {monthSequence.map((m, idx) => {
          const endIdx =
            !isAllPeriod && month ? monthSequence.indexOf(month) : -1;
          const inRange =
            highlightRange && (isAllPeriod || (endIdx >= 0 && idx <= endIdx));
          const isEnd = !isAllPeriod && m === month;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setPeriod(fiscalYear, m)}
              className={cn(
                "h-9 w-11 border-r border-input text-sm font-medium transition-colors last:border-r-0",
                isEnd && "bg-[var(--color-primary)] text-white font-bold",
                inRange &&
                  !isEnd &&
                  "bg-[var(--color-primary)]/15 text-[var(--color-primary)]",
                !inRange &&
                  !isEnd &&
                  "bg-background text-[var(--color-text-primary)] hover:bg-muted",
              )}
            >
              {m}
            </button>
          );
        })}
        {showAllPeriod && (
          <button
            type="button"
            onClick={() => setPeriod(fiscalYear, undefined)}
            className={cn(
              "h-9 border-l border-input px-4 text-sm font-medium transition-colors",
              isAllPeriod
                ? "bg-[var(--color-primary)] text-white font-bold"
                : "bg-background text-[var(--color-text-primary)] hover:bg-muted",
            )}
          >
            全期間
          </button>
        )}
      </div>
      {showLockToggle && (
        <button
          type="button"
          onClick={() => setLocked(!locked)}
          title={
            locked
              ? "対象月をロック中（自動デフォルトを無効化）。クリックで解除"
              : "対象月のロックは未設定。クリックで現在の月に固定"
          }
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
            locked
              ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
              : "border-input bg-background text-muted-foreground hover:bg-muted",
          )}
        >
          {locked ? (
            <>
              <Lock className="h-3.5 w-3.5" />
              <span>ロック中</span>
            </>
          ) : (
            <>
              <Unlock className="h-3.5 w-3.5" />
              <span>ロックなし</span>
            </>
          )}
        </button>
      )}
      </div>
    </div>
  );
}

/** 選択中の会計年度の期首月（1-12）。officeが未ロードなら1を返す */
export function useFyStartMonth(): number {
  const fiscalYear = usePeriodStore((s) => s.fiscalYear);
  const office = useMfOffice();
  const period = (office.data as any)?.accounting_periods?.find(
    (p: any) => p.fiscal_year === fiscalYear,
  ) ?? (office.data as any)?.accounting_periods?.[0];
  const fyStartDate = period?.start_date;
  return fyStartDate ? Number(String(fyStartDate).slice(5, 7)) : 1;
}

/**
 * 期間まわりの派生情報をまとめて返すフック。
 * - グレーアウト判定 (isMonthInRange) は推移表で対象期間外の列を薄くするのに使う
 */
export function usePeriodRange() {
  const month = usePeriodStore((s) => s.month);
  const fyStartMonth = useFyStartMonth();
  const isAllPeriod = month === undefined;
  const endMonth = month ?? ((fyStartMonth + 11 - 1) % 12) + 1;

  const elapsedMonths = isAllPeriod
    ? 12
    : (() => {
        const diff = endMonth - fyStartMonth + 1;
        return diff > 0 ? diff : diff + 12;
      })();

  const rangeLabel = isAllPeriod
    ? `通期（${fyStartMonth}月〜${endMonth}月）`
    : `${fyStartMonth}月〜${endMonth}月 累計（${elapsedMonths}ヶ月）`;

  const monthSequence = useMemo(() => {
    const seq: number[] = [];
    for (let i = 0; i < 12; i++) {
      seq.push(((fyStartMonth - 1 + i) % 12) + 1);
    }
    return seq;
  }, [fyStartMonth]);

  /** その月が表示対象期間内か（期首〜endMonth） */
  const isMonthInRange = (m: number): boolean => {
    if (isAllPeriod) return true;
    const endIdx = monthSequence.indexOf(endMonth);
    const thisIdx = monthSequence.indexOf(m);
    return thisIdx >= 0 && thisIdx <= endIdx;
  };

  return {
    fyStartMonth,
    endMonth,
    isAllPeriod,
    elapsedMonths,
    rangeLabel,
    monthSequence,
    isMonthInRange,
  };
}
