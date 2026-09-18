import type { StracActual } from '@/lib/strac';

export const STRAC_UNITS = { '万円': 10000, '千円': 1000, '百万円': 1000000, '円': 1 };
export type StracUnit = keyof typeof STRAC_UNITS;
export function money(value: number | null, unit: StracUnit = '万円') {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value < 0 ? '▲' : ''}${(Math.abs(value) / STRAC_UNITS[unit]).toLocaleString('ja-JP', { maximumFractionDigits: unit === '円' ? 0 : 1 })}`;
}
export const percent = (v: number | null) => v === null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`;

/** Supplemental area view. Amounts stay outside the proportional bands. */
function StracAreaChart({ data: d, unit }: { data: StracActual; unit: StracUnit }) {
  const proportional = d.revenue > 0 && [d.variable, d.contribution, d.fixed, d.personnel, d.otherFixed, d.operating].every(v => v >= 0);
  const values = [
    { label: '売上高', value: d.revenue, color: '#cfe2f3' },
    { label: '変動費', value: d.variable, color: '#dfddd9' },
    { label: '限界利益', value: d.contribution, color: '#d9ead3' },
    { label: '固定費', value: d.fixed, color: '#fff0bd' },
    { label: '営業利益', value: d.operating, color: '#f8cbb7' },
  ];
  const y = 30, height = 280, scale = height / d.revenue;
  const block = (x: number, top: number, h: number, color: string, label: string, value: number) => (
    <g key={label}>
      <rect x={x} y={top} width={186} height={Math.max(0, h)} fill={color} stroke="#fff" strokeWidth={2} />
      <title>{`${label} ${Math.round(value).toLocaleString('ja-JP')}円`}</title>
      {h >= 44 && <text x={x + 93} y={top + h / 2 + 5} fill="#39352f" fontSize={16} textAnchor="middle" fontWeight={600}>{label}</text>}
    </g>
  );
  return <div>
    <div className="strac-chart-scroll overflow-x-auto rounded-lg border bg-white p-3">
      <svg className="strac-svg max-h-[340px] min-w-[620px] w-full" viewBox="0 0 816 347" role="img" aria-label="ストラック図：売上高を変動費・限界利益に、限界利益を固定費・営業利益に分解">
        {proportional ? <>
          {block(10, y, height, '#cfe2f3', '売上高', d.revenue)}
          {block(212, y, d.variable * scale, '#dfddd9', '変動費', d.variable)}
          {block(212, y + d.variable * scale, d.contribution * scale, '#d9ead3', '限界利益', d.contribution)}
          {block(414, y + d.variable * scale, d.fixed * scale, '#fff0bd', '固定費', d.fixed)}
          {block(414, y + (d.variable + d.fixed) * scale, d.operating * scale, '#f8cbb7', '営業利益', d.operating)}
          {block(616, y + d.variable * scale, d.personnel * scale, '#f7d6c5', '人件費', d.personnel)}
          {block(616, y + (d.variable + d.personnel) * scale, d.otherFixed * scale, '#ffe5a3', 'その他固定費', d.otherFixed)}
          <line x1={10} x2={802} y1={312} y2={312} stroke="#aca79e" />
          {['売上の全体', '売上に連動する費用', '限界利益の使い道', '固定費の内訳'].map((label, i) => <text key={label} x={103 + i * 202} y={334} fontSize={12} textAnchor="middle" fill="#706d65">{label}</text>)}
        </> : <>
          <line x1={410} x2={410} y1={10} y2={305} stroke="#aca79e" />
          {values.map((v, i) => {
            const width = Math.abs(v.value) / Math.max(1, ...values.map(item => Math.abs(item.value))) * 285;
            return <g key={v.label}><text x={10} y={40 + i * 54} fontSize={14} fill="#39352f">{v.label}</text><rect x={v.value < 0 ? 410 - width : 410} y={19 + i * 54} width={width} height={32} fill={v.value < 0 ? '#f4b6b6' : v.color} /><title>{`${v.label} ${Math.round(v.value).toLocaleString('ja-JP')}円`}</title></g>;
          })}
          <text x={410} y={329} textAnchor="middle" fontSize={12} fill="#706d65">赤字・控除項目があるため、0を基準とした符号付き表示</text>
        </>}
      </svg>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
      {values.map(v => <div key={v.label} className="rounded-md border p-3" style={{ borderTopColor: v.color, borderTopWidth: 3 }}><div className="text-xs text-muted-foreground">{v.label}</div><div className="mt-1 break-words text-lg font-bold tabular-nums" title={`${v.value.toLocaleString('ja-JP')}円`}>{money(v.value, unit)}<span className="ml-1 text-[10px] font-normal">{unit}</span></div></div>)}
    </div>
    <p className="mt-2 text-xs leading-6 text-muted-foreground">固定費の内訳：人件費 {money(d.personnel, unit)}{unit} ／ その他 {money(d.otherFixed, unit)}{unit}。金額は図の下に表示しています。</p>
  </div>;
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
export function StracChart({ data: d, unit }: { data: StracActual; unit: StracUnit }) {
  return <div className="space-y-5">
    <div data-print-block>
      <h3 className="mb-3 text-sm font-semibold">売上から、本業の利益へ</h3>
      <div className="strac-flow strac-flow-five" aria-label="売上から営業利益への計算">
        <FlowCard label="売上" term="売上高" value={d.revenue} unit={unit} tone="sales">商品・サービスの売上</FlowCard>
        <FlowCard label="変動費" value={d.variable} unit={unit} operator="−">仕入・外注など、売上に連動</FlowCard>
        <FlowCard label="限界利益" value={d.contribution} unit={unit} operator="＝" tone="margin">固定費と利益のもと</FlowCard>
        <FlowCard label="固定費" value={d.fixed} unit={unit} operator="−" tone="cost">人件費・家賃など</FlowCard>
        <FlowCard label="本業の利益" term="営業利益" value={d.operating} unit={unit} operator="＝" tone="profit">本業の費用を引いた利益</FlowCard>
      </div>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">固定費の内訳：人件費 {money(d.personnel, unit)}{unit} ／ その他 {money(d.otherFixed, unit)}{unit}。限界利益には、荷造運賃など販管費の変動費も反映します。</p>
    </div>
    <div data-print-block className="border-t pt-5">
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
    <details className="rounded-lg border p-3"><summary className="cursor-pointer text-xs font-medium">面積で費用構成を見る（ストラック図の詳細）</summary><div className="mt-3"><StracAreaChart data={d} unit={unit} /></div></details>
  </div>;
}
