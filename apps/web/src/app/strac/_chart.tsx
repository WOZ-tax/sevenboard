import type { StracActual } from '@/lib/strac';

export const STRAC_UNITS = { '万円': 10000, '千円': 1000, '百万円': 1000000, '円': 1 };
export type StracUnit = keyof typeof STRAC_UNITS;
export function money(value: number | null, unit: StracUnit = '万円') {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value < 0 ? '▲' : ''}${(Math.abs(value) / STRAC_UNITS[unit]).toLocaleString('ja-JP', { maximumFractionDigits: unit === '円' ? 0 : 1 })}`;
}
export const percent = (v: number | null) => v === null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`;

/** Always-visible area view; thin bands have their amounts below the baseline. */
export function StracAreaChart({ data: d, unit }: { data: StracActual; unit: StracUnit }) {
  const proportional = d.revenue > 0 && [d.variable, d.contribution, d.fixed, d.personnel, d.otherFixed, d.operating].every(v => v >= 0);
  const values = [
    { label: '売上高', value: d.revenue, color: '#cfe2f3' },
    { label: '変動費', value: d.variable, color: '#dfddd9' },
    { label: '限界利益', value: d.contribution, color: '#d9ead3' },
    { label: '固定費', value: d.fixed, color: '#fff0bd' },
    { label: '営業利益', value: d.operating, color: '#f8cbb7' },
  ];
  const y = 20, height = 280, scale = d.revenue > 0 ? height / d.revenue : 0;
  const bands = [
    { x: 10, offset: 0, label: '売上高', value: d.revenue, color: '#cfe2f3' },
    { x: 212, offset: 0, label: '変動費', value: d.variable, color: '#dfddd9' },
    { x: 212, offset: d.variable, label: '限界利益', value: d.contribution, color: '#d9ead3' },
    { x: 414, offset: d.variable, label: '固定費', value: d.fixed, color: '#fff0bd' },
    { x: 414, offset: d.variable + d.fixed, label: '営業利益', value: d.operating, color: '#f8cbb7' },
    { x: 616, offset: d.variable, label: '人件費', value: d.personnel, color: '#f7d6c5' },
    { x: 616, offset: d.variable + d.personnel, label: 'その他固定費', value: d.otherFixed, color: '#ffe5a3' },
  ].map(b => ({ ...b, top: y + b.offset * scale, height: b.value * scale }));
  const callouts = bands.filter(b => b.height < 22);
  return <figure data-print-block data-testid="strac-area-chart">
    <p className="screen-only mb-2 text-[11px] text-muted-foreground md:hidden">図は横にスクロールできます →</p>
    <div className="strac-chart-scroll overflow-x-auto rounded-lg border bg-white p-3" tabIndex={0} aria-label="ストラック図。画面が狭い場合は横にスクロールできます">
      <svg className="strac-svg max-h-[360px] min-w-[816px] w-full" viewBox="0 0 816 354" role="img" aria-label={`ストラック図：${bands.map(b => `${b.label} ${Math.round(b.value).toLocaleString('ja-JP')}円`).join('、')}`}>
        {proportional ? <>
          {bands.map(b => <g key={b.label}>
            <rect x={b.x} y={b.top} width={186} height={b.height} fill={b.color} stroke="#fff" strokeWidth={2} />
            <title>{`${b.label} ${Math.round(b.value).toLocaleString('ja-JP')}円`}</title>
            {b.height >= 60 ? <>
              <text x={b.x + 93} y={b.top + b.height / 2 - 6} fill="#39352f" fontSize={15} textAnchor="middle" fontWeight={600}>{b.label}</text>
              <text x={b.x + 93} y={b.top + b.height / 2 + 16} fill="#39352f" fontSize={14} textAnchor="middle">{money(b.value, unit)}{unit}</text>
            </> : b.height >= 22 ? <text x={b.x + 93} y={b.top + b.height / 2 + 4} fill="#39352f" fontSize={12} textAnchor="middle">{b.label} {money(b.value, unit)}{unit}</text> : null}
          </g>)}
          <line x1={10} x2={802} y1={302} y2={302} stroke="#aca79e" />
          {callouts.map(b => {
            const row = callouts.filter(item => item.x === b.x).findIndex(item => item.label === b.label);
            return <g key={b.label}><rect x={b.x + 2} y={316 + row * 20} width={8} height={8} fill={b.color} stroke="#aaa" strokeWidth={0.5} /><text x={b.x + 16} y={324 + row * 20} fontSize={12} fill="#39352f">{b.label} {money(b.value, unit)}{unit}</text></g>;
          })}
        </> : <>
          <line x1={410} x2={410} y1={10} y2={305} stroke="#aca79e" />
          {values.map((v, i) => {
            const width = Math.abs(v.value) / Math.max(1, ...values.map(item => Math.abs(item.value))) * 245;
            return <g key={v.label}><text x={10} y={40 + i * 54} fontSize={14} fill="#39352f">{v.label}</text><rect x={v.value < 0 ? 410 - width : 410} y={19 + i * 54} width={width} height={32} fill={v.value < 0 ? '#f4b6b6' : v.color} /><text x={804} y={40 + i * 54} fontSize={12} textAnchor="end" fill="#39352f">{money(v.value, unit)}{unit}</text><title>{`${v.label} ${Math.round(v.value).toLocaleString('ja-JP')}円`}</title></g>;
          })}
          <text x={410} y={329} textAnchor="middle" fontSize={12} fill="#706d65">赤字・控除項目があるため、0を基準とした符号付き表示</text>
        </>}
      </svg>
    </div>
    <figcaption className="mt-2 text-xs leading-6 text-muted-foreground">{proportional ? '面積は金額の比率です。文字が入らない小さい項目は、図の下に金額を表示します。' : `固定費の内訳：人件費 ${money(d.personnel, unit)}${unit} ／ その他 ${money(d.otherFixed, unit)}${unit}。`}</figcaption>
  </figure>;
}

export function FlowAmount({ value, unit }: { value: number | null; unit: StracUnit }) {
  return <span className={`strac-amount tabular-nums ${value !== null && value < 0 ? 'text-red-700' : ''}`} title={value === null ? '未確認' : `${Math.round(value).toLocaleString('ja-JP')}円`}>{money(value, unit)}{value !== null && <span className="ml-1 text-xs font-normal">{unit}</span>}</span>;
}

export function FlowCard({ label, term, value, unit, operator, tone = 'neutral', children, testId }: {
  label: string; term?: string; value: number | null; unit: StracUnit; operator?: string;
  tone?: 'neutral' | 'sales' | 'margin' | 'cost' | 'profit'; children?: React.ReactNode; testId?: string;
}) {
  return <div className={`strac-flow-card strac-tone-${tone}`}>
    {operator && <span className="strac-operator" aria-label={operator === '−' ? '差し引く' : operator === '＋' ? '加える' : 'イコール'}>{operator}</span>}
    <div><p className="text-sm font-semibold leading-6">{label}</p>{term && <p className="mt-0.5 text-[11px] text-muted-foreground">{term}</p>}</div>
    <p data-testid={testId} className="mt-3 text-xl font-bold leading-8"><FlowAmount value={value} unit={unit} /></p>
    {children && <p className="mt-2 text-xs leading-5 text-muted-foreground">{children}</p>}
  </div>;
}

/** Reading order stays fixed, even when profit is small or negative. */
export function StracProfitFlow({ data: d, unit }: { data: StracActual; unit: StracUnit }) {
  return <div className="space-y-5">
    <div data-print-block>
      <h3 className="mb-2 text-sm font-semibold">税金を引くと、最終的にいくら利益が残る？</h3>
      <p className="mb-3 text-xs leading-6 text-muted-foreground">本業の利益に、利息などの営業外損益と臨時の特別損益を加減したものが「税金を引く前の利益」です。</p>
      <div className="strac-flow strac-flow-three" aria-label="税金を引く前から引いた後の利益">
        <FlowCard label="税金を引く前の利益" term="税引前当期利益" value={d.pretax} unit={unit} tone="profit" testId="strac-pretax">本業以外の損益も含めた利益</FlowCard>
        <FlowCard label="利益にかかる税金" term="法人税等" value={d.tax} unit={unit} operator="−">会計に計上された税金</FlowCard>
        <FlowCard label="税金を引いた後の利益" term="当期純利益" value={d.net} unit={unit} operator="＝" tone="margin" testId="strac-net">損益計算書の最終的な利益</FlowCard>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 rounded-md bg-muted/40 p-3 text-xs leading-6" aria-label="税引前利益の内訳">
        <span>営業利益 {money(d.operating, unit)}{unit}</span><span>＋ 営業外損益 {money(d.nonOperating, unit)}{d.nonOperating === null ? '' : unit}</span><span>＋ 特別損益 {money(d.extraordinary, unit)}{d.extraordinary === null ? '' : unit}</span><span className="font-semibold">＝ 税引前当期利益 {money(d.pretax, unit)}{d.pretax === null ? '' : unit}</span>
      </div>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">ここまでは実績の利益です。記帳途中・決算整理未反映の場合があります。端数は四捨五入しています。円単位は「表示単位」で切り替えられます。</p>
    </div>
  </div>;
}
