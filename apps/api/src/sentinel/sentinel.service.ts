import { Injectable, Logger } from '@nestjs/common';
import { MfApiService } from '../mf/mf-api.service';
import { MfTransformService } from '../mf/mf-transform.service';
import { AgentRunsService } from '../agent-runs/agent-runs.service';
import { MonthlyCloseService } from '../monthly-close/monthly-close.service';

export type SentinelSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type SentinelConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SentinelEvidence {
  source: string;
  confidence: SentinelConfidence;
  premise: string;
}

export interface SentinelDetection {
  id: string;
  severity: SentinelSeverity;
  title: string;
  body: string;
  evidence: SentinelEvidence;
  linkHref?: string;
}

export interface SentinelResponse {
  generatedAt: string;
  detections: SentinelDetection[];
  fallbackReason?: string;
}

@Injectable()
export class SentinelService {
  private logger = new Logger('SentinelService');

  constructor(
    private mfApi: MfApiService,
    private mfTransform: MfTransformService,
    private agentRuns: AgentRunsService,
    private monthlyClose: MonthlyCloseService,
  ) {}

  async detect(
    orgId: string,
    options?: {
      fiscalYear?: number;
      endMonth?: number;
      runwayMode?: 'worstCase' | 'netBurn' | 'actual';
    },
  ): Promise<SentinelResponse> {
    const now = new Date();
    const startedAt = Date.now();

    try {
      const [bsTransition, plTransition, pl, bs, settledMonths] = await Promise.all([
        this.mfApi.getTransitionBS(orgId, options?.fiscalYear, options?.endMonth),
        this.mfApi.getTransitionPL(orgId, options?.fiscalYear, options?.endMonth),
        this.mfApi.getTrialBalancePL(orgId, options?.fiscalYear, options?.endMonth),
        this.mfApi.getTrialBalanceBS(orgId, options?.fiscalYear, options?.endMonth),
        options?.fiscalYear
          ? this.monthlyClose.getSettledMonths(orgId, options.fiscalYear)
          : Promise.resolve(undefined),
      ]);

      // Cashflow ページと同じ deriveCashflow 経由（settledMonths も渡して整合性確保）
      const cashflowDerived =
        bsTransition && plTransition
          ? this.mfTransform.deriveCashflow(bsTransition, plTransition, bs, settledMonths)
          : undefined;
      const dashboard = this.mfTransform.buildDashboardSummary(pl, bs, cashflowDerived);

      const detections: SentinelDetection[] = [];
      const monthLabels = this.buildMonthLabels(bsTransition?.columns);
      const mc = monthLabels.length;

      // 1) 現預金残高トレンド（直近3ヶ月の連続減少を検知）
      const cashRow = this.findRowByPartial(bsTransition?.rows, '現金及び預金');
      if (cashRow && mc >= 3) {
        const cashSeries = this.monthlyValues(cashRow, mc);
        const lastIdx = cashSeries.length - 1;
        const trailing = cashSeries.slice(Math.max(0, lastIdx - 2), lastIdx + 1);
        const decreasing =
          trailing.length === 3 &&
          trailing[2] < trailing[1] &&
          trailing[1] < trailing[0];
        if (decreasing) {
          const dropRatio = (trailing[0] - trailing[2]) / Math.max(1, trailing[0]);
          const severity: SentinelSeverity =
            dropRatio >= 0.2 ? 'HIGH' : dropRatio >= 0.1 ? 'MEDIUM' : 'LOW';
          detections.push({
            id: 'cash-trend-down',
            severity,
            title: '現預金残高が3ヶ月連続で減少',
            body: `直近3ヶ月で ${formatYen(trailing[0])} → ${formatYen(trailing[2])}（${(dropRatio * 100).toFixed(1)}%減）。`,
            evidence: {
              source: 'MF会計 BS推移表',
              confidence: 'HIGH',
              premise: '試算表の月次締め値を確定値として扱う',
            },
            linkHref: '/cashflow',
          });
        }
      }

      // 2) ランウェイ警戒（資金繰りページのユーザー選択モードを主指標として 6ヶ月未満で警告）
      // ユーザーが actual/worstCase を見ているのに Net Burn 基準だけで警告すると、ページ上の数字と
      // 警告内容が食い違う。資金繰りページの選択を尊重しつつ、構造的体力の Net Burn は常にアンカー併記。
      const primaryMode = options?.runwayMode ?? 'netBurn';
      const primaryLabel: Record<typeof primaryMode, string> = {
        worstCase: 'Gross Burn(売上ゼロ最悪)',
        netBurn: 'Net Burn(構造的損失)',
        actual: 'Actual Burn(BS純減ベース)',
      };
      const variants = cashflowDerived?.runway.variants;
      const primaryVariant = variants?.[primaryMode];
      const netBurnVariant = variants?.netBurn;
      const primaryMonths = primaryVariant?.months ?? dashboard.runway;
      if (Number.isFinite(primaryMonths) && primaryMonths < 6) {
        const severity: SentinelSeverity =
          primaryMonths < 1
            ? 'CRITICAL'
            : primaryMonths < 3
              ? 'HIGH'
              : 'MEDIUM';
        const netMonths = netBurnVariant?.months;
        const divergenceNote =
          primaryMode !== 'netBurn' && netMonths !== undefined && Number.isFinite(netMonths) &&
          Math.abs(netMonths - primaryMonths) >= 3
            ? ` 構造的(Net Burn)基準では${netMonths.toFixed(1)}ヶ月。一時要因が剥がれると Net Burn ペースに収束する。`
            : '';
        detections.push({
          id: 'runway-warning',
          severity,
          title: `ランウェイ ${primaryMonths.toFixed(1)}ヶ月（${primaryLabel[primaryMode]}基準）`,
          body: `現預金 ${formatYen(dashboard.cashBalance)} / ${primaryLabel[primaryMode]} 基準。${divergenceNote} 資金調達またはコスト構造の見直しを早期検討。`,
          evidence: {
            source: 'MF会計 試算表（PL/BS）+ BS推移表',
            confidence: 'MEDIUM',
            premise: `主指標は資金繰りページの選択モード(${primaryMode})。Net Burn は事業の構造的体力アンカー`,
          },
          linkHref: '/cashflow',
        });
      }

      // 3) 売上債権の急増（DSO悪化予兆）
      const arRow =
        this.findRowByPartial(bsTransition?.rows, '売上債権合計') ||
        this.findRow(bsTransition?.rows, '売掛金');
      const revenueRow = this.findRow(plTransition?.rows, '売上高合計');
      if (arRow && revenueRow && mc >= 2) {
        const arSeries = this.monthlyValues(arRow, mc);
        const revSeries = this.monthlyValues(revenueRow, mc);
        const lastIdx = mc - 1;
        const prevIdx = lastIdx - 1;
        const curRev = revSeries[lastIdx];
        const prevRev = revSeries[prevIdx];
        const curDso =
          curRev > 0 ? (arSeries[lastIdx] / curRev) * 30 : null;
        const prevDso =
          prevRev > 0 ? (arSeries[prevIdx] / prevRev) * 30 : null;
        if (curDso !== null && prevDso !== null && curDso > prevDso * 1.2 && curDso > 30) {
          detections.push({
            id: 'dso-spike',
            severity: curDso > prevDso * 1.5 ? 'HIGH' : 'MEDIUM',
            title: '回収サイト(DSO)が前月比で悪化',
            body: `前月 ${prevDso.toFixed(0)}日 → 今月 ${curDso.toFixed(0)}日（約${((curDso / prevDso - 1) * 100).toFixed(0)}%増）。大口未回収の発生または請求遅延の可能性。`,
            evidence: {
              source: 'MF会計 BS推移表 × PL推移表',
              confidence: 'MEDIUM',
              premise: '売上債権残高 / 月次売上 × 30 をDSO近似として算出',
            },
            linkHref: '/cashflow',
          });
        }
      }

      // 4) 短期借入金の増加（資金繰り悪化のサイン）
      const shortBorrowRow = this.findRow(bsTransition?.rows, '短期借入金');
      if (shortBorrowRow && mc >= 2) {
        const series = this.monthlyValues(shortBorrowRow, mc);
        const lastIdx = mc - 1;
        const delta = series[lastIdx] - series[lastIdx - 1];
        if (delta > 0 && series[lastIdx] > 0) {
          const ratio = delta / Math.max(1, series[lastIdx - 1]);
          if (ratio >= 0.3 || delta > 5_000_000) {
            detections.push({
              id: 'short-borrow-up',
              severity: 'MEDIUM',
              title: '短期借入金が直近1ヶ月で増加',
              body: `前月比 +${formatYen(delta)}（${(ratio * 100).toFixed(0)}%増）。運転資金の逼迫または戦略的な調達かを確認。`,
              evidence: {
                source: 'MF会計 BS推移表',
                confidence: 'HIGH',
                premise: '月次残高ベースの差分計算',
              },
              linkHref: '/cashflow',
            });
          }
        }
      }

      detections.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

      const result: SentinelResponse = {
        generatedAt: now.toISOString(),
        detections: detections.slice(0, 5),
        fallbackReason:
          detections.length === 0 ? '検知なし' : undefined,
      };
      await this.agentRuns.logRun({
        orgId,
        agentKey: 'SENTINEL',
        mode: 'OBSERVE',
        fiscalYear: options?.fiscalYear ?? null,
        endMonth: options?.endMonth ?? null,
        input: { fiscalYear: options?.fiscalYear ?? null, endMonth: options?.endMonth ?? null },
        output: result as unknown as Record<string, unknown>,
        status: result.fallbackReason && detections.length === 0 ? 'FALLBACK' : 'SUCCESS',
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (err) {
      this.logger.warn(
        `Sentinel detection failed: ${err instanceof Error ? err.message : err}`,
      );
      const fallback: SentinelResponse = {
        generatedAt: now.toISOString(),
        detections: [],
        fallbackReason: 'MF会計に接続できないため検知を保留',
      };
      await this.agentRuns.logRun({
        orgId,
        agentKey: 'SENTINEL',
        mode: 'OBSERVE',
        fiscalYear: options?.fiscalYear ?? null,
        endMonth: options?.endMonth ?? null,
        input: { fiscalYear: options?.fiscalYear ?? null, endMonth: options?.endMonth ?? null },
        output: fallback as unknown as Record<string, unknown>,
        status: 'FAILED',
        errorMessage: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedAt,
      });
      return fallback;
    }
  }

  private buildMonthLabels(columns: string[] | null | undefined): string[] {
    if (!Array.isArray(columns)) return [];
    return columns.filter((c) => /^\d+$/.test(c)).map((c) => `${c}月`);
  }

  private findRow(
    rows: Array<{ name: string; rows?: unknown[] }> | null | undefined,
    name: string,
  ): { name: string; closing_balance?: number; [k: string]: unknown } | null {
    if (!Array.isArray(rows)) return null;
    for (const row of rows) {
      if (row.name === name) return row as never;
      if (row.rows) {
        const found = this.findRow(
          row.rows as Array<{ name: string; rows?: unknown[] }>,
          name,
        );
        if (found) return found;
      }
    }
    return null;
  }

  private findRowByPartial(
    rows: Array<{ name: string; rows?: unknown[] }> | null | undefined,
    partial: string,
  ): { name: string; [k: string]: unknown } | null {
    if (!Array.isArray(rows)) return null;
    for (const row of rows) {
      if (row.name.includes(partial)) return row as never;
      if (row.rows) {
        const found = this.findRowByPartial(
          row.rows as Array<{ name: string; rows?: unknown[] }>,
          partial,
        );
        if (found) return found;
      }
    }
    return null;
  }

  private monthlyValues(
    row: { [k: string]: unknown } | null,
    months: number,
  ): number[] {
    if (!row) return new Array(months).fill(0);
    // MfReportRow は { values: (number|null)[] } の配列で月次値を持つ。
    // (旧コードは row["1"] のように文字列キーで読んでいて常に 0 になっていた)
    const arr = (row.values as unknown[]) ?? [];
    return Array.from({ length: months }, (_, i) => {
      const v = arr[i];
      return typeof v === 'number' ? v : 0;
    });
  }
}

function severityRank(s: SentinelSeverity): number {
  switch (s) {
    case 'CRITICAL':
      return 5;
    case 'HIGH':
      return 4;
    case 'MEDIUM':
      return 3;
    case 'LOW':
      return 2;
    case 'INFO':
      return 1;
  }
}

function formatYen(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const man = Math.round(n / 10000);
  return `${man.toLocaleString('ja-JP')}万円`;
}
