/**
 * ロカベン (経産省ローカルベンチマーク) 原データ取得サービス。
 *
 * MF の Trial Balance (PL/BS) + Transition (PL) から、ロカベン6指標の
 * 計算に必要な原データ12項目を抽出する。
 *
 * 設計方針:
 *   - 加工済み FinancialStatement ではなく MfReportRow tree を直接再帰検索 (subtotal/leaf の構造に依存しない)
 *   - 主候補 (subtotal名) を先に試し、見つかれば採用。無ければ leaf 候補を合算
 *   - 同一 row の二重カウントは seen set で防止
 *   - 金額は円 → 千円に変換 (四捨五入)
 *   - 従業員数は MF から取れないため常に null
 */

import { Injectable } from '@nestjs/common';
import { MfApiService } from '../mf/mf-api.service';
import { TB_COL, type MfReportRow } from '../mf/types/mf-api.types';
import { findRowByCandidates } from '../sentinel/risk-rules/account-finder';

export interface LocabenSourceData {
  revenueCurrent: number | null;
  revenuePrior: number | null;
  operatingProfit: number | null;
  depreciation: number | null;
  totalAssets: number | null;
  netAssets: number | null;
  receivables: number | null;
  inventory: number | null;
  payables: number | null;
  borrowings: number | null;
  cashAndDeposits: number | null;
  employeeCount: number | null;
}

function yenToThousand(v: number | null): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  return Math.round(v / 1000);
}

function closing(row: MfReportRow | null): number | null {
  if (!row) return null;
  const v = row.values[TB_COL.CLOSING];
  return typeof v === 'number' ? v : null;
}

/** subtotal 名を先に試し、見つからなければ leaf 候補を合算 */
function aggregateBy(
  rows: MfReportRow[],
  subtotalCandidates: string[],
  leafCandidates: string[],
): number | null {
  const sub = findRowByCandidates(rows, subtotalCandidates);
  if (sub) {
    const v = closing(sub);
    if (v !== null) return v;
  }
  let sum = 0;
  let found = false;
  const seen = new Set<MfReportRow>();
  for (const name of leafCandidates) {
    const r = findRowByCandidates(rows, [name]);
    if (r && !seen.has(r)) {
      const v = closing(r);
      if (v !== null) {
        sum += v;
        seen.add(r);
        found = true;
      }
    }
  }
  return found ? sum : null;
}

@Injectable()
export class LocabenService {
  constructor(private readonly mfApi: MfApiService) {}

  async getSourceData(
    orgId: string,
    fiscalYear?: number,
    endMonth?: number,
  ): Promise<LocabenSourceData> {
    const prevFy = fiscalYear ? fiscalYear - 1 : undefined;

    const [pl, bs, plPrev, plT] = await Promise.all([
      this.mfApi.getTrialBalancePL(orgId, fiscalYear, endMonth),
      this.mfApi.getTrialBalanceBS(orgId, fiscalYear, endMonth),
      prevFy
        ? this.mfApi.getTrialBalancePL(orgId, prevFy).catch(() => null)
        : Promise.resolve(null),
      this.mfApi.getTransitionPL(orgId, fiscalYear, endMonth).catch(() => null),
    ]);

    // PL
    const revenueRow = findRowByCandidates(pl.rows, ['売上高合計', '売上高']);
    const opProfitRow = findRowByCandidates(pl.rows, ['営業利益']);
    const opLossRow = findRowByCandidates(pl.rows, ['営業損失']);
    let operatingProfit: number | null = null;
    if (opProfitRow) {
      operatingProfit = closing(opProfitRow);
    } else if (opLossRow) {
      const v = closing(opLossRow);
      operatingProfit = v === null ? null : -Math.abs(v);
    }

    // 減価償却費: transition PL の年度累計 (total 列)
    let depreciationYen: number | null = null;
    if (plT) {
      const deprRow = findRowByCandidates(plT.rows, [
        '減価償却費',
        '減価償却',
      ]);
      if (deprRow) {
        // columns 例: ["4","5",...,"3","settlement_balance","total"]
        const totalIdx = plT.columns.indexOf('total');
        if (totalIdx >= 0) {
          const v = deprRow.values[totalIdx];
          if (typeof v === 'number') depreciationYen = v;
        }
        if (depreciationYen === null || depreciationYen === 0) {
          // fallback: 12 ヶ月合計
          const monthly = deprRow.values
            .slice(0, 12)
            .filter((v): v is number => typeof v === 'number');
          if (monthly.length > 0) {
            depreciationYen = monthly.reduce((a, b) => a + b, 0);
          }
        }
      }
    }

    // BS
    const totalAssetsRow = findRowByCandidates(bs.rows, ['資産合計']);
    const netAssetsRow = findRowByCandidates(bs.rows, ['純資産合計', '純資産']);
    const cashRow = findRowByCandidates(bs.rows, [
      '現金及び預金',
      '現金預金',
      '現金・預金',
      '現金',
      '預金',
    ]);

    const receivables = aggregateBy(
      bs.rows,
      ['売上債権'],
      ['売掛金', '受取手形', '電子記録債権'],
    );
    const inventory = aggregateBy(
      bs.rows,
      ['棚卸資産'],
      ['商品', '製品', '仕掛品', '原材料', '貯蔵品'],
    );
    const payables = aggregateBy(
      bs.rows,
      ['仕入債務'],
      ['買掛金', '支払手形', '電子記録債務'],
    );
    const borrowings = aggregateBy(
      bs.rows,
      [], // 借入金の subtotal は会社次第なので無理せず leaf 合算
      ['短期借入金', '1年内返済予定の長期借入金', '長期借入金', '役員借入金'],
    );

    let revenuePriorYen: number | null = null;
    if (plPrev) {
      const r = findRowByCandidates(plPrev.rows, ['売上高合計', '売上高']);
      revenuePriorYen = closing(r);
    }

    return {
      revenueCurrent: yenToThousand(closing(revenueRow)),
      revenuePrior: yenToThousand(revenuePriorYen),
      operatingProfit: yenToThousand(operatingProfit),
      depreciation: yenToThousand(depreciationYen),
      totalAssets: yenToThousand(closing(totalAssetsRow)),
      netAssets: yenToThousand(closing(netAssetsRow)),
      receivables: yenToThousand(receivables),
      inventory: yenToThousand(inventory),
      payables: yenToThousand(payables),
      borrowings: yenToThousand(borrowings),
      cashAndDeposits: yenToThousand(closing(cashRow)),
      employeeCount: null,
    };
  }
}
