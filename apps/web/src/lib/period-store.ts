import { create } from 'zustand';

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
  /** MF officeから取得した会計期間一覧 */
  periods: AccountingPeriod[];
  /** 期間を設定 */
  setPeriod: (fiscalYear: number | undefined, month?: number) => void;
  /** MF officeデータから会計期間を初期化 */
  initPeriods: (periods: AccountingPeriod[]) => void;
}

export const usePeriodStore = create<PeriodState>((set) => ({
  fiscalYear: undefined,
  month: undefined,
  periods: [],
  setPeriod: (fiscalYear, month) => set({ fiscalYear, month }),
  initPeriods: (periods) => {
    const latest = periods[0];
    set((state) => ({
      periods,
      fiscalYear: state.fiscalYear ?? latest?.fiscal_year,
    }));
  },
}));

/** 表示用の期間ラベルを生成 */
export function getPeriodLabel(
  fiscalYear: number | undefined,
  month: number | undefined,
  periods: AccountingPeriod[],
): string {
  if (!fiscalYear && periods.length > 0) {
    const latest = periods[0];
    const endMonth = new Date(latest.end_date).getMonth() + 1;
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
