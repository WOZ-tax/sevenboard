"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ChartNoAxesCombined, RefreshCw, Save, BookOpen } from 'lucide-react';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PrintButton } from '@/components/ui/print-button';
import { PeriodSegmentControl } from '@/components/ui/period-segment-control';
import { useCurrentOrg } from '@/contexts/current-org';
import { useMfOffice } from '@/hooks/use-mf-data';
import { usePeriodStore } from '@/lib/period-store';
import { api } from '@/lib/api';
import { stracFingerprint, stracActual, stracBookDebt, stracPlan, stracRepayments, stracWindow, normalizeStracAssumptions, type StracAssumptions, type StracWindow } from '@/lib/strac';
import { StracChart, money, percent, STRAC_UNITS, type StracUnit } from './_chart';
import './strac.css';

const featureKey = 'strac.assumptions.v1';
const classificationKey = 'variable-cost.custom-classification';
const yen = (n: number | null) => n === null ? '—' : `${Math.round(n).toLocaleString('ja-JP')}円`;
const issueList = (issues: string[]) => <ul className="list-disc space-y-1 pl-5">{issues.map(t => <li key={t}>{t}</li>)}</ul>;

export default function StracPage() {
  const { currentOrg, currentRole } = useCurrentOrg();
  const { fiscalYear, month } = usePeriodStore();
  const office = useMfOffice();
  const period = fiscalYear === undefined ? office.data?.accounting_periods?.[0] : office.data?.accounting_periods?.find(p => p.fiscal_year === fiscalYear);
  const window = period ? stracWindow(period, month, currentOrg?.dataAsOf) : null;
  return <DashboardShell><div className="strac-page mx-auto max-w-[1320px] space-y-5 pb-10">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><ChartNoAxesCombined className="h-6 w-6 text-primary" /><h1 className="text-xl font-bold">ストラック図</h1></div><p className="mt-1 text-sm text-muted-foreground">利益のつくり方から、借入返済後に残る資金まで。</p></div>
      <div className="screen-only flex items-center gap-3"><Link href="/help/strac" className="flex items-center gap-1 text-xs text-primary underline"><BookOpen className="h-4 w-4" />使い方</Link><PrintButton /></div>
    </div>
    <div className="screen-only flex flex-wrap gap-4 text-xs text-primary md:hidden"><Link href="/" className="underline">← ダッシュボード</Link><Link href="/loans" className="underline">借入金管理</Link><Link href="/cashflow" className="underline">資金繰り</Link></div><div className="screen-only overflow-x-auto pb-1"><PeriodSegmentControl /></div>
    {!currentOrg ? <Notice>顧問先を選択してください。</Notice> : office.isPending ? <Notice>会計期間を読み込んでいます…</Notice> : office.isError ? <Notice warning>会計期間を取得できませんでした。<Button onClick={() => office.refetch()} variant="outline" size="sm">再取得</Button></Notice> : !window ? <Notice warning>年換算できる月末までの会計期間を確認できません。会計年度・月を選び直してください。月途中から始まる変則決算はこの画面では試算できません。</Notice> :
      <StracContent key={`${currentOrg.orgId}:${window.start}:${window.end}`} orgId={currentOrg.orgId} company={currentOrg.orgName} window={window} readOnly={currentRole === 'viewer'} />}
  </div></DashboardShell>;
}

function Notice({ children, warning = false }: { children: React.ReactNode; warning?: boolean }) {
  return <div role={warning ? 'alert' : 'status'} className={`rounded-lg border p-4 text-sm leading-6 ${warning ? 'border-amber-300 bg-amber-50 text-amber-950' : 'bg-card text-muted-foreground'}`}>{children}</div>;
}
function SectionTitle({ number, title, description }: { number: string; title: string; description: string }) {
  return <div className="mb-4 flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">{number}</span><div><h2 className="font-bold">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div></div>;
}
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 break-words text-2xl font-bold tabular-nums">{value}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{detail}</p></CardContent></Card>;
}
function BridgeRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm ${strong ? 'border-y bg-muted/60 px-2 font-bold' : ''}`}><span className="text-xs">{label}</span><span className="tabular-nums">{value}</span></div>;
}
function Insight({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-lg border bg-card p-4"><h3 className="flex items-start gap-2 text-sm font-semibold"><ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{title}</h3><p className="mt-2 text-xs leading-7 text-muted-foreground">{children}</p></div>;
}

function StracContent({ orgId, company, window: w, readOnly }: { orgId: string; company: string; window: StracWindow; readOnly: boolean }) {
  const qc = useQueryClient();
  const [unit, setUnit] = useState<StracUnit>('万円');
  const [draft, setDraft] = useState<StracAssumptions | null>(null);
  const scope = `${w.fiscalYear}:${w.end}`;
  const params = [orgId, w.fiscalYear, w.endMonth] as const;
  const vc = useQuery({ queryKey: ['variable-cost', ...params], queryFn: () => api.getVariableCost(...params), staleTime: 5 * 60_000 });
  const pl = useQuery({ queryKey: ['mf', 'pl', ...params], queryFn: () => api.mf.getPL(...params), staleTime: 5 * 60_000 });
  const bs = useQuery({ queryKey: ['mf', 'bs', ...params], queryFn: () => api.mf.getBS(...params), staleTime: 5 * 60_000 });
  const classQueryKey = ['yes', 'feature', orgId, classificationKey, ''];
  const classes = useQuery({ queryKey: classQueryKey, queryFn: () => api.yearEndState.getFeature<Record<string, boolean>>(orgId, classificationKey), staleTime: 5 * 60_000 });
  const savedQueryKey = ['yes', 'feature', orgId, featureKey, scope];
  const saved = useQuery({ queryKey: savedQueryKey, queryFn: () => api.yearEndState.getFeature<StracAssumptions>(orgId, featureKey, scope), staleTime: 5 * 60_000 });
  const loans = useQuery({ queryKey: ['strac', 'loan-schedules', orgId], queryFn: async () => { const list = await api.loans.list(orgId); return Promise.all(list.loans.map(loan => api.loans.get(orgId, loan.id))); }, staleTime: 60_000 });
  const save = useMutation({ mutationFn: (value: StracAssumptions) => api.yearEndState.upsertFeature(orgId, featureKey, scope, value), onSuccess: (_, value) => { qc.setQueryData(savedQueryKey, { value, updatedAt: new Date().toISOString() }); setDraft(null); } });
  const classify = useMutation({ mutationFn: (value: Record<string, boolean>) => api.yearEndState.upsertFeature(orgId, classificationKey, '', value), onSuccess: (_, value) => qc.setQueryData(classQueryKey, { value, updatedAt: new Date().toISOString() }) });
  const assumptions = draft ?? normalizeStracAssumptions(saved.data?.value);
  const set = (key: keyof StracAssumptions, value: string | boolean) => { save.reset(); setDraft({ ...assumptions, [key]: value, ...(key !== 'confirmed' ? { confirmed: false } : { confirmationBasis: basis }) }); };
  const queries = [vc, pl, bs, classes, saved, loans];
  const retry = () => { for (const q of queries) void q.refetch(); };
  const amount = (v: number | null) => `${money(v, unit)}${v === null ? '' : unit}`;
  if (vc.isError || pl.isError || classes.isError) return <Notice warning>損益または保存済みの費用区分を取得できませんでした。<div className="mt-2"><Button variant="outline" size="sm" onClick={retry}>再取得</Button></div></Notice>;
  if (!vc.data || !pl.data || classes.isPending) return <Notice>損益と費用区分を読み込んでいます…</Notice>;
  const actual = stracActual(vc.data, pl.data, classes.data?.value ?? {});
  const repayment = loans.isSuccess && bs.isSuccess && loans.data && bs.data ? stracRepayments(loans.data, w.nextStart, w.nextEnd, w.end, stracBookDebt(bs.data)) : null;
  const basis = stracFingerprint([w, actual.costs, actual.revenue, actual.ordinary, actual.net, repayment]);
  const reviewed = assumptions.confirmed && assumptions.confirmationBasis === basis;
  const plan = stracPlan(actual, w.months, assumptions, repayment?.complete ? repayment.principal : null);
  const validPlan = plan.issues.length === 0 && saved.isSuccess;
  const complete = validPlan && plan.principal !== null && reviewed && (plan.manualPrincipal || !!repayment?.complete);
  const sourceReady = actual.issues.length === 0;
  const delta = plan.scenario.surplus !== null && plan.base.surplus !== null ? plan.scenario.surplus - plan.base.surplus : null;
  const status = !validPlan ? '入力・集計を確認' : plan.principal === null ? '返済額を確認' : !complete ? '前提を確認して試算' : plan.base.surplus! < 0 ? 'この前提では資金不足' : 'この前提では余力あり';
  const field = (key: Exclude<keyof StracAssumptions, 'confirmed' | 'confirmationBasis'>, label: string, hint: string, placeholder?: string) => <label className="block text-xs leading-5" key={key}><span className="font-medium">{label}</span><input type="number" aria-label={label} step="any" value={assumptions[key]} onChange={e => set(key, e.target.value)} disabled={saved.isPending || saved.isError || save.isPending} placeholder={placeholder} className="mt-1 block h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm tabular-nums disabled:opacity-50" /><span className="mt-1 block text-[11px] leading-5 text-muted-foreground">{hint}</span></label>;

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs"><div><p className="font-semibold">{company}</p><p className="mt-1 text-muted-foreground">実績：{w.start} 〜 {w.end}（{w.months}か月累計）</p></div><div className="screen-only flex items-center gap-3"><label>表示単位 <select aria-label="表示単位" value={unit} onChange={e => setUnit(e.target.value as StracUnit)} className="ml-1 rounded border bg-card p-2">{Object.keys(STRAC_UNITS).map(u => <option key={u}>{u}</option>)}</select></label><Button variant="outline" size="sm" onClick={retry} disabled={queries.some(q => q.isFetching)}><RefreshCw className="h-3.5 w-3.5" />再取得</Button></div></div>
    {w.capped && <Notice>未経過の月を含めず、{w.end}までの月末実績を表示しています。</Notice>}
    {!sourceReady && <Notice warning>{issueList(actual.issues)}<p className="mt-2">P/Lとの一致を確認するまで、返済余力の試算を保留します。</p></Notice>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="売上100円から残る限界利益" value={actual.margin === null ? '—' : `${(actual.margin * 100).toFixed(1)}円`} detail="売上 − 変動費。固定費と利益の原資です。" />
      <Metric label="損益分岐点売上高" value={amount(actual.breakEven)} detail="営業利益が0になる売上。表示実績期間の金額。" />
      <Metric label="経営安全率" value={percent(actual.safetyMargin)} detail="現在の売上が損益分岐点を上回る割合。" />
      <Metric label="労働分配率" value={percent(actual.laborShare)} detail="固定費に区分した人件費 ÷ 限界利益。" />
    </div>
    <Card><CardContent className="p-4 sm:p-6">
      <SectionTitle number="01" title="売上は、どこで利益になるか" description="MFの損益を変動費・固定費に組み替えます。「変動損益」の保存済み区分と連動します。" />
      {[actual.revenue, actual.variable, actual.fixed, actual.operating].every(Number.isFinite) ? <StracChart data={actual} unit={unit} /> : <Notice warning>図を描画できる数値を取得できませんでした。</Notice>}
      <div className="mt-4 grid gap-2 rounded-lg bg-muted/60 p-4 sm:grid-cols-5" aria-label="営業利益から当期純利益へのつながり">
        {([['営業利益', actual.operating], ['営業外損益', actual.nonOperating], ['特別損益', actual.extraordinary], ['法人税等', actual.tax], ['当期純利益', actual.net]] as const).map(([label, v], i) => <div key={label} className="min-w-0"><p className="text-[11px] text-muted-foreground">{i > 0 ? i === 3 ? '− ' : i === 4 ? '= ' : '+ ' : ''}{label}</p><p className="mt-1 break-words text-sm font-bold tabular-nums">{amount(v)}</p></div>)}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">税引前利益 {amount(actual.pretax)}。記帳途中・決算整理未反映の数値を含む場合があります。限界利益は粗利とは異なります。荷造運賃など、販管費の変動費も差し引きます。</p>
    </CardContent></Card>
    {sourceReady && <div className="grid gap-3 lg:grid-cols-3">
      <Insight title="売上を増やす前に、残る割合を見る">{actual.margin !== null && actual.margin > 0 ? <>同じ費用構成で売上が100万円増えると、固定費が増えなければ営業利益は約{amount(actual.margin * 1_000_000)}増えます。値引きや追加の人員・物流費をセットで確認しましょう。</> : <>限界利益がプラスになっていません。売上拡大だけでは改善しないため、販売単価・仕入条件・費用区分を先に確認します。</>}</Insight>
      <Insight title="固定費を支える売上の幅をつかむ">{actual.breakEven !== null ? <>現在の売上は損益分岐点を{amount(Math.abs(actual.revenue - actual.breakEven))}{actual.revenue >= actual.breakEven ? '上回っています' : '下回っています'}。{actual.safetyMargin !== null && actual.safetyMargin >= 0 ? `同じ限界利益率なら、売上が約${percent(actual.safetyMargin)}減ると営業利益が0になります。` : '限界利益の増加または固定費の見直しが必要です。'}</> : <>限界利益率が0以下などのため、損益分岐点を算出できません。費用の区分と採算を確認します。</>}</Insight>
      <Insight title="利益と返済原資の差に注目する">借入元金の返済は費用になりません。利益に減価償却費を戻し、在庫・売掛金の増加や設備投資で使う資金を引いたうえで、下の返済予定額と比較します。</Insight>
    </div>}
    <Card><CardContent className="p-4 sm:p-6">
      <SectionTitle number="02" title="利益は、借入返済をどこまで支えられるか" description={`今後12か月の試算：${w.nextStart} 〜 ${w.nextEnd}。実績の月平均 × 12を基準に、返済予定表の同じ12か月と比較します。`} />
      <div className="mb-4 flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${complete && plan.base.surplus! >= 0 ? 'bg-green-100 text-green-900' : 'bg-amber-100 text-amber-950'}`}>{status}</span><span className="text-xs text-muted-foreground">{plan.manualPrincipal ? '元金返済額は手入力' : '借入金管理の返済予定表と連動'}</span></div>
      {(loans.isPending || bs.isPending) && <Notice>返済予定表と基準月の帳簿残高を照合しています…</Notice>}
      {(loans.isError || bs.isError) && <Notice warning>返済予定表または帳簿残高を取得できませんでした。元金返済額は未確認です。「再取得」または確認済みの年間返済額を入力してください。</Notice>}
      {repayment && !repayment.complete && <Notice warning>{issueList(repayment.issues)}<Link href="/loans" className="mt-2 inline-block underline">借入金管理で確認する</Link></Notice>}
      {repayment?.estimated && <p className="mb-3 text-xs text-amber-800">返済予定表に推定した金額が含まれています。銀行の予定表と照合してください。</p>}
      {validPlan ? <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-lg border p-4" aria-label="返済原資の計算">
          <BridgeRow label="年換算の税引後利益（試算）" value={amount(plan.base.net)} /><BridgeRow label="＋ 減価償却・償却費" value={amount(plan.depreciation)} /><BridgeRow label="＝ 簡易返済原資" value={amount(plan.base.simpleCash)} strong />
          <BridgeRow label="− 運転資金の増加" value={amount(plan.workingCapital)} /><BridgeRow label="− 設備投資の支払" value={amount(plan.capex)} /><BridgeRow label="＋ その他の資金調整" value={amount(plan.otherCash)} /><BridgeRow label="＝ 元金返済に回せる資金" value={amount(plan.base.availableCash)} strong /><BridgeRow label="− 今後12か月の元金返済" value={amount(plan.principal)} />
        </div>
        <div data-print-block className="flex flex-col justify-center rounded-lg border bg-muted/40 p-5"><p className="text-sm font-semibold">返済後に残る資金（試算）</p><p data-testid="strac-surplus" className={`mt-3 break-words text-3xl font-bold tabular-nums ${plan.base.surplus !== null && plan.base.surplus < 0 ? 'text-red-700' : 'text-primary'}`}>{amount(plan.base.surplus)}</p>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">{plan.base.coverage === null ? plan.principal === 0 ? '登録・確認済みの元金返済額は0円です。倍率は表示しません。' : '返済額が未確認のため、過不足を判定していません。' : `元金返済カバー倍率 ${plan.base.coverage.toFixed(2)}倍（返済可能資金 ÷ 元金返済額）`}</p>
          {!reviewed && <p className="mt-3 text-xs leading-6 text-amber-800">運転資金・設備投資などは初期値0円です。下の前提を確認してください。会計データや費用区分が更新された場合も再確認が必要です。</p>}
          <div className="mt-4 border-t pt-3 text-xs leading-6 text-muted-foreground">手元預金の残高ではなく、この12か月に事業から生まれる資金の試算です。月ごとの支払時期は「資金繰り」で確認します。</div>
          <div className="screen-only mt-4 flex flex-wrap gap-4 text-xs font-medium text-primary"><Link href="/loans" className="underline">借入金管理へ →</Link><Link href="/cashflow" className="underline">資金繰りへ →</Link></div>
        </div>
      </div> : <Notice warning>{saved.isPending ? '保存済みの前提を読み込んでいます…' : saved.isError ? '保存済みの前提を取得できないため試算を保留しています。再取得してください。' : issueList(plan.issues)}</Notice>}
      <p className="mt-3 text-xs leading-6 text-muted-foreground">想定税率 {percent(plan.taxRate)} ／ 年換算係数 {plan.factor.toFixed(2)}倍。特別損益は翌年に繰り返さず、営業外損益は実績の年換算を使います。支払利息は利益に含まれるため、元金と一緒に二重控除しません。季節性・今後の金利変更・税金の均等割や納付時期は別途調整してください。</p>
      <details className="mt-4 rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">返済額の内訳と帳簿との照合</summary>
        {repayment ? <div className="mt-3 text-xs leading-6"><p>基準日 {w.end}：予定表残高 {yen(repayment.balance)} ／ 帳簿借入残高 {yen(bs.data ? stracBookDebt(bs.data) : null)}</p>{repayment.rows.length > 0 ? <div className="mt-2 space-y-2">{repayment.rows.map(r => <div key={r.id} className="flex flex-wrap justify-between gap-2 rounded bg-muted p-2"><Link href={`/loans/${r.id}`} className="underline">{r.name}</Link><span>元金 {yen(r.principal)} ／ 利息 {yen(r.interest)}（参考）</span></div>)}</div> : <p>登録された借入はありません。</p>}{plan.manualPrincipal && <p className="mt-2 text-amber-800">試算には、手入力の元金返済額 {yen(plan.principal)}を使用しています。</p>}</div> : <p className="mt-3 text-xs text-muted-foreground">返済額の取得・照合が完了していません。</p>}
      </details>
      <div className="strac-inputs mt-5 border-t pt-5"><h3 className="text-sm font-bold">返済余力の前提を調整する <span className="font-normal text-muted-foreground">（すべて今後12か月・円）</span></h3>
        {saved.isError && <Notice warning>保存済みの前提を取得できませんでした。再取得するまで入力・保存を停止しています。</Notice>}
        <div className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {field('taxRate', '想定税率（%）', '初期値30%の仮定。税務調整・均等割を含まない概算です。')}
          {field('depreciation', '減価償却・償却費（円／年）', actual.depreciationFound ? `空欄は科目内訳の年換算 ${yen(actual.depreciation * 12 / w.months)}` : '該当科目がないため初期値0円。未計上の償却費を確認してください。', String(Math.round(actual.depreciation * 12 / w.months)))}
          {field('principal', '元金返済額（円／年）', '空欄は照合済み予定表。未登録分があれば年間総額を入力。', repayment?.complete ? String(repayment.principal) : '予定表の照合待ち')}
          {field('workingCapital', '運転資金の増加（円／年）', '売掛金＋在庫−買掛金などの増加額。減少ならマイナス。')}
          {field('capex', '設備投資の支払（円／年）', '新しい設備・ソフトウェア等に支払う資金。')}
          {field('otherCash', 'その他の資金調整（円／年）', '資金増はプラス、資金減はマイナス。税金の計上・納付差、配当など。')}
        </div>
        <label className="screen-only mt-4 flex items-start gap-2 rounded-md bg-muted/60 p-3 text-xs leading-6"><input type="checkbox" className="mt-1" checked={reviewed} disabled={saved.isPending || saved.isError || save.isPending} onChange={e => set('confirmed', e.target.checked)} />想定税率・償却費・返済予定・運転資金・投資・その他の調整を確認した（変更後は再確認）</label>
      </div>
    </CardContent></Card>
    <Card><CardContent className="p-4 sm:p-6">
      <SectionTitle number="03" title="何を変えると、返済余力が増えるか" description="同じ12か月の前提で改善前後を比較します。限界利益率と固定費を一定とする簡易モデルです。" />
      <div className="strac-inputs grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {field('salesChange', '売上の増減率（%）', '年換算売上に対する増減。値下げによる費用率の変化は右欄も調整。')}
        {field('marginChange', '限界利益率の改善（ポイント）', '例：28%→30%なら「2」。仕入条件・販売構成の見直し。')}
        {field('fixedReduction', '固定費の削減額（円／年）', '支出を伴う費用の削減。償却費も変える場合は前提欄も調整。')}
        {field('retainedCash', '返済後に残したい資金（円／年）', '下の「必要売上高」に反映します。')}
      </div>
      {validPlan ? <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <Metric label="改善後の返済余力" value={amount(plan.scenario.surplus)} detail={`改善前 ${amount(plan.base.surplus)} → 差額 ${amount(delta)}`} />
        <Metric label="返済と目標資金を満たす必要売上高" value={amount(plan.scenario.requiredRevenue)} detail={plan.scenario.requiredRevenue === null ? '元金返済額の確認と、プラスの限界利益率が必要です。' : `改善後の限界利益率 ${percent(plan.scenario.margin)}・固定費 ${amount(plan.scenario.fixed)}で逆算。`} />
        <Metric label="改善シナリオの年間売上" value={amount(plan.scenario.revenue)} detail={plan.scenario.requiredRevenue === null ? '必要売上高は未算出です。' : plan.scenario.revenue >= plan.scenario.requiredRevenue ? `必要売上を ${amount(plan.scenario.revenue - plan.scenario.requiredRevenue)}上回る計画です。` : `目標まで、さらに ${amount(plan.scenario.requiredRevenue - plan.scenario.revenue)}の売上が必要です。`} />
      </div> : <div className="mt-4"><Notice warning>{saved.isPending ? '保存済みの前提を読み込んでいます…' : saved.isError ? '保存済みの前提を取得できないため試算を保留しています。再取得してください。' : issueList(plan.issues)}</Notice></div>}
      {validPlan && <p className="mt-3 text-xs leading-6 text-muted-foreground">改善後：営業利益 {amount(plan.scenario.operating)}、税引後利益 {amount(plan.scenario.net)}。運転資金・償却費・設備投資・借入返済額は前提欄の金額を据え置いています。増収に伴って在庫や売掛金が増える場合は、運転資金も増やして確認してください。</p>}
      <div className="screen-only mt-4 flex flex-wrap items-center gap-3 border-t pt-4"><Button disabled={readOnly || !draft || saved.isPending || saved.isError || save.isPending || !validPlan} onClick={() => save.mutate(assumptions)}><Save className="h-4 w-4" />{save.isPending ? '保存中…' : 'この期間の前提を保存'}</Button>{draft && <Button variant="outline" onClick={() => { setDraft(null); save.reset(); }} disabled={save.isPending}>未保存の変更を戻す</Button>}<span role="status" className="text-xs text-muted-foreground">{readOnly ? '閲覧権限のため保存できません。' : save.isError ? '保存できませんでした。入力は未保存です。再試行してください。' : draft ? '未保存：期間を切り替える前に保存してください。' : save.isSuccess ? '保存しました。' : '保存すると、この会社・基準月の前提を共有できます。'}</span></div>
    </CardContent></Card>
    <details className="rounded-lg border bg-card p-4"><summary className="cursor-pointer text-sm font-semibold">費用の区分を確認・変更する（変動損益と共通）</summary><p className="mt-2 text-xs leading-6 text-muted-foreground">変更は会社単位で保存し、全期間の変動損益とストラック図に反映します。固定費のうち給与・福利厚生等を人件費に集計します。製造原価が合算されている場合、人件費・償却費の詳細は元帳で確認してください。</p>
      {classify.isError && <Notice warning>区分を保存できませんでした。再試行してください。</Notice>}
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b text-muted-foreground"><th className="p-2">勘定科目</th><th className="p-2 text-right">金額（円）</th><th className="p-2">区分</th></tr></thead><tbody>{actual.costs.map(c => <tr className="border-b" key={c.name}><td className="p-2">{c.name}</td><td className="p-2 text-right tabular-nums">{yen(c.amount)}</td><td className="p-2"><span className="print-only">{c.variable ? '変動費' : c.personnel ? '固定費（人件費）' : '固定費'}</span><select aria-label={`${c.name}の区分`} disabled={readOnly || classify.isPending} value={c.variable ? 'variable' : 'fixed'} onChange={e => classify.mutate({ ...(classes.data?.value ?? {}), [c.name]: e.target.value === 'variable' })} className="rounded border bg-background p-2"><option value="variable">変動費</option><option value="fixed">{c.personnel ? '固定費（人件費）' : '固定費'}</option></select></td></tr>)}</tbody></table></div>
    </details>
    <details className="rounded-lg border bg-card p-4 text-xs leading-6"><summary className="cursor-pointer text-sm font-semibold">計算式と読み方</summary><div className="mt-3 space-y-2"><p>限界利益＝売上−変動費。営業利益＝限界利益−固定費。損益分岐点売上高＝固定費÷限界利益率。限界利益率が0以下なら、売上増加だけで利益を出す計算はできません。</p><p>年換算の税引後利益＝（年換算営業利益＋年換算営業外損益）−max（税引前利益, 0）×想定税率。減価償却等を戻し、運転資金増加・設備投資を控除してその他調整を加え、元金返済額を差し引きます。</p><p>必要売上高は、返済後資金が目標資金以上になるように逆算します。固定費・限界利益率・税率・資金調整が一定という前提で、赤字の場合も税金を負の値にしません。カバー倍率は融資審査や将来の返済を保証するものではありません。</p><p>参照：<a className="text-primary underline" href="https://www.jfc.go.jp/n/finance/keiei/support-plus/detail/materials.html?id=444" target="_blank" rel="noopener noreferrer">日本政策金融公庫「利益と預金残高の違い」</a> ／ <a className="text-primary underline" href="https://j-net21.smrj.go.jp/solution/qa/accounting/Q0240.html" target="_blank" rel="noopener noreferrer">中小機構 J-Net21「損益分岐点」</a></p></div></details>
  </>;
}
