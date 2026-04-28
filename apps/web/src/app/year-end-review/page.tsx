"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Lock } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useFyElapsed } from "@/hooks/use-fy-elapsed";
import { useIndustryCode } from "@/hooks/use-industry-code";
import { getIndustryOptions } from "@/lib/industry-knowledge";
import type { IndustryCode } from "@/lib/industry-knowledge";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";
import { useMfOffice } from "@/hooks/use-mf-data";

import { LandingPlSection } from "./_sections/01-landing-pl";
import { CashflowLandingSection } from "./_sections/02-cashflow-landing";
import { TaxForecastSection } from "./_sections/03-tax-forecast";
import { TaxSavingPlanSection } from "./_sections/04-tax-saving-plan";
import { ExecCompSimulatorSection } from "./_sections/05-exec-comp";
import { BsCleanupSection } from "./_sections/06-bs-cleanup";
import { ScheduleSection } from "./_sections/07-schedule";
import { NextFyKpiSection } from "./_sections/08-next-fy-kpi";
import { CapitalReductionSection } from "./_sections/09-capital-reduction";
import { ConsumptionTaxFilingSection } from "./_sections/10-consumption-tax-filing";
import { LoanProposalSection } from "./_sections/11-loan-proposal";

/** 9ヶ月ゲート（メニューと整合） */
const GATE_MIN_MONTHS = 9;

const SECTIONS: Array<{
  id: string;
  num: string;
  title: string;
  component: React.ComponentType;
  /** 大資本金（1億円超）のみ表示 */
  largeCapOnly?: boolean;
}> = [
  { id: "landing-pl", num: "①", title: "当期財務サマリ（前期×当期×着地予測）", component: LandingPlSection },
  { id: "cashflow-landing", num: "②", title: "資金繰り着地予測（向こう6ヶ月）", component: CashflowLandingSection },
  { id: "tax-forecast", num: "③", title: "納税予想（法人税系 + 消費税）", component: TaxForecastSection },
  { id: "tax-saving-plan", num: "④", title: "節税アクションプラン", component: TaxSavingPlanSection },
  { id: "exec-comp", num: "⑤", title: "役員報酬シミュレーター", component: ExecCompSimulatorSection },
  { id: "bs-cleanup", num: "⑥", title: "BS整理タスクリスト", component: BsCleanupSection },
  { id: "schedule", num: "⑦", title: "決算スケジュール", component: ScheduleSection },
  { id: "next-fy-kpi", num: "⑧", title: "来期KPI設定", component: NextFyKpiSection },
  { id: "capital-reduction", num: "⑨", title: "減資の提案（資本金1億円超のみ）", component: CapitalReductionSection, largeCapOnly: true },
  { id: "consumption-tax-filing", num: "⑩", title: "消費税届出検討", component: ConsumptionTaxFilingSection },
  { id: "loan-proposal", num: "⑪", title: "融資提案ボード", component: LoanProposalSection },
];

export default function YearEndReviewPage() {
  const { elapsedMonths, remainingMonths, isReady } = useFyElapsed();
  const { fiscalYear, month, periods } = usePeriodStore();
  const periodLabel = getPeriodLabel(fiscalYear, month, periods);
  // 資本金1億円超の判定は MF office の資本金フィールド連携時に有効化。
  // それまでは全セクション表示（localhost 詰め込み中）。
  const office = useMfOffice();
  void office;
  const visibleSections = SECTIONS;

  const [activeId, setActiveId] = useState<string>(visibleSections[0]?.id ?? "");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveId(visible.target.id);
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: [0.1, 0.5] },
    );
    visibleSections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [visibleSections]);

  // localhost で詰めるとき用の dev bypass。
  // NODE_ENV=development（next dev）または ?bypass-gate=1 で強制 Open。
  const isDev =
    typeof process !== "undefined" && process.env.NODE_ENV === "development";
  const urlBypass =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("bypass-gate");
  const gateBypassed = isDev || urlBypass;

  if (!gateBypassed && isReady && elapsedMonths < GATE_MIN_MONTHS) {
    return (
      <DashboardShell>
        <div className="flex min-h-[60vh] items-center justify-center p-8">
          <Card className="max-w-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-muted-foreground" />
                決算検討は決算3ヶ月前から
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                このメニューは期首から <strong>{GATE_MIN_MONTHS}ヶ月以上</strong> 経過してから表示されます。
              </p>
              <p>
                現在: 経過 <strong className="text-foreground">{elapsedMonths}ヶ月</strong> / 決算まで{" "}
                <strong className="text-foreground">{remainingMonths}ヶ月</strong>
                {" "}（{periodLabel}）
              </p>
              <p>
                着地利益・節税・役員報酬の判断は、実績がある程度固まってからのほうが意味があります。
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="flex flex-1 gap-3 p-3">
        {/* 左サイド: アンカーナビ */}
        <aside className="hidden w-52 shrink-0 lg:block">
          <div className="sticky top-3 space-y-0.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" />
              決算検討メニュー
            </div>
            {visibleSections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={cn(
                  "block rounded px-2 py-1 text-xs transition-colors",
                  activeId === s.id
                    ? "bg-[var(--color-primary)]/10 font-semibold text-[var(--color-primary)]"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span className="mr-1">{s.num}</span>
                {s.title.replace(/（.*?）$/, "")}
              </a>
            ))}
          </div>
        </aside>

        {/* メイン */}
        <div className="min-w-0 flex-1 space-y-3">
          <PageHeader
            elapsedMonths={elapsedMonths}
            remainingMonths={remainingMonths}
            periodLabel={periodLabel}
          />
          {visibleSections.map((s) => {
            const C = s.component;
            return (
              <section
                key={s.id}
                id={s.id}
                className="scroll-mt-3 rounded-lg border bg-card p-3 shadow-sm"
              >
                <h2 className="mb-2.5 flex items-center gap-2 text-sm font-bold">
                  <span className="text-[var(--color-primary)]">{s.num}</span>
                  <span>{s.title}</span>
                </h2>
                <C />
              </section>
            );
          })}
          <FooterNote />
        </div>
      </div>
    </DashboardShell>
  );
}

function PageHeader({
  elapsedMonths,
  remainingMonths,
  periodLabel,
}: {
  elapsedMonths: number;
  remainingMonths: number;
  periodLabel: string;
}) {
  const [industryCode, setIndustryCode] = useIndustryCode();
  const options = getIndustryOptions();
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight">決算検討</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {periodLabel} ／ 期首から{elapsedMonths}ヶ月経過 ／ 決算まであと{remainingMonths}ヶ月
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">業種</span>
            <select
              value={industryCode}
              onChange={(e) => setIndustryCode(e.target.value as IndustryCode)}
              className="rounded border bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <Link
            href="/cashflow"
            className="text-[var(--color-primary)] hover:underline"
          >
            資金繰りページへ
          </Link>
        </div>
      </div>
      <p className="mt-2 rounded bg-muted/50 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
        着地利益 → 納税見込み → 節税・役員報酬 → BS整理 → 来期計画 の順で確認してください。
      </p>
    </div>
  );
}

function FooterNote() {
  return (
    <p className="px-2 py-2 text-[11px] text-muted-foreground">
      ※ 本ページの数値は MF会計実績 + 残月推計に基づくシミュレーションであり、
      実際の決算・申告税額を確約するものではありません。
    </p>
  );
}
