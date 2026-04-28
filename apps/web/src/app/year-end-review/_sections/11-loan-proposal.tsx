"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMfPL, useMfBS, useMfCashflow } from "@/hooks/use-mf-data";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

const STORAGE_KEY = "sevenboard:loan-proposal-input";

type CheckValue = "good" | "neutral" | "bad" | "unset";

interface QualitativeItem {
  id: string;
  label: string;
  value: CheckValue;
}

const DEFAULT_QUALITATIVE: QualitativeItem[] = [
  { id: "anti-social", label: "反社会的勢力との関係なし", value: "unset" },
  { id: "credit-history", label: "信用事故履歴なし", value: "unset" },
  { id: "executive-skills", label: "経営者の能力", value: "unset" },
  { id: "market-growth", label: "市場の将来性・成長性", value: "unset" },
  { id: "repayment-history", label: "過去の返済履歴", value: "unset" },
  { id: "planning-skills", label: "経営計画策定能力・財務管理能力", value: "unset" },
  { id: "sales-power", label: "販売力", value: "unset" },
  { id: "tech-power", label: "技術力", value: "unset" },
  { id: "biz-history", label: "業歴", value: "unset" },
  { id: "exec-loan-from-co", label: "代表者貸付なし", value: "unset" },
  { id: "exec-loan-to-co", label: "代表者借入なし", value: "unset" },
  { id: "exec-assets", label: "代表者の資産余力", value: "unset" },
  { id: "family-assets", label: "親族の資産余力", value: "unset" },
  { id: "real-estate", label: "不動産所有", value: "unset" },
  { id: "differentiation", label: "他社との差別化（SWOT/特許）", value: "unset" },
];

const DEFAULT_ACTUAL_NOTES = {
  uncollectableAr: "",
  obsoleteInventory: "",
  loanRecoverability: "",
};

interface FormState {
  qualitative: QualitativeItem[];
  actualNotes: typeof DEFAULT_ACTUAL_NOTES;
}

export function LoanProposalSection() {
  const pl = useMfPL();
  const bs = useMfBS();
  const cashflow = useMfCashflow();
  const [form, setForm] = useState<FormState>({
    qualitative: DEFAULT_QUALITATIVE,
    actualNotes: DEFAULT_ACTUAL_NOTES,
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 復元
        setForm((p) => ({
          qualitative: parsed.qualitative ?? p.qualitative,
          actualNotes: { ...p.actualNotes, ...(parsed.actualNotes ?? {}) },
        }));
      }
    } catch {
      // ignore
    }
     
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    } catch {
      // ignore
    }
  }, [form, hydrated]);

  // 定量指標の計算
  const metrics = useMemo(() => {
    const findPl = (key: string, exclude?: string[]): number => {
      if (!Array.isArray(pl.data)) return 0;
      const row = pl.data.find(
        (r) =>
          r.category.includes(key) &&
          (!exclude || !exclude.some((e) => r.category.includes(e))),
      );
      return row?.current ?? 0;
    };
    const findBs = (key: string): number => {
      if (!bs.data) return 0;
      const all = [...bs.data.assets, ...bs.data.liabilitiesEquity];
      const row = all.find((r) => r.category.includes(key));
      return row?.current ?? 0;
    };

    const revenue = findPl("売上高", ["原価", "総利益"]);
    const ord = findPl("経常利益");
    const cur = findBs("流動資産");
    const curLiab = findBs("流動負債");
    const eq = findBs("純資産");
    // 総資産 = 流動資産 + 固定資産 (BSに直接行が無い場合は内訳合計を使う)
    const fixedAssets = findBs("固定資産");
    const totalAssets = findBs("総資産") || cur + fixedAssets;
    const debt = findBs("短期借入金") + findBs("長期借入金");
    const cashFlowAmt =
      (cashflow.data as { runway?: { variants?: { netBurn?: { basis?: number } } } } | undefined)
        ?.runway?.variants?.netBurn?.basis ?? 0;

    return {
      currentRatio: curLiab > 0 ? cur / curLiab : 0,
      equityRatio: totalAssets > 0 ? eq / totalAssets : 0,
      gearingRatio: eq > 0 ? debt / eq : 0,
      revenueOrdinaryProfitRatio: revenue > 0 ? ord / revenue : 0,
      totalAssetReturn: totalAssets > 0 ? ord / totalAssets : 0,
      debtRepaymentYears: cashFlowAmt > 0 ? debt / cashFlowAmt : -1,
    };
  }, [pl.data, bs.data, cashflow.data]);

  const setQual = (id: string, value: CheckValue) =>
    setForm((p) => ({
      ...p,
      qualitative: p.qualitative.map((q) => (q.id === id ? { ...q, value } : q)),
    }));

  return (
    <div className="space-y-3">
      <div className="rounded-md border-l-4 border-l-blue-500 bg-blue-50/50 p-3 text-xs">
        融資審査向けの自己採点ボード。<Link href="/funding-report" className="text-[var(--color-primary)] hover:underline">
          資金調達レポート <ExternalLink className="inline h-3 w-3" />
        </Link> でAIシナリオ生成も可能です。
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card title="定量評価（MF実績ベース）">
          <table className="w-full text-xs">
            <tbody>
              <Metric
                label="流動比率"
                value={metrics.currentRatio}
                format={(v) => `${(v * 100).toFixed(0)}%`}
                threshold={(v) => (v >= 1.5 ? "good" : v >= 1.0 ? "neutral" : "bad")}
                hint="≥150%が健全"
              />
              <Metric
                label="自己資本比率"
                value={metrics.equityRatio}
                format={(v) => `${(v * 100).toFixed(1)}%`}
                threshold={(v) => (v >= 0.4 ? "good" : v >= 0.2 ? "neutral" : "bad")}
                hint="≥40%が健全"
              />
              <Metric
                label="ギアリング比率(D/E)"
                value={metrics.gearingRatio}
                format={(v) => v.toFixed(2)}
                threshold={(v) => (v <= 1 ? "good" : v <= 3 ? "neutral" : "bad")}
                hint="≤1が健全"
              />
              <Metric
                label="売上高経常利益率"
                value={metrics.revenueOrdinaryProfitRatio}
                format={(v) => `${(v * 100).toFixed(1)}%`}
                threshold={(v) => (v >= 0.05 ? "good" : v >= 0 ? "neutral" : "bad")}
                hint="≥5%が健全"
              />
              <Metric
                label="総資本経常利益率(ROA)"
                value={metrics.totalAssetReturn}
                format={(v) => `${(v * 100).toFixed(1)}%`}
                threshold={(v) => (v >= 0.05 ? "good" : v >= 0 ? "neutral" : "bad")}
                hint="≥5%が健全"
              />
              <Metric
                label="債務償還年数"
                value={metrics.debtRepaymentYears}
                format={(v) => (v < 0 ? "—" : `${v.toFixed(1)}年`)}
                threshold={(v) => (v < 0 ? "neutral" : v <= 10 ? "good" : v <= 20 ? "neutral" : "bad")}
                hint="≤10年が健全"
              />
            </tbody>
          </table>
        </Card>

        <Card title="定性評価">
          <div className="space-y-1.5 p-3 text-xs">
            {form.qualitative.map((q) => (
              <div key={q.id} className="flex items-center justify-between gap-2">
                <span className="flex-1">{q.label}</span>
                <div className="inline-flex overflow-hidden rounded border">
                  {(["good", "neutral", "bad"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setQual(q.id, q.value === v ? "unset" : v)}
                      className={cn(
                        "px-2 py-0.5 text-[10px] transition-colors",
                        q.value === v &&
                          (v === "good"
                            ? "bg-emerald-500 text-white"
                            : v === "neutral"
                              ? "bg-amber-500 text-white"
                              : "bg-rose-500 text-white"),
                        q.value !== v && "hover:bg-muted",
                      )}
                    >
                      {v === "good" ? "○" : v === "neutral" ? "△" : "×"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="実態評価（フリーフォーム）">
        <div className="grid gap-3 p-3 md:grid-cols-3">
          <NoteField
            label="回収不能売上債権の有無"
            value={form.actualNotes.uncollectableAr}
            onChange={(v) =>
              setForm((p) => ({ ...p, actualNotes: { ...p.actualNotes, uncollectableAr: v } }))
            }
          />
          <NoteField
            label="換金不能な不良在庫"
            value={form.actualNotes.obsoleteInventory}
            onChange={(v) =>
              setForm((p) => ({ ...p, actualNotes: { ...p.actualNotes, obsoleteInventory: v } }))
            }
          />
          <NoteField
            label="貸付金の回収可能性"
            value={form.actualNotes.loanRecoverability}
            onChange={(v) =>
              setForm((p) => ({ ...p, actualNotes: { ...p.actualNotes, loanRecoverability: v } }))
            }
          />
        </div>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-white shadow-sm">
      <div className="border-b px-3 py-2 text-xs font-bold text-[var(--color-primary)]">{title}</div>
      {children}
    </div>
  );
}

function Metric({
  label,
  value,
  format,
  threshold,
  hint,
}: {
  label: string;
  value: number;
  format: (v: number) => string;
  threshold: (v: number) => "good" | "neutral" | "bad";
  hint: string;
}) {
  const status = threshold(value);
  return (
    <tr>
      <td className="px-3 py-1.5 text-muted-foreground">{label}</td>
      <td className="px-3 py-1.5 text-right tabular-nums font-bold">{format(value)}</td>
      <td className="px-3 py-1.5 text-right">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-semibold",
            status === "good" && "bg-emerald-100 text-emerald-700",
            status === "neutral" && "bg-amber-100 text-amber-700",
            status === "bad" && "bg-rose-100 text-rose-700",
          )}
        >
          {status === "good" ? "良" : status === "neutral" ? "普" : "要"}
        </span>
      </td>
      <td className="px-3 py-1.5 text-right text-[10px] text-muted-foreground">{hint}</td>
    </tr>
  );
}

function NoteField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-0.5 block text-[11px] font-semibold text-muted-foreground">{label}</label>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      />
    </div>
  );
}
