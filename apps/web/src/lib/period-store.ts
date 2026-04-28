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
        set((state) => ({
          periods,
          fiscalYear: state.fiscalYear ?? latest?.fiscal_year,
        }));
      },
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
