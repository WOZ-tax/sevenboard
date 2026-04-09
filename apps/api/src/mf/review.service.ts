import { Injectable, Logger } from '@nestjs/common';
import { MfApiService } from './mf-api.service';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execFileAsync = promisify(execFile);

export interface ReviewAlert {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  title: string;
  detail: string;
}

export interface ReviewResult {
  companyName: string;
  analyzedAt: string;
  alerts: ReviewAlert[];
  pl: any;
  bs: any;
  tax: any;
  journal: any;
  crossCheck: any;
  summary: {
    highCount: number;
    mediumCount: number;
    lowCount: number;
    totalAlerts: number;
  };
}

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);
  private readonly scriptPath: string;

  constructor(private mfApi: MfApiService) {
    // analyze.py: process.cwd() = /app (Docker) or project root
    this.scriptPath = path.resolve(
      process.env.REVIEW_SCRIPT_PATH ||
        path.join(process.cwd(), 'apps', 'api', 'scripts', 'analyze.py'),
    );
  }

  /**
   * MFデータを取得し、CSV変換→analyze.py実行→結果を返す
   */
  async runReview(
    orgId: string,
    fiscalYear?: number,
  ): Promise<ReviewResult> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-review-'));

    try {
      // 1. MFからデータ取得（並列）
      const [plTransition, bsTransition, journals, office] = await Promise.all([
        this.mfApi.getTransitionPL(orgId, fiscalYear),
        this.mfApi.getTransitionBS(orgId, fiscalYear),
        this.mfApi.getJournals(orgId).catch(() => ({ journals: [] })),
        this.mfApi.getOffice(orgId),
      ]);

      const companyName = office?.name || orgId;

      // 2. CSV形式に変換して一時ファイルに書き出し
      this.writePlCsv(tmpDir, plTransition);
      this.writeBsCsv(tmpDir, bsTransition);
      this.writeJournalCsv(tmpDir, journals);

      // 3. analyze.py 実行
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      const { stdout, stderr } = await execFileAsync(
        pythonCmd,
        [this.scriptPath, tmpDir],
        { timeout: 60000 },
      );

      if (stderr) {
        this.logger.warn('analyze.py stderr:', stderr);
      }

      // 4. 結果JSON読み込み
      const resultPath = path.join(tmpDir, 'review_result.json');
      if (!fs.existsSync(resultPath)) {
        this.logger.error('review_result.json not generated');
        return this.emptyResult(companyName);
      }

      const raw = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));

      // 5. アラート抽出
      const alerts = this.extractAlerts(raw);

      return {
        companyName,
        analyzedAt: new Date().toISOString(),
        alerts,
        pl: raw.pl || {},
        bs: raw.bs || {},
        tax: raw.tax || {},
        journal: raw.journal || {},
        crossCheck: raw.cross_check || {},
        summary: {
          highCount: alerts.filter((a) => a.severity === 'HIGH').length,
          mediumCount: alerts.filter((a) => a.severity === 'MEDIUM').length,
          lowCount: alerts.filter((a) => a.severity === 'LOW').length,
          totalAlerts: alerts.length,
        },
      };
    } catch (err: any) {
      this.logger.error('Review execution failed', err?.message);
      const result = this.emptyResult('unknown');
      result.alerts.push({
        severity: 'HIGH',
        category: 'システム',
        title: 'レビュー実行エラー',
        detail: `分析スクリプトの実行に失敗しました: ${err?.message || '不明'}`,
      });
      result.summary.highCount = 1;
      result.summary.totalAlerts = 1;
      return result;
    } finally {
      // 一時ファイルクリーンアップ
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch { /* ignore */ }
    }
  }

  // ============================
  // CSV変換
  // ============================

  private writePlCsv(dir: string, transition: any) {
    const columns = (transition.columns || []).filter((c: string) => /^\d+$/.test(c));
    const monthLabels = columns.map((c: string) => `${c}月`);

    const header = ['勘定科目', '補助科目', ...monthLabels, '合計'];
    const rows: string[][] = [header];

    this.walkRows(transition.rows || [], (row: any, depth: number) => {
      const name = row.name || '';
      const values = columns.map((c: string) => {
        const origIdx = transition.columns?.indexOf(c) ?? -1;
        return String(origIdx >= 0 ? ((row.values?.[origIdx] as number) || 0) : 0);
      });
      const settlementIdx = transition.columns?.indexOf('settlement_balance');
      const totalIdx = transition.columns?.indexOf('total');
      const total = totalIdx >= 0 ? String((row.values?.[totalIdx] as number) || 0) : '0';

      rows.push([name, '', ...values, total]);
    });

    fs.writeFileSync(path.join(dir, '損益計算書_月次推移.csv'), rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n'), 'utf-8');
  }

  private writeBsCsv(dir: string, transition: any) {
    const columns = (transition.columns || []).filter((c: string) => /^\d+$/.test(c));
    const monthLabels = columns.map((c: string) => `${c}月`);

    const header = ['勘定科目', '補助科目', ...monthLabels];
    const rows: string[][] = [header];

    this.walkRows(transition.rows || [], (row: any) => {
      const name = row.name || '';
      const values = columns.map((c: string) => {
        const origIdx = transition.columns?.indexOf(c) ?? -1;
        return String(origIdx >= 0 ? ((row.values?.[origIdx] as number) || 0) : 0);
      });
      rows.push([name, '', ...values]);
    });

    fs.writeFileSync(path.join(dir, '貸借対照表_月次推移.csv'), rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n'), 'utf-8');
  }

  private writeJournalCsv(dir: string, data: any) {
    const journals = data?.journals || [];
    if (journals.length === 0) {
      // 空の仕訳帳CSVを書く（analyze.pyがファイルを要求するため）
      const header = '取引No,日付,借方勘定科目,借方補助科目,借方部門,借方取引先,借方税区分,借方インボイス,借方金額,貸方勘定科目,貸方補助科目,貸方部門,貸方取引先,貸方税区分,貸方インボイス,貸方金額,摘要,タグ,メモ';
      fs.writeFileSync(path.join(dir, '仕訳帳.csv'), header, 'utf-8');
      return;
    }

    const header = ['取引No', '日付', '借方勘定科目', '借方補助科目', '借方部門', '借方取引先', '借方税区分', '借方インボイス', '借方金額', '貸方勘定科目', '貸方補助科目', '貸方部門', '貸方取引先', '貸方税区分', '貸方インボイス', '貸方金額', '摘要', 'タグ', 'メモ'];
    const rows: string[][] = [header];

    for (const j of journals) {
      for (const b of j.branches || []) {
        rows.push([
          String(j.id || ''),
          j.date || '',
          b.debitor?.account_name || '',
          b.debitor?.sub_account_name || '',
          b.debitor?.department_name || '',
          b.debitor?.partner_name || '',
          b.debitor?.tax_name || '',
          b.debitor?.invoice_registration || '',
          String(b.debitor?.amount || 0),
          b.creditor?.account_name || '',
          b.creditor?.sub_account_name || '',
          b.creditor?.department_name || '',
          b.creditor?.partner_name || '',
          b.creditor?.tax_name || '',
          b.creditor?.invoice_registration || '',
          String(b.creditor?.amount || 0),
          j.description || '',
          j.tag || '',
          j.note || '',
        ]);
      }
    }

    fs.writeFileSync(path.join(dir, '仕訳帳.csv'), rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n'), 'utf-8');
  }

  private walkRows(rows: any[], fn: (row: any, depth: number) => void, depth = 0) {
    for (const row of rows) {
      fn(row, depth);
      if (row.rows) this.walkRows(row.rows, fn, depth + 1);
    }
  }

  // ============================
  // アラート抽出
  // ============================

  private extractAlerts(raw: any): ReviewAlert[] {
    const alerts: ReviewAlert[] = [];

    // PL: 計算不一致
    for (const c of raw.pl?.calc_checks || []) {
      if (!c.ok) {
        alerts.push({
          severity: 'HIGH',
          category: 'PL',
          title: `${c.item}の計算不一致（${c.month}）`,
          detail: `計算値: ${c.calculated?.toLocaleString()}円 / 実際: ${c.actual?.toLocaleString()}円`,
        });
      }
    }

    // PL: 営業損失
    for (const m of raw.pl?.monthly_table || []) {
      if (m.operating < 0 && !m.month.includes('決算')) {
        alerts.push({
          severity: 'MEDIUM',
          category: 'PL',
          title: `${m.month}営業損失`,
          detail: `営業損失 ${m.operating?.toLocaleString()}円（販管費率 ${m.sga_ratio}%）`,
        });
      }
    }

    // BS: マイナス残高
    for (const n of raw.bs?.negatives || []) {
      const name = n.sub ? `${n.account}/${n.sub}` : n.account;
      alerts.push({
        severity: 'MEDIUM',
        category: 'BS',
        title: `マイナス残高: ${name}（${n.month}）`,
        detail: `${n.amount?.toLocaleString()}円`,
      });
    }

    // BS: 滞留勘定
    for (const s of raw.bs?.stagnant || []) {
      const name = s.sub ? `${s.account}/${s.sub}` : s.account;
      alerts.push({
        severity: s.account.includes('仮払金') || s.account.includes('役員貸付金') ? 'HIGH' : 'MEDIUM',
        category: 'BS',
        title: `滞留勘定: ${name}`,
        detail: `${s.amount?.toLocaleString()}円が${s.months}ヶ月不変`,
      });
    }

    // 消費税: 税区分不整合
    for (const m of raw.tax?.mismatches || []) {
      alerts.push({
        severity: 'MEDIUM',
        category: '消費税',
        title: `税区分不整合: ${m.account}`,
        detail: `${m.date} No.${m.no} — 実際: ${m.actual_tax} / 期待: ${m.expected_tax}`,
      });
    }

    // 消費税: 80%控除
    if (raw.tax?.inv_80_total_denied > 0) {
      alerts.push({
        severity: 'LOW',
        category: '消費税',
        title: 'インボイス80%控除',
        detail: `控除否認額: ${raw.tax.inv_80_total_denied?.toLocaleString()}円（${raw.tax.inv_80_entries?.length}件）`,
      });
    }

    // 仕訳: 重複
    for (const d of (raw.journal?.duplicates || []).slice(0, 5)) {
      alerts.push({
        severity: 'HIGH',
        category: '仕訳',
        title: `重複仕訳: ${d.date} ${d.dr_acct}`,
        detail: `${d.dr_amt?.toLocaleString()}円 / ${d.memo} (${d.count}件)`,
      });
    }

    // 仕訳: 金額異常
    for (const a of (raw.journal?.outliers || []).slice(0, 5)) {
      alerts.push({
        severity: 'MEDIUM',
        category: '仕訳',
        title: `金額異常: ${a.account}`,
        detail: `${a.date} ${a.amount?.toLocaleString()}円（平均の${a.ratio?.toFixed(1)}倍）`,
      });
    }

    // クロスチェック
    for (const c of raw.cross_check?.large_karibarai || []) {
      alerts.push({
        severity: 'HIGH',
        category: 'クロスチェック',
        title: `仮払金大口: ${c.sub || ''}`,
        detail: `${c.amount?.toLocaleString()}円 — 役員貸付金リスク`,
      });
    }

    // severity順にソート
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    alerts.sort((a, b) => order[a.severity] - order[b.severity]);

    return alerts;
  }

  private emptyResult(companyName: string): ReviewResult {
    return {
      companyName,
      analyzedAt: new Date().toISOString(),
      alerts: [],
      pl: {},
      bs: {},
      tax: {},
      journal: {},
      crossCheck: {},
      summary: { highCount: 0, mediumCount: 0, lowCount: 0, totalAlerts: 0 },
    };
  }
}
