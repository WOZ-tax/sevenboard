"use client";

import { useState, useMemo, useCallback } from "react";
import { useIsClient } from "@/hooks/use-is-client";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PrintButton } from "@/components/ui/print-button";
import {
  TrendingDown,
  TrendingUp,
  ShieldCheck,
  RotateCcw,
  Activity,
  Target,
  Gauge,
  Save,
  Check,
  HelpCircle,
} from "lucide-react";
import {
  Tooltip as InfoTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { formatYen } from "@/lib/format";
import { api } from "@/lib/api";
import { useCurrentOrg } from "@/contexts/current-org";
import { useAuthStore } from "@/lib/auth";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import { useVariableCost, useMfOffice } from "@/hooks/use-mf-data";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";
import { isMfNotConnected } from "@/lib/api";
import { MfEmptyState } from "@/components/ui/mf-empty-state";
import { PeriodSegmentControl } from "@/components/ui/period-segment-control";

const emptyVariableCostData = {
  revenue: 0,
  variableCosts: [] as { name: string; amount: number }[],
  fixedCosts: [] as { name: string; amount: number }[],
};

function formatRatio(value: number): string {
  if (!isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

interface IndicatorHelp {
  formula: string;
  meaning: string;
  benchmark?: string;
  caveat?: string;
}

function HelpHint({ help, label }: { help: IndicatorHelp; label: string }) {
  return (
    <InfoTooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={`${label}の説明`}
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/70 hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        }
      />
      <TooltipContent
        side="top"
        className="max-w-sm whitespace-normal bg-[var(--color-text-primary)] p-3 text-left text-[11px] leading-relaxed"
      >
        <div className="space-y-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-background/60">計算式</div>
            <div className="font-[family-name:var(--font-inter)]">{help.formula}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-background/60">意味</div>
            <div>{help.meaning}</div>
          </div>
          {help.benchmark && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-background/60">目安</div>
              <div>{help.benchmark}</div>
            </div>
          )}
          {help.caveat && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-background/60">注意点</div>
              <div>{help.caveat}</div>
            </div>
          )}
        </div>
      </TooltipContent>
    </InfoTooltip>
  );
}

const HELP_TEXT: Record<string, IndicatorHelp> = {
  marginalProfit: {
    formula: "売上高 − 変動費",
    meaning: "売上が1単位増えるごとに、固定費の回収・営業利益の源泉として残る利益。固定費を吸収できれば、それを超えた分はすべて営業利益になる。",
    benchmark: "限界利益が固定費を上回ると営業黒字、下回ると営業赤字。",
    caveat: "粗利益(売上総利益)とは別物。変動費の中には人件費の一部や外注費が含まれる場合があり、業種・分類方針で数値が変わる。",
  },
  marginalProfitRatio: {
    formula: "限界利益 ÷ 売上 × 100",
    meaning: "1円の売上に対して、固定費・営業利益に回せる金額の割合。事業モデルの収益性そのものを示す。",
    benchmark: "SaaS・サービス業60-80%、製造業30-40%、卸・小売10-30%が目安。",
    caveat: "限界利益率が低い事業は、売上を伸ばさないと固定費を吸収しきれない。販管費削減より売上拡大が先になる傾向。",
  },
  breakEvenPoint: {
    formula: "固定費 ÷ 限界利益率",
    meaning: "営業利益がちょうどゼロになる売上水準。これを超えれば営業黒字、下回れば赤字。",
    benchmark: "現売上 ÷ BEP × 100% が「損益分岐点比率」。80%以下=安全、90-100%=注意、超過=赤字。",
    caveat: "固定費が増えるとBEPは上がる。人を雇う・家賃を上げる前にこの水準を必ず確認する。",
  },
  safetyMargin: {
    formula: "(売上高 − BEP) ÷ 売上高 × 100",
    meaning: "現売上が損益分岐点からどれだけ離れているかの余裕度。売上がここまで減っても営業黒字を維持できる比率。",
    benchmark: "20%以上=安全、10-20%=注意、10%未満=危険(売上が少し減っただけで赤字転落)。",
    caveat: "業種・固定費比率で適正値が変わる。固定費が重い業種(製造業など)では低めでも仕方ない場合あり。",
  },
  deficitBuffer: {
    formula: "現売上 − BEP",
    meaning: "今の月商から、いくらまで売上が減っても営業赤字に転落しないかの絶対金額。",
    benchmark: "月商の2-3ヶ月分以上の余力があれば、季節変動にも耐えやすい。",
    caveat: "固定費が増えるとこの余力は急速に減る。採用・拡張投資の前に必ず再計算する。",
  },
  dol: {
    formula: "限界利益 ÷ 営業利益",
    meaning: "経営レバレッジ係数。売上が1%変動すると営業利益が約 DOL% 変動することを示す。固定費比率の高さの代理指標。",
    benchmark: "1.5未満=変動費型(柔軟だが利益率低め)、1.5-3=バランス型、3以上=固定費型(売上で大きく利益が動く)。",
    caveat: "営業利益が赤字または極小だと値が爆発するため計算意味なし。SaaS・装置産業はDOLが高い傾向。",
  },
  requiredAnnualSales: {
    formula: "(年換算固定費 + 目標利益) ÷ 限界利益率",
    meaning: "目標とする年間営業利益を達成するために、年間で必要な売上高。",
    benchmark: "現売上の年換算と比較し、ギャップ率10%以下=現実的、10-30%=要施策、30%超=構造改革レベル。",
    caveat: "固定費・限界利益率は現状維持を前提にした計算。固定費を圧縮したり原価率を改善する施策と組み合わせて達成可能性を上げる。",
  },
  requiredMonthlyAvgSales: {
    formula: "必要年間売上 ÷ 12",
    meaning: "目標達成に必要な月平均売上。これを継続的に上回らないと年間目標は届かない。",
    caveat: "繁閑差が大きい業種では平均では足りず、繁忙期の上振れ余地を意識する必要あり。",
  },
  monthlyGap: {
    formula: "必要月平均売上 − 現状月平均売上",
    meaning: "目標達成のために、毎月いくら売上を上乗せする必要があるか。",
    benchmark: "プラス=月商を伸ばす必要、ゼロ以下=現状ペースで目標達成可能。",
    caveat: "月商を10%以上伸ばすには通常、新規施策(価格改定・新規開拓・既存深耕)が必要。",
  },
};

function VariableCostSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}

export default function VariableCostPage() {
  const mounted = useIsClient();
  const { fiscalYear, month, periods } = usePeriodStore();
  const vcQuery = useVariableCost(fiscalYear, month);
  const office = useMfOffice();
  const periodLabel = getPeriodLabel(fiscalYear, month, periods);
  const orgId = useCurrentOrg().currentOrgId ?? "";
  const queryClient = useQueryClient();

  // 会計期首月と累計の経過月数（MF会計期間から動的取得）
  const fyStartDate = (office.data as any)?.accounting_periods?.find(
    (p: any) => p.fiscal_year === fiscalYear,
  )?.start_date ?? (office.data as any)?.accounting_periods?.[0]?.start_date;
  const fyStartMonth = fyStartDate ? Number(String(fyStartDate).slice(5, 7)) : 1;
  const isAllPeriod = month === undefined;
  const endMonth = month ?? ((fyStartMonth + 11 - 1) % 12) + 1; // 期首月の11ヶ月後 = 期末月
  const elapsedMonths = isAllPeriod
    ? 12
    : (() => {
        const diff = endMonth - fyStartMonth + 1;
        return diff > 0 ? diff : diff + 12;
      })();
  const periodRangeLabel = isAllPeriod
    ? `通期（${fyStartMonth}月〜${endMonth}月）`
    : `${fyStartMonth}月〜${endMonth}月 累計（${elapsedMonths}ヶ月）`;

  const mfNotConnected = isMfNotConnected(vcQuery.error);

  // APIデータが取れたらそれを表示、取れなければゼロ埋めでレイアウトを維持
  const sourceData: {
    revenue: number;
    variableCosts: { name: string; amount: number }[];
    fixedCosts: { name: string; amount: number }[];
  } = vcQuery.data
    ? {
        revenue: vcQuery.data.revenue as number,
        variableCosts: vcQuery.data.variableCosts as { name: string; amount: number }[],
        fixedCosts: vcQuery.data.fixedCosts as { name: string; amount: number }[],
      }
    : emptyVariableCostData;

  // デフォルト分類マップ: true=変動費, false=固定費
  const defaultClassification = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const item of sourceData.variableCosts) {
      map[item.name] = true;
    }
    for (const item of sourceData.fixedCosts) {
      map[item.name] = false;
    }
    return map;
  }, [sourceData.variableCosts, sourceData.fixedCosts]);

  // カスタム分類: 未設定(undefined)の場合はデフォルト分類を使用
  const [customClassification, setCustomClassification] = useState<Record<string, boolean>>({});

  const isVariable = useCallback(
    (name: string): boolean => {
      if (customClassification[name] !== undefined) {
        return customClassification[name];
      }
      return defaultClassification[name] ?? true;
    },
    [customClassification, defaultClassification]
  );

  const toggleClassification = useCallback(
    (name: string) => {
      setCustomClassification((prev) => ({
        ...prev,
        [name]: prev[name] !== undefined ? !prev[name] : !defaultClassification[name],
      }));
    },
    [defaultClassification]
  );

  const resetClassification = useCallback(() => {
    setCustomClassification({});
  }, []);

  const hasCustomChanges = Object.keys(customClassification).length > 0;

  // 永続化: AccountMaster に bulk PUT。成功したら variable-cost を invalidate して再取得 → デフォルトに反映
  const saveMutation = useMutation({
    mutationFn: () => {
      const updates = Object.entries(customClassification).map(([name, isVariable]) => ({
        name,
        isVariableCost: isVariable,
      }));
      return api.masters.bulkUpdateVariableCostFlags(orgId, updates);
    },
    onSuccess: () => {
      // variable-cost のキャッシュを破棄 → API再取得 → 新分類が default として反映される
      queryClient.invalidateQueries({ queryKey: ["variable-cost", orgId] });
      // セッションのカスタムを空にしておく(再取得後の defaultClassification が更新後の値になるため)
      setCustomClassification({});
    },
  });

  // 全科目リスト（変動費・固定費を統合）
  const allItems = useMemo(
    () => [...sourceData.variableCosts, ...sourceData.fixedCosts],
    [sourceData.variableCosts, sourceData.fixedCosts]
  );

  // カスタム分類に基づく再分類
  const data = useMemo(() => {
    const variableCosts = allItems.filter((item) => isVariable(item.name));
    const fixedCosts = allItems.filter((item) => !isVariable(item.name));
    return { revenue: sourceData.revenue, variableCosts, fixedCosts };
  }, [allItems, isVariable, sourceData.revenue]);

  const totalVariableCost = useMemo(
    () => data.variableCosts.reduce((sum, c) => sum + c.amount, 0),
    [data.variableCosts]
  );
  const totalFixedCost = useMemo(
    () => data.fixedCosts.reduce((sum, c) => sum + c.amount, 0),
    [data.fixedCosts]
  );
  const marginalProfit = data.revenue - totalVariableCost;
  const marginalProfitRatio = data.revenue > 0 ? (marginalProfit / data.revenue) * 100 : 0;
  const breakEvenPoint = marginalProfitRatio > 0 ? totalFixedCost / (marginalProfitRatio / 100) : 0;
  const safetyMargin = data.revenue > 0 ? ((data.revenue - breakEvenPoint) / data.revenue) * 100 : 0;
  const operatingProfit = marginalProfit - totalFixedCost;

  const chartData = useMemo(() => {
    // BEPが中央付近に来るよう、maxRevenue = max(BEP*2, 現売上*1.3)
    // BEP異常時は現売上*2にフォールバック
    const bepValid = breakEvenPoint > 0 && isFinite(breakEvenPoint);
    const rawMax = bepValid
      ? Math.max(breakEvenPoint * 2, data.revenue * 1.3)
      : data.revenue * 2;
    const maxRevenue = Math.ceil(Math.max(rawMax, 1000) / 1000) * 1000;
    const steps = 30;
    const variableCostRatio = data.revenue > 0 ? totalVariableCost / data.revenue : 0;
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const rev = (maxRevenue / steps) * i;
      const vc = rev * variableCostRatio;
      const tc = totalFixedCost + vc;
      points.push({
        revenue: Math.round(rev),
        salesLine: Math.round(rev),
        totalCost: Math.round(tc),
        fixedCostLine: totalFixedCost,
      });
    }
    return points;
  }, [data.revenue, totalVariableCost, totalFixedCost, breakEvenPoint]);

  // ============================
  // What-if シナリオ
  // ============================
  const [revenueDelta, setRevenueDelta] = useState(0); // %
  const [vcRatioDelta, setVcRatioDelta] = useState(0); // pp
  const [fixedCostDelta, setFixedCostDelta] = useState(0); // %

  const baseVcRatio = data.revenue > 0 ? totalVariableCost / data.revenue : 0;

  const whatIf = useMemo(() => {
    const newRevenue = data.revenue * (1 + revenueDelta / 100);
    const newVcRatio = Math.max(0, baseVcRatio + vcRatioDelta / 100);
    const newVc = newRevenue * newVcRatio;
    const newFc = totalFixedCost * (1 + fixedCostDelta / 100);
    const newMp = newRevenue - newVc;
    const newMpRatio = newRevenue > 0 ? (newMp / newRevenue) * 100 : 0;
    const newBep = newMpRatio > 0 ? newFc / (newMpRatio / 100) : 0;
    const newSafety = newRevenue > 0 ? ((newRevenue - newBep) / newRevenue) * 100 : 0;
    const newOp = newMp - newFc;
    const opDelta = newOp - operatingProfit;
    return {
      revenue: newRevenue,
      variableCost: newVc,
      fixedCost: newFc,
      marginalProfit: newMp,
      marginalProfitRatio: newMpRatio,
      breakEvenPoint: newBep,
      safetyMargin: newSafety,
      operatingProfit: newOp,
      operatingProfitDelta: opDelta,
    };
  }, [data.revenue, baseVcRatio, totalFixedCost, revenueDelta, vcRatioDelta, fixedCostDelta, operatingProfit]);

  const resetWhatIf = useCallback(() => {
    setRevenueDelta(0);
    setVcRatioDelta(0);
    setFixedCostDelta(0);
  }, []);

  // ============================
  // 経営体質診断
  // ============================
  // 経営レバレッジ係数（DOL）= 限界利益 / 営業利益
  const dol = operatingProfit > 0 && marginalProfit > 0 ? marginalProfit / operatingProfit : null;
  const dolType = dol === null
    ? "算出不能"
    : dol >= 3
      ? "固定費型（高レバレッジ）"
      : dol >= 1.5
        ? "バランス型"
        : "変動費型（低レバレッジ）";

  // 判定 zone（カード上の色分けとバッジで共通使用）
  type Zone = "safe" | "caution" | "danger";
  const zoneLabel: Record<Zone, string> = {
    safe: "安全",
    caution: "注意",
    danger: "危険",
  };
  const zoneTextClass: Record<Zone, string> = {
    safe: "text-green-600",
    caution: "text-yellow-600",
    danger: "text-red-600",
  };
  const zoneBorderClass: Record<Zone, string> = {
    safe: "border-l-green-500",
    caution: "border-l-yellow-500",
    danger: "border-l-red-500",
  };
  const zoneIconClass: Record<Zone, string> = {
    safe: "text-green-500",
    caution: "text-yellow-500",
    danger: "text-red-500",
  };
  const zoneBadgeClass: Record<Zone, string> = {
    safe: "bg-green-100 text-green-700 border-green-200",
    caution: "bg-yellow-100 text-yellow-700 border-yellow-200",
    danger: "bg-red-100 text-red-700 border-red-200",
  };

  // 安全余裕率: 20%以上=安全 / 10-20%=注意 / 10%未満=危険（HELP_TEXT.safetyMargin の benchmark に従う）
  const safetyZone: Zone =
    safetyMargin >= 20 ? "safe" : safetyMargin >= 10 ? "caution" : "danger";
  const safetyLabel = zoneLabel[safetyZone];

  // 損益分岐点比率 = 現売上 ÷ BEP × 100。80%以下=安全 / 80-100%=注意 / 100%超=危険
  // 損益分岐点売上高カードの主たる評価指標（HELP_TEXT.breakEvenPoint の benchmark に従う）
  const bepRatio =
    breakEvenPoint > 0 ? (data.revenue / breakEvenPoint) * 100 : 0;
  const bepZone: Zone =
    !breakEvenPoint || !Number.isFinite(bepRatio)
      ? "danger"
      : bepRatio <= 80
        ? "safe"
        : bepRatio < 100
          ? "caution"
          : "danger";
  const bepLabel = zoneLabel[bepZone];

  // 限界利益率: 業種で目安が大きく違う（SaaS 60-80% / 製造 30-40% / 卸小売 10-30%）。
  // ここは経営判断の絶対基準というより「固定費を吸収できる体質か」が本質なので、
  // 「限界利益が固定費を上回るか」で safe/caution/danger を判定する。
  // safe: 限界利益 ≥ 固定費 × 1.2（20% 以上の余裕で固定費を吸収）
  // caution: 限界利益 ≥ 固定費（黒字だが余裕薄）
  // danger: 限界利益 < 固定費（営業赤字）
  const mpZone: Zone =
    totalFixedCost <= 0
      ? "caution"
      : marginalProfit >= totalFixedCost * 1.2
        ? "safe"
        : marginalProfit >= totalFixedCost
          ? "caution"
          : "danger";
  const mpLabel = zoneLabel[mpZone];

  // 赤字転落までに必要な売上減少額
  const deficitBuffer = Math.max(0, data.revenue - breakEvenPoint);

  // ============================
  // 目標利益達成（年間ベース）
  // ============================
  const [targetProfitInput, setTargetProfitInput] = useState<string>("");
  const targetAnnualProfit = Number(targetProfitInput.replace(/[,\s]/g, "")) || 0;

  // 累計を年換算
  const annualizationFactor = elapsedMonths > 0 ? 12 / elapsedMonths : 1;
  const annualRunRateRevenue = data.revenue * annualizationFactor;
  const annualRunRateFixedCost = totalFixedCost * annualizationFactor;
  const currentMonthlyAvgSales = elapsedMonths > 0 ? data.revenue / elapsedMonths : 0;

  // 必要売上高の逆算（年間固定費は現状ペースで推定）
  const requiredAnnualSales =
    marginalProfitRatio > 0 && targetAnnualProfit > 0
      ? (annualRunRateFixedCost + targetAnnualProfit) / (marginalProfitRatio / 100)
      : 0;
  const requiredMonthlyAvgSales = requiredAnnualSales / 12;
  const monthlyGap = requiredMonthlyAvgSales - currentMonthlyAvgSales;
  const monthlyGapPct =
    currentMonthlyAvgSales > 0 ? (monthlyGap / currentMonthlyAvgSales) * 100 : 0;

  return (
    <DashboardShell>
      <TooltipProvider delay={150}>
      <div className="space-y-4">
        {/* 印刷専用ヘッダー */}
        <div className="print-only" data-print-block>
          <h1 className="text-xl font-bold">変動損益分析</h1>
          <div className="mt-1 text-sm">
            {office.data?.name || "—"} — {periodLabel || "期間未指定"}（{periodRangeLabel}）
          </div>
          <div className="mt-0.5 text-xs text-gray-600">
            出力日: {new Date().toLocaleDateString("ja-JP")}
          </div>
          <hr className="mt-2" />
        </div>

        <div className="flex items-start justify-between screen-only">
          <div>
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-[var(--color-text-primary)]" />
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
                変動損益分析
              </h1>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">{periodLabel || "期間未指定"}</p>
              <Badge variant="secondary" className="font-normal">
                {periodRangeLabel}
              </Badge>
            </div>
          </div>
          <PrintButton />
        </div>

        <PeriodSegmentControl />

        {mfNotConnected ? <MfEmptyState /> : vcQuery.isLoading ? <VariableCostSkeleton /> : <>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* 限界利益: 固定費を吸収できる体質かを判定（限界利益 vs 固定費） */}
          <Card className={cn("border-l-4", zoneBorderClass[mpZone])}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <TrendingUp className={cn("h-8 w-8 shrink-0", zoneIconClass[mpZone])} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      限界利益
                      <HelpHint label="限界利益" help={HELP_TEXT.marginalProfit} />
                    </div>
                    <Badge className={cn("border text-[10px]", zoneBadgeClass[mpZone])}>
                      {mpLabel}
                    </Badge>
                  </div>
                  <div
                    className={cn(
                      "font-[family-name:var(--font-inter)] text-2xl font-bold",
                      zoneTextClass[mpZone],
                    )}
                  >
                    {formatYen(marginalProfit)}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    限界利益率 {formatRatio(marginalProfitRatio)}
                    <HelpHint label="限界利益率" help={HELP_TEXT.marginalProfitRatio} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 損益分岐点売上高: 評価軸は損益分岐点比率（現売上 / BEP × 100）。80%以下=安全 */}
          <Card className={cn("border-l-4", zoneBorderClass[bepZone])}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <TrendingDown className={cn("h-8 w-8 shrink-0", zoneIconClass[bepZone])} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      損益分岐点売上高
                      <HelpHint
                        label="損益分岐点売上高"
                        help={HELP_TEXT.breakEvenPoint}
                      />
                    </div>
                    <Badge className={cn("border text-[10px]", zoneBadgeClass[bepZone])}>
                      {bepLabel}
                    </Badge>
                  </div>
                  <div className="font-[family-name:var(--font-inter)] text-2xl font-bold text-[var(--color-text-primary)]">
                    {formatYen(Math.round(breakEvenPoint))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    損益分岐点比率{" "}
                    <span className={cn("font-semibold", zoneTextClass[bepZone])}>
                      {Number.isFinite(bepRatio) ? formatRatio(bepRatio) : "—"}
                    </span>
                    （現売上 ÷ BEP）
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 安全余裕率: 20%以上=安全 / 10-20%=注意 / 10%未満=危険（マイナスはもちろん危険） */}
          <Card className={cn("border-l-4", zoneBorderClass[safetyZone])}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className={cn("h-8 w-8 shrink-0", zoneIconClass[safetyZone])} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      安全余裕率
                      <HelpHint label="安全余裕率" help={HELP_TEXT.safetyMargin} />
                    </div>
                    <Badge className={cn("border text-[10px]", zoneBadgeClass[safetyZone])}>
                      {safetyLabel}
                    </Badge>
                  </div>
                  <div
                    className={cn(
                      "font-[family-name:var(--font-inter)] text-2xl font-bold",
                      zoneTextClass[safetyZone],
                    )}
                  >
                    {formatRatio(safetyMargin)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    (売上高 - BEP) / 売上高
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
              損益分岐点チャート
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[400px]">
              {mounted ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="revenue" />
                    <YAxis />
                    <Tooltip
                      formatter={(value, name) => {
                        const labels: Record<string, string> = {
                          salesLine: "売上高",
                          totalCost: "総費用",
                          fixedCostLine: "固定費",
                        };
                        return [formatYen(Number(value)), labels[String(name)] || String(name)];
                      }}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="fixedCostLine" name="固定費" stroke="#94a3b8" fill="var(--color-border)" fillOpacity={0.4} />
                    <Line type="monotone" dataKey="totalCost" name="総費用" stroke="#ef4444" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="salesLine" name="売上高" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} />
                    <ReferenceDot
                      x={Math.round(breakEvenPoint)}
                      y={Math.round(breakEvenPoint)}
                      r={7}
                      fill="#ef4444"
                      stroke="#fff"
                      strokeWidth={2}
                      label={{ value: `BEP: ${formatYen(Math.round(breakEvenPoint))}`, position: "top", fontSize: 12, fill: "#ef4444" }}
                    />
                    <ReferenceLine
                      x={data.revenue}
                      stroke="var(--color-tertiary)"
                      strokeDasharray="4 4"
                      label={{ value: `現在売上 ${formatYen(data.revenue)}`, position: "top", fontSize: 11, fill: "var(--color-tertiary)" }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* 経営体質診断 + 目標利益達成 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
                <Gauge className="h-4 w-4" />
                経営体質診断
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-md border px-4 py-3">
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    安全余裕率
                    <HelpHint label="安全余裕率" help={HELP_TEXT.safetyMargin} />
                  </div>
                  <div className={cn(
                    "mt-0.5 text-lg font-bold",
                    safetyZone === "safe" && "text-green-600",
                    safetyZone === "caution" && "text-yellow-600",
                    safetyZone === "danger" && "text-red-600",
                  )}>
                    {formatRatio(safetyMargin)}
                  </div>
                </div>
                <Badge className={cn(
                  safetyZone === "safe" && "bg-green-100 text-green-700",
                  safetyZone === "caution" && "bg-yellow-100 text-yellow-700",
                  safetyZone === "danger" && "bg-red-100 text-red-700",
                )}>
                  {safetyLabel}
                </Badge>
              </div>

              {/*
                安全余裕率がマイナスのときは「黒字を維持」というメッセージは矛盾する
                （既に BEP 割れ＝赤字状態）。BEP に届かせるために必要な売上増額に
                書き換える。
              */}
              {safetyMargin >= 0 ? (
                <div className="rounded-md border px-4 py-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    赤字転落までの余力
                    <HelpHint label="赤字転落までの余力" help={HELP_TEXT.deficitBuffer} />
                  </div>
                  <div className="mt-0.5 text-lg font-bold text-[var(--color-text-primary)]">
                    {formatYen(Math.round(deficitBuffer))}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    現売上から<span className="font-semibold">{formatRatio(safetyMargin)}</span>減るまで営業利益は黒字を維持
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-red-200 bg-red-50/60 px-4 py-3">
                  <div className="flex items-center gap-1.5 text-xs text-red-700">
                    損益分岐点までの不足
                    <HelpHint
                      label="損益分岐点までの不足"
                      help={{
                        formula: "BEP − 現売上",
                        meaning:
                          "現売上が損益分岐点（BEP）に届いていない金額。これだけ売上を上乗せすれば営業利益がプラスに転じる水準。",
                        benchmark:
                          "ゼロ以下に持ち込むのが第一目標。固定費削減 or 単価/数量の改善でギャップを埋める。",
                        caveat:
                          "限界利益率が低いと同じ売上を増やしても効果が薄い。固定費見直しと併せて検討。",
                      }}
                    />
                  </div>
                  <div className="mt-0.5 text-lg font-bold text-red-700">
                    {formatYen(Math.round(breakEvenPoint - data.revenue))}
                  </div>
                  <div className="mt-1 text-xs text-red-700/80">
                    既に赤字水準。損益分岐点まで現売上を
                    <span className="font-semibold">
                      {formatRatio(Math.abs(safetyMargin))}
                    </span>
                    （{formatYen(Math.round(breakEvenPoint - data.revenue))}）
                    上乗せする必要があります。
                  </div>
                </div>
              )}

              <div className="rounded-md border px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    経営レバレッジ係数 (DOL)
                    <HelpHint label="経営レバレッジ係数" help={HELP_TEXT.dol} />
                  </div>
                  <Badge variant="secondary">{dolType}</Badge>
                </div>
                <div className="mt-0.5 text-lg font-bold text-[var(--color-text-primary)]">
                  {dol !== null ? dol.toFixed(2) : "—"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {dol !== null
                    ? `売上が1%変動すると営業利益は約${dol.toFixed(1)}%変動`
                    : "営業利益が赤字のため算出不能"}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
                <Target className="h-4 w-4" />
                目標利益達成（年間ベース）
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground">年間目標営業利益（円）</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="例: 10000000"
                  value={targetProfitInput}
                  onChange={(e) => setTargetProfitInput(e.target.value)}
                  className="mt-1"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  現状ペース: 月平均売上 {formatYen(Math.round(currentMonthlyAvgSales))} / 年換算売上 {formatYen(Math.round(annualRunRateRevenue))}
                </p>
              </div>

              <div className="rounded-md border px-4 py-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  必要年間売上高
                  <HelpHint label="必要年間売上高" help={HELP_TEXT.requiredAnnualSales} />
                </div>
                <div className="mt-0.5 text-lg font-bold text-[var(--color-text-primary)]">
                  {targetAnnualProfit > 0 && marginalProfitRatio > 0
                    ? formatYen(Math.round(requiredAnnualSales))
                    : "—"}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  (年換算固定費 {formatYen(Math.round(annualRunRateFixedCost))} + 目標利益) ÷ 限界利益率
                </div>
              </div>

              <div className="rounded-md border px-4 py-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  必要月平均売上
                  <HelpHint label="必要月平均売上" help={HELP_TEXT.requiredMonthlyAvgSales} />
                </div>
                <div className="mt-0.5 text-lg font-bold text-[var(--color-text-primary)]">
                  {targetAnnualProfit > 0 && marginalProfitRatio > 0
                    ? formatYen(Math.round(requiredMonthlyAvgSales))
                    : "—"}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  必要年間売上 ÷ 12ヶ月
                </div>
              </div>

              <div className={cn(
                "rounded-md border px-4 py-3",
                targetAnnualProfit > 0 && monthlyGap > 0 && "border-red-200 bg-red-50/30",
                targetAnnualProfit > 0 && monthlyGap <= 0 && "border-green-200 bg-green-50/30",
              )}>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  月平均ギャップ（現状 vs 必要）
                  <HelpHint label="月平均ギャップ" help={HELP_TEXT.monthlyGap} />
                </div>
                <div className={cn(
                  "mt-0.5 text-lg font-bold",
                  targetAnnualProfit > 0 && monthlyGap > 0 && "text-red-600",
                  targetAnnualProfit > 0 && monthlyGap <= 0 && "text-green-600",
                  targetAnnualProfit === 0 && "text-muted-foreground",
                )}>
                  {targetAnnualProfit > 0 && marginalProfitRatio > 0
                    ? `${monthlyGap > 0 ? "+" : ""}${formatYen(Math.round(monthlyGap))}/月`
                    : "—"}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {targetAnnualProfit > 0 && marginalProfitRatio > 0
                    ? monthlyGap > 0
                      ? `月商を${formatRatio(monthlyGapPct)}伸ばす必要あり（現状ペース継続では目標未達）`
                      : `現状ペースで年間目標を上回る見込み`
                    : "年間目標営業利益を入力してください"}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* What-if シナリオシミュレーター */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
                <Activity className="h-4 w-4" />
                What-if シナリオシミュレーター
                <Badge variant="secondary" className="font-normal text-[10px]">期間内（{periodRangeLabel}）</Badge>
              </CardTitle>
              {(revenueDelta !== 0 || vcRatioDelta !== 0 || fixedCostDelta !== 0) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs text-muted-foreground"
                  onClick={resetWhatIf}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  リセット
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* スライダー群 */}
              <div className="space-y-5">
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-sm font-medium text-[var(--color-text-primary)]">売上高</label>
                    <span className={cn(
                      "text-sm font-semibold tabular-nums",
                      revenueDelta > 0 ? "text-green-600" : revenueDelta < 0 ? "text-red-600" : "text-muted-foreground",
                    )}>
                      {revenueDelta > 0 ? "+" : ""}{revenueDelta}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-30}
                    max={30}
                    step={1}
                    value={revenueDelta}
                    onChange={(e) => setRevenueDelta(Number(e.target.value))}
                    className="w-full accent-[var(--color-primary)]"
                  />
                  <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
                    <span>-30%</span><span>0</span><span>+30%</span>
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-sm font-medium text-[var(--color-text-primary)]">変動費率</label>
                    <span className={cn(
                      "text-sm font-semibold tabular-nums",
                      vcRatioDelta < 0 ? "text-green-600" : vcRatioDelta > 0 ? "text-red-600" : "text-muted-foreground",
                    )}>
                      {vcRatioDelta > 0 ? "+" : ""}{vcRatioDelta}pt
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-10}
                    max={10}
                    step={0.5}
                    value={vcRatioDelta}
                    onChange={(e) => setVcRatioDelta(Number(e.target.value))}
                    className="w-full accent-[var(--color-primary)]"
                  />
                  <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
                    <span>-10pt</span><span>0</span><span>+10pt</span>
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-sm font-medium text-[var(--color-text-primary)]">固定費</label>
                    <span className={cn(
                      "text-sm font-semibold tabular-nums",
                      fixedCostDelta < 0 ? "text-green-600" : fixedCostDelta > 0 ? "text-red-600" : "text-muted-foreground",
                    )}>
                      {fixedCostDelta > 0 ? "+" : ""}{fixedCostDelta}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-30}
                    max={30}
                    step={1}
                    value={fixedCostDelta}
                    onChange={(e) => setFixedCostDelta(Number(e.target.value))}
                    className="w-full accent-[var(--color-primary)]"
                  />
                  <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
                    <span>-30%</span><span>0</span><span>+30%</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => { setRevenueDelta(-10); setVcRatioDelta(0); setFixedCostDelta(0); }}
                  >
                    売上10%減
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => { setRevenueDelta(10); setVcRatioDelta(0); setFixedCostDelta(0); }}
                  >
                    売上10%増
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => { setRevenueDelta(0); setVcRatioDelta(-3); setFixedCostDelta(0); }}
                  >
                    原価3pt改善
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => { setRevenueDelta(0); setVcRatioDelta(0); setFixedCostDelta(-10); }}
                  >
                    固定費10%減
                  </Button>
                </div>
              </div>

              {/* 結果パネル */}
              <div className="rounded-md border bg-muted/20 p-4">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  シミュレーション結果
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between border-b pb-2">
                    <dt className="text-muted-foreground">売上高</dt>
                    <dd className="font-semibold tabular-nums">{formatYen(Math.round(whatIf.revenue))}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">変動費</dt>
                    <dd className="tabular-nums">{formatYen(Math.round(whatIf.variableCost))}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">固定費</dt>
                    <dd className="tabular-nums">{formatYen(Math.round(whatIf.fixedCost))}</dd>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2">
                    <dt className="text-muted-foreground">限界利益率</dt>
                    <dd className="font-semibold tabular-nums text-[var(--color-tertiary)]">
                      {formatRatio(whatIf.marginalProfitRatio)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">BEP</dt>
                    <dd className="tabular-nums">{formatYen(Math.round(whatIf.breakEvenPoint))}</dd>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2">
                    <dt className="text-muted-foreground">安全余裕率</dt>
                    <dd className={cn(
                      "font-semibold tabular-nums",
                      whatIf.safetyMargin >= 20 ? "text-green-600" : whatIf.safetyMargin >= 10 ? "text-yellow-600" : "text-red-600",
                    )}>
                      {formatRatio(whatIf.safetyMargin)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <dt className="font-semibold">営業利益</dt>
                    <dd className={cn(
                      "text-lg font-bold tabular-nums",
                      whatIf.operatingProfit >= 0 ? "text-[var(--color-text-primary)]" : "text-red-600",
                    )}>
                      {formatYen(Math.round(whatIf.operatingProfit))}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between pt-0.5">
                    <dt className="text-xs text-muted-foreground">現状比</dt>
                    <dd className={cn(
                      "text-xs font-semibold tabular-nums",
                      whatIf.operatingProfitDelta > 0 ? "text-green-600" : whatIf.operatingProfitDelta < 0 ? "text-red-600" : "text-muted-foreground",
                    )}>
                      {whatIf.operatingProfitDelta > 0 ? "+" : ""}{formatYen(Math.round(whatIf.operatingProfitDelta))}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
                変動損益計算書
                <Badge variant="secondary" className="font-normal text-[10px]">{periodRangeLabel}</Badge>
                <span className="hidden text-[11px] font-normal text-muted-foreground sm:inline">
                  ／ 各行の「変動」「固定」バッジをクリックで切替
                </span>
              </CardTitle>
              <div className="flex items-center gap-2">
                {hasCustomChanges && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs text-muted-foreground"
                      onClick={resetClassification}
                      disabled={saveMutation.isPending}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      取消
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 gap-1.5 bg-[var(--color-primary)] text-xs text-white hover:bg-[var(--color-primary-hover)]"
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending || !orgId}
                    >
                      {saveMutation.isSuccess && !saveMutation.isPending ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      {saveMutation.isPending
                        ? "保存中..."
                        : `分類を保存（${Object.keys(customClassification).length}件）`}
                    </Button>
                  </>
                )}
              </div>
            </div>
            {saveMutation.isError && (
              <p className="mt-1 text-xs text-red-600">
                保存に失敗しました: {String(saveMutation.error)}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[var(--color-background)] border-b-2 border-[var(--color-border)]">
                    <TableHead className="w-56 font-semibold text-[var(--color-text-primary)]">勘定科目</TableHead>
                    <TableHead className="w-24 text-center font-semibold text-[var(--color-text-primary)]">分類</TableHead>
                    <TableHead className="w-36 text-right font-semibold text-[var(--color-text-primary)]">金額</TableHead>
                    <TableHead className="w-28 text-right font-semibold text-[var(--color-text-primary)]">構成比</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell className="font-bold text-[var(--color-text-primary)]">売上高</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-semibold">{formatYen(data.revenue)}</TableCell>
                    <TableCell className="text-right">100.0%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold text-[var(--color-text-primary)]">変動費</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell />
                  </TableRow>
                  {data.variableCosts.map((item) => (
                    <TableRow key={`v-${item.name}`}>
                      <TableCell className="pl-8 text-sm text-muted-foreground">{item.name}</TableCell>
                      <TableCell className="text-center">
                        <button
                          type="button"
                          onClick={() => toggleClassification(item.name)}
                          className="cursor-pointer"
                        >
                          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400">
                            変動
                          </Badge>
                        </button>
                      </TableCell>
                      <TableCell className="text-right text-sm">{formatYen(item.amount)}</TableCell>
                      <TableCell className="text-right text-sm">{formatRatio((item.amount / data.revenue) * 100)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2">
                    <TableCell className="font-semibold">変動費合計</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-semibold">{formatYen(totalVariableCost)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatRatio((totalVariableCost / data.revenue) * 100)}</TableCell>
                  </TableRow>
                  <TableRow className="bg-[var(--color-tertiary)]/5">
                    <TableCell className="font-bold text-[var(--color-tertiary)]">限界利益</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-bold text-[var(--color-tertiary)]">{formatYen(marginalProfit)}</TableCell>
                    <TableCell className="text-right font-bold text-[var(--color-tertiary)]">{formatRatio(marginalProfitRatio)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold text-[var(--color-text-primary)]">固定費</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell />
                  </TableRow>
                  {data.fixedCosts.map((item) => (
                    <TableRow key={`f-${item.name}`}>
                      <TableCell className="pl-8 text-sm text-muted-foreground">{item.name}</TableCell>
                      <TableCell className="text-center">
                        <button
                          type="button"
                          onClick={() => toggleClassification(item.name)}
                          className="cursor-pointer"
                        >
                          <Badge variant="secondary" className="hover:bg-muted">
                            固定
                          </Badge>
                        </button>
                      </TableCell>
                      <TableCell className="text-right text-sm">{formatYen(item.amount)}</TableCell>
                      <TableCell className="text-right text-sm">{formatRatio((item.amount / data.revenue) * 100)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2">
                    <TableCell className="font-semibold">固定費合計</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-semibold">{formatYen(totalFixedCost)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatRatio((totalFixedCost / data.revenue) * 100)}</TableCell>
                  </TableRow>
                  <TableRow className="bg-muted/50">
                    <TableCell className="font-bold text-[var(--color-text-primary)]">営業利益</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-bold text-[var(--color-text-primary)]">{formatYen(operatingProfit)}</TableCell>
                    <TableCell className="text-right font-bold">{formatRatio((operatingProfit / data.revenue) * 100)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        </>}
      </div>
      </TooltipProvider>
    </DashboardShell>
  );
}
