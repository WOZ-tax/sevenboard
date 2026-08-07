/**
 * エンジン切替と、legacy / tbreview 共通の仕訳帳 CSV writer のテスト。
 * 仕訳データはすべて架空値。
 */
import { ReviewService, reviewEngineMode } from './review.service';

describe('reviewEngineMode', () => {
  it('未設定・空・不明値はすべて legacy（既定挙動を変えない）', () => {
    expect(reviewEngineMode({} as NodeJS.ProcessEnv)).toBe('legacy');
    expect(reviewEngineMode({ REVIEW_ENGINE: '' } as NodeJS.ProcessEnv)).toBe('legacy');
    expect(reviewEngineMode({ REVIEW_ENGINE: 'legacy' } as NodeJS.ProcessEnv)).toBe('legacy');
    expect(reviewEngineMode({ REVIEW_ENGINE: 'tb-review' } as NodeJS.ProcessEnv)).toBe('legacy');
    expect(reviewEngineMode({ REVIEW_ENGINE: 'なにか' } as NodeJS.ProcessEnv)).toBe('legacy');
  });

  it('tbreview は大文字小文字・前後空白を無視して受ける', () => {
    expect(reviewEngineMode({ REVIEW_ENGINE: 'tbreview' } as NodeJS.ProcessEnv)).toBe('tbreview');
    expect(reviewEngineMode({ REVIEW_ENGINE: 'TBReview' } as NodeJS.ProcessEnv)).toBe('tbreview');
    expect(reviewEngineMode({ REVIEW_ENGINE: '  tbreview  ' } as NodeJS.ProcessEnv)).toBe(
      'tbreview',
    );
  });
});

describe('仕訳帳CSV (legacy / tbreview 共通)', () => {
  const service = new ReviewService({} as any, {} as any);
  const build = (data: any): string => (service as any).buildJournalCsv(data);

  const HEADER =
    '"取引No","日付","借方勘定科目","借方補助科目","借方部門","借方取引先","借方税区分",' +
    '"借方インボイス","借方金額","貸方勘定科目","貸方補助科目","貸方部門","貸方取引先",' +
    '"貸方税区分","貸方インボイス","貸方金額","摘要","タグ","メモ"';

  it('仕訳ゼロ件のときは非引用のヘッダ1行だけを返す', () => {
    expect(build({ journals: [] })).toBe(
      '取引No,日付,借方勘定科目,借方補助科目,借方部門,借方取引先,借方税区分,借方インボイス,' +
        '借方金額,貸方勘定科目,貸方補助科目,貸方部門,貸方取引先,貸方税区分,貸方インボイス,' +
        '貸方金額,摘要,タグ,メモ',
    );
    expect(build(undefined)).toBe(build({ journals: [] }));
  });

  it('branch 単位で1行を出し、全セルを引用する', () => {
    const csv = build({
      journals: [
        {
          number: 101,
          transaction_date: '2026-06-30',
          memo: '架空メモ',
          tags: ['A', 'B'],
          branches: [
            {
              remark: '架空商店 6月分',
              debitor: {
                account_name: '消耗品費',
                sub_account_name: '',
                department_name: '本社',
                trade_partner_name: '架空商店',
                tax_name: '課仕 10%',
                value: 10000,
                tax_value: 1000,
              },
              creditor: {
                account_name: '普通預金',
                sub_account_name: '架空銀行',
                tax_name: '対象外',
                value: 11000,
              },
            },
          ],
        },
      ],
    });
    expect(csv.split('\n')).toEqual([
      HEADER,
      '"101","2026-06-30","消耗品費","","本社","架空商店","課仕 10%","","11000",' +
        '"普通預金","架空銀行","","","対象外","","11000","架空商店 6月分","A,B","架空メモ"',
    ]);
  });

  it('金額は税抜本体+税額の税込で出す（税抜経理でも貸借が揃うように）', () => {
    const csv = build({
      journals: [
        {
          number: 1,
          transaction_date: '2026-06-01',
          branches: [
            {
              debitor: { account_name: '仕入高', value: 10000, tax_value: 1000 },
              creditor: { account_name: '買掛金', value: 11000, tax_value: 0 },
            },
          ],
        },
      ],
    });
    const cells = csv.split('\n')[1].split(',');
    expect(cells[8]).toBe('"11000"');
    expect(cells[15]).toBe('"11000"');
  });

  it('invoice_kind を analyze.py が期待する表記へ変換する', () => {
    const csv = build({
      journals: [
        {
          number: 1,
          transaction_date: '2026-06-01',
          branches: [
            {
              debitor: { account_name: '外注費', value: 1000, invoice_kind: 'INVOICE_KIND_80_PERCENT' },
              creditor: { account_name: '未払金', value: 1000, invoice_kind: 'INVOICE_KIND_NOT_TARGET' },
            },
          ],
        },
      ],
    });
    const cells = csv.split('\n')[1].split(',');
    expect(cells[7]).toBe('"80%控除"');
    expect(cells[14]).toBe('""');
  });

  it('ダブルクォートを二重化する', () => {
    const csv = build({
      journals: [
        {
          number: 1,
          transaction_date: '2026-06-01',
          branches: [
            {
              remark: '株式会社"架空"',
              debitor: { account_name: '雑費', value: 1 },
              creditor: { account_name: '現金', value: 1 },
            },
          ],
        },
      ],
    });
    expect(csv.split('\n')[1]).toContain('"株式会社""架空"""');
  });
});
