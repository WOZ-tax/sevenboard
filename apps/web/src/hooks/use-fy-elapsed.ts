"use client";

import { useMfOffice } from "@/hooks/use-mf-data";
import { usePeriodStore } from "@/lib/period-store";

interface AccountingPeriod {
  fiscal_year: number;
  start_date: string;
  end_date: string;
}

interface FyElapsed {
  /** 期首月（1-12）。officeが未ロードなら1 */
  fyStartMonth: number;
  /** 期首から今日まで経過した月数（小数なし、月初基準）。officeが未ロードなら 0 */
  elapsedMonths: number;
  /** 決算月までの残月数（小数なし）。 */
  remainingMonths: number;
  /** 既に決算期を過ぎている（=次の会計年度に入っている） */
  isPastFyEnd: boolean;
  /** office データが揃っているか */
  isReady: boolean;
}

/**
 * 「現在日付」基準で、選択中の会計年度（period-store の fiscalYear）の
 * 期首から何ヶ月経過したかを返す。決算検討メニューの 9ヶ月ゲート用。
 *
 * 注意: usePeriodRange は「選択中の対象月」基準なので、ユーザーが UI で
 * 過去月をクリックしていても今日基準で判定したい場合はこちらを使う。
 */
export function useFyElapsed(): FyElapsed {
  const fiscalYear = usePeriodStore((s) => s.fiscalYear);
  const office = useMfOffice();
  const periods = (office.data as { accounting_periods?: AccountingPeriod[] } | undefined)
    ?.accounting_periods;
  const period =
    periods?.find((p) => p.fiscal_year === fiscalYear) ?? periods?.[0];

  if (!period) {
    return {
      fyStartMonth: 1,
      elapsedMonths: 0,
      remainingMonths: 12,
      isPastFyEnd: false,
      isReady: false,
    };
  }

  const start = new Date(period.start_date);
  const end = new Date(period.end_date);
  const fyStartMonth = start.getMonth() + 1;

  const today = new Date();
  // 月初基準: 経過月数は (今年-期首年)*12 + (今月-期首月) + 1。下限0。
  const elapsedRaw =
    (today.getFullYear() - start.getFullYear()) * 12 +
    (today.getMonth() - start.getMonth()) +
    1;
  const elapsedMonths = Math.max(0, Math.min(12, elapsedRaw));
  const isPastFyEnd = today > end;
  const remainingMonths = Math.max(0, 12 - elapsedMonths);

  return {
    fyStartMonth,
    elapsedMonths,
    remainingMonths,
    isPastFyEnd,
    isReady: true,
  };
}
