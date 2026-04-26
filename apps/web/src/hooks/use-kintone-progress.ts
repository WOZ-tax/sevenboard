"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMfOffice } from "@/hooks/use-mf-data";
import { usePeriodStore } from "@/lib/period-store";
import { useCurrentOrg } from "@/contexts/current-org";
import { useAuthStore } from "@/lib/auth";

/**
 * kintone 月次進捗アプリから、現在選択中の顧問先(MFコード)+会計年度の1レコードを取得。
 * 全ページで共有できるよう、同じ queryKey で react-query キャッシュに載せる。
 */
export function useKintoneProgress() {
  const office = useMfOffice();
  const fiscalYear = usePeriodStore((s) => s.fiscalYear);
  const mfCode = (office.data as { code?: string } | undefined)?.code ?? "";
  return useQuery({
    queryKey: ["kintone", "progress", mfCode, fiscalYear ?? null],
    queryFn: () =>
      api.kintone.getByMfCode(mfCode, fiscalYear ? String(fiscalYear) : undefined),
    enabled: !!mfCode,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * SevenBoard MonthlyClose のデフォルト月解決結果を取得。
 * status=IN_REVIEW最新月 > CLOSED最新月 > null の優先順位はサーバ側ロジック。
 */
function useMonthlyCloseDefaultMonth() {
  const orgId = useCurrentOrg().currentOrgId ?? "";
  const fiscalYear = usePeriodStore((s) => s.fiscalYear);
  return useQuery({
    queryKey: ["monthly-close", "default-month", orgId, fiscalYear ?? null],
    queryFn: () =>
      api.monthlyClose.getDefaultMonth(orgId, fiscalYear as number),
    enabled: !!orgId && !!fiscalYear,
    staleTime: 60 * 1000, // ステータス変更直後の反映を早めるため短め
  });
}

/**
 * 既存名: kintone由来のデフォルト月適用フック。
 * 内部実装は MonthlyClose 優先 → kintone フォールバックの順に格上げ。
 *
 * 使い方: DashboardShell 内で `usePeriodDefaultFromKintone()` を呼ぶだけ。
 */
export function usePeriodDefaultFromKintone() {
  const kintone = useKintoneProgress();
  const monthlyClose = useMonthlyCloseDefaultMonth();
  const month = usePeriodStore((s) => s.month);
  const fiscalYear = usePeriodStore((s) => s.fiscalYear);
  const setPeriod = usePeriodStore((s) => s.setPeriod);
  /** 一度だけ自動設定する（fiscalYear変更時のみ再評価） */
  const appliedForFyRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    // ユーザーが既に月を選択している or 会計年度未定なら触らない
    if (month !== undefined) return;
    if (!fiscalYear) return;
    if (appliedForFyRef.current === fiscalYear) return;

    // 1. MonthlyClose の解決結果を優先
    const closeMonth = monthlyClose.data?.month;
    if (typeof closeMonth === "number" && closeMonth >= 1 && closeMonth <= 12) {
      setPeriod(fiscalYear, closeMonth);
      appliedForFyRef.current = fiscalYear;
      return;
    }

    // 2. kintone "4.納品済" 最新月にフォールバック
    if (kintone.data) {
      const status = kintone.data.monthlyStatus || {};
      let latestDelivered = 0;
      for (let m = 1; m <= 12; m++) {
        const s = status[m] || "";
        if (typeof s === "string" && s.startsWith("4.")) {
          latestDelivered = m;
        }
      }
      if (latestDelivered > 0) {
        setPeriod(fiscalYear, latestDelivered);
        appliedForFyRef.current = fiscalYear;
        return;
      }
    }
  }, [
    monthlyClose.data,
    kintone.data,
    month,
    fiscalYear,
    setPeriod,
  ]);
}
