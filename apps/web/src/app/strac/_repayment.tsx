import Link from 'next/link';
import type { stracPlan, StracActual, StracWindow } from '@/lib/strac';
import { FlowAmount, FlowCard, money, percent, type StracUnit } from './_chart';

type Plan = ReturnType<typeof stracPlan>;
function Adjustment({ sign, label, description, value, unit }: { sign: string; label: string; description: string; value: number; unit: StracUnit }) {
  return <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b py-3 last:border-0"><div className="flex min-w-0 items-start gap-2"><span className="w-4 shrink-0 text-base font-semibold text-muted-foreground" aria-hidden="true">{sign}</span><div><p className="text-xs font-medium">{label}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{description}</p></div></div><p className="ml-6 text-sm font-semibold"><FlowAmount value={value} unit={unit} /></p></div>;
}

export function RepaymentFlow({ plan: p, actual, window: w, unit, reviewed }: { plan: Plan; actual: StracActual; window: StracWindow; unit: StracUnit; reviewed: boolean }) {
  const base = p.base;
  const negative = base.surplus !== null && base.surplus < 0;
  const scale = Math.max(1, base.availableCash, p.principal ?? 0);
  const amount = (v: number | null) => `${money(v, unit)}${v === null ? '' : unit}`;
  return <div className="mt-4 space-y-5">
    <div data-print-block className="rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">まず、実績を12か月分に置き直します</h3><span className="rounded border bg-card px-2 py-1 text-[11px]">試算期間：{w.nextStart} 〜 {w.nextEnd}</span></div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm leading-7" aria-label="実績から年間利益への換算">
        <span><span className="text-xs text-muted-foreground">{w.months}か月の経常利益 </span><strong>{amount(actual.ordinary)}</strong></span><span>÷ {w.months}か月 × 12か月</span><span>＝</span><span><span className="text-xs text-muted-foreground">年間の税引前利益 </span><strong>{amount(base.pretax)}</strong></span>
      </div>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">経常利益は本業の利益に利息などを加減した金額。一時的な特別損益を除き、同じペースが続くと仮定します。ここから想定税率 {percent(p.taxRate)} の税金 {amount(base.tax)} を引くと、年間の税引後利益は <strong className="text-foreground">{amount(base.net)}</strong> です。</p>
    </div>

    <div data-print-block>
      <h3 className="mb-3 text-sm font-semibold">① 利益を、返済に回せるお金に置き直す</h3>
      <div className="strac-cash-adjustments grid gap-4 lg:grid-cols-2" aria-label="返済原資の計算">
        <div className="rounded-lg border p-4">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">利益に、現金支出のない費用を戻す</p>
          <Adjustment sign="" label="年間の税引後利益（試算）" description="上の実績を12か月換算し、想定税率で計算" value={base.net} unit={unit} />
          <Adjustment sign="＋" label="減価償却・償却費" description="設備代などを期間に分けて費用化した金額" value={p.depreciation} unit={unit} />
          <div className="mt-2 flex flex-wrap justify-between gap-2 rounded-md bg-muted/60 p-3 text-sm font-semibold"><span>＝ 調整前のお金</span><FlowAmount value={base.simpleCash} unit={unit} /></div>
          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">減価償却の計上時には現金は出ません。設備購入の支払は「設備投資」で差し引きます。</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">事業で使うお金を調整する</p>
          <Adjustment sign="−" label="運転資金の増加" description="売掛金・在庫の増加などに必要なお金" value={p.workingCapital} unit={unit} />
          <Adjustment sign="−" label="設備投資の支払" description="設備・ソフトウェアなどの購入代金" value={p.capex} unit={unit} />
          <Adjustment sign="＋" label="その他の資金調整" description="税金の納付時期との差・配当など" value={p.otherCash} unit={unit} />
          <div className="mt-2 flex flex-wrap justify-between gap-2 rounded-md bg-muted/60 p-3 text-sm font-semibold"><span>＝ 返済に回せるお金</span><FlowAmount value={base.availableCash} unit={unit} /></div>
        </div>
      </div>
    </div>

    <div data-print-block>
      <h3 className="mb-3 text-sm font-semibold">② 元金を返したあと、いくら残る？</h3>
      <div className="strac-flow strac-flow-three strac-repayment-result" aria-label="返済後に残るお金の計算">
        <FlowCard label="返済に回せるお金" value={base.availableCash} unit={unit} tone="sales" testId="strac-available">運転資金・設備投資などを反映済み</FlowCard>
        <FlowCard label="これから返す元金" value={p.principal} unit={unit} operator="−" testId="strac-principal">{p.principal === null ? '返済予定が未確認です' : p.manualPrincipal ? '手入力した今後12か月の総額' : '返済予定表の今後12か月分'}</FlowCard>
        <FlowCard label={base.surplus === null ? '返済後に残るお金' : negative ? '返済に足りないお金' : '返済後に残るお金'} term="返済余力（試算）" value={base.surplus} unit={unit} operator="＝" tone={negative ? 'profit' : reviewed && base.surplus !== null ? 'margin' : 'neutral'} testId="strac-surplus">{base.surplus === null ? '返済額を確認すると計算できます' : negative ? 'この前提では返済資金が不足します' : 'この期間に生まれる資金から返済した残り'}</FlowCard>
      </div>
      {p.principal !== null && base.availableCash >= 0 ? <div className="mt-4 space-y-3 rounded-lg border p-4" aria-label="返済原資と元金返済の同じ目盛りでの比較">
        {[{ label: '返済に回せるお金', value: base.availableCash, color: '#b8d4bc' }, { label: 'これから返す元金', value: p.principal, color: '#c0cddc' }].map(row => <div key={row.label}><div className="mb-1 flex flex-wrap justify-between gap-2 text-xs"><span>{row.label}</span><span className="font-semibold tabular-nums">{amount(row.value)}</span></div><div className="h-3 overflow-hidden rounded-sm bg-muted"><div className="h-full" style={{ width: `${row.value / scale * 100}%`, backgroundColor: row.color }} /></div></div>)}
        <p className="text-[11px] leading-5 text-muted-foreground">2本の棒は同じ目盛り。{p.principal === 0 ? '確認済みの元金返済額は0円です。' : `返済に回せるお金は元金返済額の ${base.coverage?.toFixed(2)}倍です。`}</p>
      </div> : <p className="mt-3 text-xs leading-6 text-amber-800">{p.principal === null ? '返済額が未確認のため、過不足を判定していません。' : '返済に回せるお金がマイナスです。元金返済前から、事業に使う資金が不足する試算です。'}</p>}
      {!reviewed && <p className="mt-3 rounded-md bg-amber-50 p-3 text-xs leading-6 text-amber-900">運転資金・設備投資などは初期値0円です。下の前提を確認するまでは、仮の試算としてご覧ください。会計データや費用区分の更新後も再確認が必要です。</p>}
      <p className="mt-3 text-xs leading-6 text-muted-foreground">元金返済は費用にならないため、利益からお金に置き直して差し引きます。利息はすでに利益に含まれています。ここで残るお金は預金残高ではありません。</p>
      <div className="screen-only mt-3 flex flex-wrap gap-4 text-xs font-medium text-primary"><Link href="/loans" className="underline">返済予定を確認 →</Link><Link href="/cashflow" className="underline">月ごとの資金繰りを確認 →</Link></div>
    </div>
  </div>;
}
