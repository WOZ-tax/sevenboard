import type { StracActual } from '@/lib/strac';

export const STRAC_UNITS = { '万円': 10000, '千円': 1000, '百万円': 1000000, '円': 1 };
export type StracUnit = keyof typeof STRAC_UNITS;
export function money(value: number | null, unit: StracUnit = '万円') {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value < 0 ? '▲' : ''}${(Math.abs(value) / STRAC_UNITS[unit]).toLocaleString('ja-JP', { maximumFractionDigits: unit === '円' ? 0 : 1 })}`;
}
export const percent = (v: number | null) => v === null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`;

/** Amounts are outside the proportional bands, so even thin bands remain legible. */
export function StracChart({ data: d, unit }: { data: StracActual; unit: StracUnit }) {
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
