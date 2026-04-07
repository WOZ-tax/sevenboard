import { Injectable, Logger } from '@nestjs/common';
import { MfApiService } from '../mf/mf-api.service';
import { MfTransformService } from '../mf/mf-transform.service';

export interface AlertItem {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  detectedAt: string;
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private mfApi: MfApiService,
    private mfTransform: MfTransformService,
  ) {}

  async detectAlerts(orgId: string, fiscalYear?: number): Promise<AlertItem[]> {
    const alerts: AlertItem[] = [];
    const now = new Date().toISOString();

    try {
      const [plT, bsT, pl, bs] = await Promise.all([
        this.mfApi.getTransitionPL(orgId, fiscalYear),
        this.mfApi.getTransitionBS(orgId, fiscalYear),
        this.mfApi.getTrialBalancePL(orgId, fiscalYear),
        this.mfApi.getTrialBalanceBS(orgId, fiscalYear),
      ]);

      // 1. 月次変動 > 30% の科目検知
      this.detectMonthlyVariance(plT.rows, alerts, now, 0.3);

      // 2. ランウェイ < 12ヶ月
      const cashflow = this.mfTransform.deriveCashflow(bsT, plT);
      if (cashflow.runway.months < 6) {
        alerts.push({
          id: `runway-critical-${Date.now()}`,
          severity: 'critical',
          title: 'ランウェイ危険水域',
          description: `ランウェイが${cashflow.runway.months}ヶ月です。現預金${Math.round(cashflow.runway.cashBalance / 10000).toLocaleString()}万円、月次支出平均${Math.round(cashflow.runway.monthlyBurnRate / 10000).toLocaleString()}万円。早急な対策が必要です。`,
          detectedAt: now,
        });
      } else if (cashflow.runway.months < 12) {
        alerts.push({
          id: `runway-warning-${Date.now()}`,
          severity: 'warning',
          title: 'ランウェイ注意',
          description: `ランウェイが${cashflow.runway.months}ヶ月です。資金計画の見直しを推奨します。`,
          detectedAt: now,
        });
      }

      // 3. 流動比率 < 100%
      const indicators = this.mfTransform.calculateFinancialIndicators(pl, bs);
      if (indicators.currentRatio > 0 && indicators.currentRatio < 100) {
        alerts.push({
          id: `current-ratio-${Date.now()}`,
          severity: 'critical',
          title: '流動比率が100%未満',
          description: `流動比率が${indicators.currentRatio.toFixed(1)}%です。短期的な支払い能力に懸念があります。`,
          detectedAt: now,
        });
      }

      // 4. 売掛金回転日数 > 90日
      if (indicators.receivablesTurnover > 0 && indicators.receivablesTurnover < 4) {
        const days = Math.round(365 / indicators.receivablesTurnover);
        if (days > 90) {
          alerts.push({
            id: `ar-turnover-${Date.now()}`,
            severity: 'warning',
            title: '売掛金回転日数が長期化',
            description: `売掛金回転日数が約${days}日です（回転率: ${indicators.receivablesTurnover.toFixed(1)}回）。回収サイクルの見直しを検討してください。`,
            detectedAt: now,
          });
        }
      }

      // 5. 営業利益率が低い
      if (indicators.operatingProfitMargin < 0) {
        alerts.push({
          id: `op-margin-${Date.now()}`,
          severity: 'warning',
          title: '営業赤字',
          description: `営業利益率が${indicators.operatingProfitMargin.toFixed(1)}%です。収支改善策の検討が必要です。`,
          detectedAt: now,
        });
      }
    } catch (err) {
      this.logger.warn('Alert detection failed, returning empty alerts', err);
    }

    // severity順にソート
    const order = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => order[a.severity] - order[b.severity]);

    return alerts;
  }

  private detectMonthlyVariance(
    rows: any[],
    alerts: AlertItem[],
    now: string,
    threshold: number,
  ) {
    this.walkRows(rows, (row) => {
      if (row.type !== 'account') return;
      const values: number[] = row.values || [];
      // 月次データで前月比を確認（index 0-11）
      for (let i = 1; i < Math.min(values.length, 12); i++) {
        const prev = values[i - 1] as number;
        const curr = values[i] as number;
        if (!prev || !curr || Math.abs(prev) < 10000) continue; // 少額は無視
        const changeRate = (curr - prev) / Math.abs(prev);
        if (Math.abs(changeRate) > threshold) {
          const monthLabels = ['4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '1月', '2月', '3月'];
          const direction = changeRate > 0 ? '増加' : '減少';
          const pctStr = Math.round(Math.abs(changeRate) * 100);
          alerts.push({
            id: `variance-${row.name}-${i}-${Date.now()}`,
            severity: pctStr >= 50 ? 'warning' : 'info',
            title: `${row.name}が前月比${pctStr}%${direction}`,
            description: `${monthLabels[i]}の${row.name}が前月比${pctStr}%${direction}しています（${Math.round(prev / 10000).toLocaleString()}万→${Math.round(curr / 10000).toLocaleString()}万）。`,
            detectedAt: now,
          });
          break; // 同じ科目で複数アラートを出さない
        }
      }
    });
  }

  private walkRows(rows: any[], fn: (row: any) => void) {
    for (const row of rows) {
      fn(row);
      if (row.rows) this.walkRows(row.rows, fn);
    }
  }
}
