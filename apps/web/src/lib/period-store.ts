import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AccountingPeriod {
  fiscal_year: number;
  start_date: string;
  end_date: string;
}

interface PeriodState {
  /** 選択中の会計年度 (undefined = 最新) */
  fiscalYear: number | undefined;
  /** 選択中の月 (1-12, undefined = 会計年度末) */
  month: number | undefined;
  /** MF officeから取得した会計期間一覧 (永続化対象外) */
  periods: AccountingPeriod[];
  /**
   * 対象月ロック。true のとき、kintone / MonthlyClose の自動デフォルト適用を
   * 完全に skip して、ユーザーが選んだ fiscalYear/month を維持する。
   * UI で月をクリックした時点で自動的に true になる。
   */
  locked: boolean;
  /** 期間を設定。lock オプション省略時は手動操作とみなして locked=true にする */
  setPeriod: (
    fiscalYear: number | undefined,
    month?: number,
    options?: { lock?: boolean },
  ) => void;
  /** locked フラグだけ切替えるトグル UI 用 */
  setLocked: (locked: boolean) => void;
  /** MF officeデータから会計期間を初期化 */
  initPeriods: (periods: AccountingPeriod[]) => void;
  /**
   * 選択状態を初期値へ戻す。org 切替時に呼ぶ。
   * sevenboard-period はグローバル永続なので、reset しないと
   * 前 org の fiscalYear/month/locked が別 org に引き継がれ、
   * 存在しない年度でクエリが飛ぶ。periods は次の office フェッチで
   * 再初期化されるのでここでも空にする。
   */
  reset: () => void;
}

export const usePeriodStore = create<PeriodState>()(
  persist(
    (set) => ({
      fiscalYear: undefined,
      month: undefined,
      periods: [],
      locked: false,
      setPeriod: (fiscalYear, month, options) =>
        set(() => ({
          fiscalYear,
          month,
          // 明示的に lock=false が渡されない限りロックする (= ユーザー操作の前提)
          locked: options?.lock ?? true,
        })),
      setLocked: (locked) => set({ locked }),
      initPeriods: (periods) => {
        const latest = periods[0];
        set((state) => {
          // 現在の fiscalYear が新しい periods に存在しなければ latest にフォールバック。
          // org 切替で前 org の年度が残っていると、その org に無い年度でクエリが
          // 飛ぶため、既存値を温存せず最新へ寄せる。
          const fiscalYear =
            state.fiscalYear != null &&
            periods.some((p) => p.fiscal_year === state.fiscalYear)
              ? state.fiscalYear
              : latest?.fiscal_year;
          return { periods, fiscalYear };
        });
      },
      reset: () =>
        set({
          fiscalYear: undefined,
          month: undefined,
          periods: [],
          locked: false,
        }),
    }),
    {
      name: 'sevenboard-period',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // periods は MF から毎回取り直すので永続化しない
      partialize: (state) => ({
        fiscalYear: state.fiscalYear,
        month: state.month,
        locked: state.locked,
      }),
    },
  ),
);

/**
 * 選択月（usePeriodStore.month, 1-12 のカレンダー月）が会計年度の何ヶ月目かを返す（1-12）。
 * 期首4月・選択9月 → 6（4,5,6,7,8,9 の 6 ヶ月目）。
 * 月未選択時は決算月相当の 12 をフォールバック。年換算（YTD÷経過月×12）の分母に使う。
 */
export function getFyElapsedFromMonth(
  selectedMonth: number | undefined,
  fyStartMonth: number,
): number {
  if (!selectedMonth) return 12;
  return ((selectedMonth - fyStartMonth + 12) % 12) + 1;
}

/** 表示用の期間ラベルを生成 */
export function getPeriodLabel(
  fiscalYear: number | undefined,
  month: number | undefined,
  periods: AccountingPeriod[],
): string {
  if (!fiscalYear && periods.length > 0) {
    const latest = periods[0];
    return `${latest.fiscal_year}年度`;
  }
  if (fiscalYear && month) {
    return `${fiscalYear}年${month}月度`;
  }
  if (fiscalYear) {
    return `${fiscalYear}年度`;
  }
  return '';
}
