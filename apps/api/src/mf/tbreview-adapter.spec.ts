/**
 * tb-review-api レスポンス → ReviewResult アダプタの単体テスト。
 * findings はすべて架空値。
 */
import { adaptTbReviewResponse, TbReviewResponse } from './tbreview-adapter';

function finding(over: Record<string, any> = {}) {
  return {
    finding_id: '0001-202606-JCT-X-01',
    rule_id: 'JCT-X',
    severity: 'A',
    target: { account: '地代家賃', amount: 1_100_000 },
    reason: '居住用賃貸は非課税仕入（消費税法別表第二13号）。',
    action: '賃貸借契約書の用途欄を確認し税区分を修正する。',
    impact: { amount: 100_000, basis: '1,100,000×10/110' },
    ...over,
  };
}

function response(over: Partial<TbReviewResponse> = {}): TbReviewResponse {
  return {
    engines: [
      { key: 'monthly', label: '月次チェック', returncode: 0, seconds: 1.2, findings_count: 1 },
      { key: 'jct', label: '消費税', returncode: 0, seconds: 0.9, findings_count: 1 },
      { key: 'anomaly', label: '仕訳異常', returncode: 0, seconds: 0.5, findings_count: 0 },
    ],
    findings_by_source: {
      monthly: { findings: [finding({ finding_id: 'M-01', rule_id: 'MON-1', severity: 'B' })] },
      jct: { findings: [finding()] },
    },
    triage: {
      counts: { A: 1, B: 1, INFO: 0 },
      displayed: [
        { source: 'jct', finding_id: '0001-202606-JCT-X-01', rule_id: 'JCT-X', severity: 'A' },
        { source: 'monthly', finding_id: 'M-01', rule_id: 'MON-1', severity: 'B' },
      ],
    },
    vendor: { rev: 'abc1234', synced_at: '2026-08-07' },
    ...over,
  };
}

describe('adaptTbReviewResponse', () => {
  it('severity を A→HIGH / B→MEDIUM / INFO→LOW に写す', () => {
    const r = adaptTbReviewResponse(response(), '架空株式会社');
    expect(r.alerts[0].severity).toBe('HIGH');
    expect(r.alerts[1].severity).toBe('MEDIUM');

    const info = adaptTbReviewResponse(
      response({
        findings_by_source: { jct: { findings: [finding({ severity: 'INFO' })] } },
        triage: {
          displayed: [
            { source: 'jct', finding_id: '0001-202606-JCT-X-01', severity: 'INFO' },
          ],
        },
      }),
      '架空株式会社',
    );
    expect(info.alerts[0].severity).toBe('LOW');
  });

  it('triage.displayed の順序をそのまま採用する（dedup で落ちた指摘は復活させない）', () => {
    const res = response({
      findings_by_source: {
        monthly: {
          findings: [
            finding({ finding_id: 'M-01', rule_id: 'MON-1' }),
            finding({ finding_id: 'M-DROPPED', rule_id: 'MON-NEG' }),
          ],
        },
        anomaly: { findings: [finding({ finding_id: 'A-01', rule_id: 'ANM-BSNEG-売掛金' })] },
      },
      triage: {
        displayed: [
          { source: 'anomaly', finding_id: 'A-01' },
          { source: 'monthly', finding_id: 'M-01' },
        ],
      },
    });
    const r = adaptTbReviewResponse(res, '架空株式会社');
    expect(r.alerts.map((a) => a.title)).toEqual([
      '地代家賃 [ANM-BSNEG-売掛金]',
      '地代家賃 [MON-1]',
    ]);
    expect(JSON.stringify(r.alerts)).not.toContain('M-DROPPED');
  });

  it('detail は reason 原文で始まり、他フィールドを転記のみで連結する', () => {
    const r = adaptTbReviewResponse(response(), '架空株式会社');
    const detail = r.alerts[0].detail;
    expect(detail.startsWith('居住用賃貸は非課税仕入（消費税法別表第二13号）。')).toBe(true);
    expect(detail).toContain('対応: 賃貸借契約書の用途欄を確認し税区分を修正する。');
    // 金額は再計算せず整数を書式化するだけ
    expect(detail).toContain('影響額: ¥100,000');
    expect(detail).toContain('対象金額: ¥1,100,000');
    expect(detail).toContain('ID: 0001-202606-JCT-X-01');
  });

  it('category は source ラベル（月次チェック / 消費税 / 仕訳異常）', () => {
    const r = adaptTbReviewResponse(response(), '架空株式会社');
    expect(r.alerts.map((a) => a.category)).toEqual(['消費税', '月次チェック']);
  });

  it('title は 勘定科目/補助科目 [rule_id]。科目が無ければ rule_id', () => {
    const withSub = adaptTbReviewResponse(
      response({
        findings_by_source: {
          jct: {
            findings: [
              finding({ target: { account: '普通預金', sub_account: '架空銀行', amount: 1 } }),
            ],
          },
        },
        triage: { displayed: [{ source: 'jct', finding_id: '0001-202606-JCT-X-01' }] },
      }),
      '架空株式会社',
    );
    expect(withSub.alerts[0].title).toBe('普通預金/架空銀行 [JCT-X]');

    const noAccount = adaptTbReviewResponse(
      response({
        findings_by_source: { jct: { findings: [finding({ target: { account: '', amount: 0 } })] } },
        triage: { displayed: [{ source: 'jct', finding_id: '0001-202606-JCT-X-01' }] },
      }),
      '架空株式会社',
    );
    expect(noAccount.alerts[0].title).toBe('JCT-X');
  });

  it('エンジン失敗を HIGH の指摘として可視化する（失敗≠指摘ゼロ）', () => {
    const r = adaptTbReviewResponse(
      response({
        engines: [
          { key: 'monthly', label: '月次チェック', returncode: 1, stderr_tail: 'Traceback: boom' },
          { key: 'jct', label: '消費税', returncode: 0 },
          { key: 'anomaly', label: '仕訳異常', returncode: 0 },
        ],
      }),
      '架空株式会社',
    );
    const failure = r.alerts.find((a) => a.title.includes('月次チェックエンジンの実行に失敗'));
    expect(failure).toBeDefined();
    expect(failure!.severity).toBe('HIGH');
    expect(failure!.detail).toContain('指摘ゼロではありません');
    expect(failure!.detail).toContain('Traceback: boom');
  });

  it('エンジン自身が記録した部分失敗 (disclosures.errors) も HIGH で出す', () => {
    const r = adaptTbReviewResponse(
      response({
        triage: {
          displayed: [],
          disclosures: [
            { source: 'anomaly', source_label: '仕訳異常', errors: ['cp932 decode error'] },
          ],
        },
      }),
      '架空株式会社',
    );
    const partial = r.alerts.find((a) => a.title.includes('一部チェックが失敗'));
    expect(partial?.severity).toBe('HIGH');
    expect(partial?.detail).toContain('cp932 decode error');
  });

  it('materiality 未満の非表示件数と金額パース失敗行を開示する', () => {
    const r = adaptTbReviewResponse(
      response({
        triage: {
          displayed: [],
          disclosures: [
            { source: 'jct', dropped_count: 3, dropped_amount: 4500, skipped_rows: 2 },
          ],
        },
      }),
      '架空株式会社',
    );
    const dropped = r.alerts.find((a) => a.title.includes('重要性基準未満'));
    expect(dropped?.severity).toBe('LOW');
    expect(dropped?.detail).toContain('3件');
    expect(dropped?.detail).toContain('¥4,500');
    const skipped = r.alerts.find((a) => a.title.includes('金額を読めず'));
    expect(skipped?.severity).toBe('MEDIUM');
    expect(skipped?.detail).toContain('2行');
  });

  it('triage が無いレスポンスでも findings を落とさない', () => {
    const r = adaptTbReviewResponse(
      { ...response(), triage: undefined },
      '架空株式会社',
    );
    expect(r.alerts.filter((a) => a.category !== 'システム')).toHaveLength(2);
    // フォールバックは monthly → jct → anomaly の順
    expect(r.alerts[0].category).toBe('月次チェック');
  });

  it('summary は生成したアラート配列と一致する', () => {
    const r = adaptTbReviewResponse(response(), '架空株式会社');
    expect(r.summary.totalAlerts).toBe(r.alerts.length);
    expect(r.summary.highCount).toBe(r.alerts.filter((a) => a.severity === 'HIGH').length);
    expect(r.summary.mediumCount).toBe(r.alerts.filter((a) => a.severity === 'MEDIUM').length);
    expect(r.summary.lowCount).toBe(r.alerts.filter((a) => a.severity === 'LOW').length);
  });

  it('ReviewTab が optional chaining で読むセクションは空オブジェクトで返す（捏造しない）', () => {
    const r = adaptTbReviewResponse(response(), '架空株式会社');
    expect(r.pl).toEqual({});
    expect(r.bs).toEqual({});
    expect(r.tax).toEqual({});
    expect(r.journal).toEqual({});
    expect(r.crossCheck).toEqual({});
    expect(r.companyName).toBe('架空株式会社');
    expect(() => new Date(r.analyzedAt).toISOString()).not.toThrow();
  });

  it('生レスポンスを tbreview フィールドへ無加工で添付する（フロントのネイティブ表示用）', () => {
    const res = response({
      warnings: ['bs_csv: CP932 で表現できない文字 2 個を置換しました'],
      triage: {
        counts: { A: 1, B: 1, INFO: 0 },
        scores: { monthly_score: 82 },
        top: [
          {
            rank: 1,
            source: 'jct',
            source_label: '消費税',
            finding_id: '0001-202606-JCT-X-01',
            rule_id: 'JCT-X',
            severity: 'A',
            account: '地代家賃',
            target_amount: 1_100_000,
            impact_amount: 100_000,
          },
        ],
        displayed: [{ source: 'jct', finding_id: '0001-202606-JCT-X-01' }],
        dedup: [
          {
            action: '原因診断に統合',
            dropped: { source: 'monthly', finding_id: 'M-01', rule_id: 'MON-NEG' },
            merged_into: { source: 'anomaly', finding_id: 'A-01', rule_id: 'ANM-BSNEG-売掛金' },
          },
        ],
        disclosures: [{ source: 'jct', source_label: '消費税', dropped_count: 3 }],
      },
    });
    const r = adaptTbReviewResponse(res, '架空株式会社');

    // 転記のみ: 生レスポンスと構造的に完全一致（間引き・言い換え・再計算をしない）
    expect(r.tbreview).toEqual(res);
    expect(r.tbreview?.engines).toEqual(res.engines);
    expect(r.tbreview?.findings_by_source).toEqual(res.findings_by_source);
    expect(r.tbreview?.triage).toEqual(res.triage);
    expect(r.tbreview?.vendor).toEqual(res.vendor);
    expect(r.tbreview?.warnings).toEqual(res.warnings);
    // triage.top は reason/action を持たない（フロントは findings_by_source から引く）
    expect(r.tbreview?.triage?.top?.[0]).not.toHaveProperty('reason');
  });

  it('tbreview 添付後も alerts / summary は従来どおり（後方互換）', () => {
    const res = response();
    const r = adaptTbReviewResponse(res, '架空株式会社');

    expect(r.alerts.map((a) => a.category)).toEqual(['消費税', '月次チェック']);
    expect(r.alerts[0].severity).toBe('HIGH');
    expect(r.alerts[0].detail).toContain('居住用賃貸は非課税仕入');
    expect(r.summary.totalAlerts).toBe(r.alerts.length);
    // 添付は追加フィールドのみ。既存セクションは空オブジェクトのまま
    expect(r.pl).toEqual({});
    expect(r.crossCheck).toEqual({});
  });

  it('CP932 変換警告 (warnings) を LOW で出す', () => {
    const r = adaptTbReviewResponse(
      response({ warnings: ['bs_csv: CP932 で表現できない文字 2 個を置換しました'] }),
      '架空株式会社',
    );
    const warn = r.alerts.find((a) => a.title === 'エンジンへの入力変換で警告');
    expect(warn?.severity).toBe('LOW');
    expect(warn?.detail).toContain('2 個');
  });
});
