import {
  AiService,
  sanitizeFundingAmount,
  FUNDING_AMOUNT_STATIC_MAX,
} from './ai.service';

describe('sanitizeFundingAmount', () => {
  it('drops non-finite amounts', () => {
    // Number('abc'), Number(undefined), Number({}) are all NaN
    for (const bad of [NaN, Infinity, -Infinity, 'abc', undefined, {}]) {
      expect(sanitizeFundingAmount(bad as any)).toEqual({
        kept: false,
        amount: 0,
        reason: 'non-finite',
      });
    }
    // Number(null) === 0 (finite) → falls through to the below-min guard, still dropped
    expect(sanitizeFundingAmount(null as any)).toMatchObject({
      kept: false,
      reason: 'below-min',
    });
  });

  it('rounds to the nearest 100,000 yen', () => {
    // 33,333,333 → 333.33 steps → round 333 → 33,300,000
    expect(sanitizeFundingAmount(33_333_333)).toEqual({
      kept: true,
      amount: 33_300_000,
    });
    // exact multiple stays as-is
    expect(sanitizeFundingAmount(30_000_000)).toEqual({
      kept: true,
      amount: 30_000_000,
    });
  });

  it('drops amounts below the static minimum (garbage / negative)', () => {
    expect(sanitizeFundingAmount(500_000)).toMatchObject({
      kept: false,
      reason: 'below-min',
    });
    expect(sanitizeFundingAmount(-50_000_000)).toMatchObject({
      kept: false,
      reason: 'below-min',
    });
  });

  describe('without a revenue basis (static sanity range)', () => {
    it('keeps amounts within 100万〜3億', () => {
      expect(sanitizeFundingAmount(30_000_000)).toEqual({
        kept: true,
        amount: 30_000_000,
      });
    });

    it('excludes amounts above the static maximum rather than clamping', () => {
      expect(sanitizeFundingAmount(FUNDING_AMOUNT_STATIC_MAX + 100_000)).toMatchObject(
        { kept: false, reason: 'above-max' },
      );
      expect(sanitizeFundingAmount(50_000_000_000)).toMatchObject({
        kept: false,
        reason: 'above-max',
      });
    });
  });

  describe('with a revenue basis (financial-value cap)', () => {
    it('clamps to 50% of annual revenue when below 1億', () => {
      // 年商 4,000万 → 上限 = min(2,000万, 1億) = 2,000万
      expect(sanitizeFundingAmount(30_000_000, 40_000_000)).toEqual({
        kept: true,
        amount: 20_000_000,
        reason: 'clamped',
      });
    });

    it('clamps to the 1億 absolute cap when 50% of revenue exceeds it', () => {
      // 年商 10億 → 50% = 5億 だが絶対上限 1億でクランプ
      expect(sanitizeFundingAmount(200_000_000, 1_000_000_000)).toEqual({
        kept: true,
        amount: 100_000_000,
        reason: 'clamped',
      });
    });

    it('keeps amounts at or below the revenue cap untouched (only rounded)', () => {
      // 年商 4億 → 上限 = min(2億, 1億) = 1億。5,000万 はそのまま
      expect(sanitizeFundingAmount(50_000_000, 400_000_000)).toEqual({
        kept: true,
        amount: 50_000_000,
      });
    });

    it('never collapses the cap below the static minimum for tiny-revenue firms', () => {
      // 年商 100万 → 50% = 50万 だが下限 100万まで許容
      expect(sanitizeFundingAmount(30_000_000, 1_000_000)).toEqual({
        kept: true,
        amount: 1_000_000,
        reason: 'clamped',
      });
    });

    it('treats zero / negative revenue as no basis (static range)', () => {
      expect(sanitizeFundingAmount(30_000_000, 0)).toEqual({
        kept: true,
        amount: 30_000_000,
      });
      expect(sanitizeFundingAmount(30_000_000, -5)).toEqual({
        kept: true,
        amount: 30_000_000,
      });
    });
  });
});

describe('AiService.sanitizeFundingOptions', () => {
  function createService(): AiService {
    // sanitizeFundingOptions は this.logger しか使わないため他の依存はダミーで良い
    return new AiService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  }

  it('returns [] for non-array input', () => {
    const service = createService();
    expect((service as any).sanitizeFundingOptions(undefined)).toEqual([]);
    expect((service as any).sanitizeFundingOptions(null)).toEqual([]);
  });

  it('drops options whose amount fails sanitization and keeps valid ones (clamped)', () => {
    const service = createService();
    const raw = [
      { type: '銀行借入(運転資金)', amount: 30_000_000, rationale: 'x', suggestedRate: 2.5, suggestedMonths: 60, repaymentType: 'EQUAL_INSTALLMENT' },
      { type: '', amount: 10_000_000 }, // empty type → dropped
      { type: 'エクイティ', amount: 'not-a-number' }, // non-finite → dropped
      { type: '過大提案', amount: 5_000_000_000 }, // above cap → clamped down
    ];
    const out = (service as any).sanitizeFundingOptions(raw, 40_000_000);
    // 年商 4,000万 → 上限 2,000万
    expect(out).toEqual([
      {
        type: '銀行借入(運転資金)',
        amount: 20_000_000, // clamped from 30,000,000
        rationale: 'x',
        suggestedRate: 2.5,
        suggestedMonths: 60,
        repaymentType: 'EQUAL_INSTALLMENT',
      },
      {
        type: '過大提案',
        amount: 20_000_000, // clamped from 5,000,000,000
        rationale: '',
        suggestedRate: undefined,
        suggestedMonths: undefined,
        repaymentType: undefined,
      },
    ]);
  });

  it('drops above-max options when no revenue basis is available', () => {
    const service = createService();
    const raw = [
      { type: '銀行借入', amount: 30_000_000 },
      { type: '過大', amount: 5_000_000_000 },
    ];
    const out = (service as any).sanitizeFundingOptions(raw); // no annualRevenue
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: '銀行借入', amount: 30_000_000 });
  });

  it('rejects invalid repaymentType while keeping the option', () => {
    const service = createService();
    const raw = [{ type: '借入', amount: 20_000_000, repaymentType: 'WEIRD' }];
    const out = (service as any).sanitizeFundingOptions(raw, 400_000_000);
    expect(out[0].repaymentType).toBeUndefined();
  });
});
