"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus, X } from "lucide-react";
import { useMfCashflow } from "@/hooks/use-mf-data";
import { useScopedOrgId } from "@/hooks/use-scoped-org-id";
import { usePeriodStore } from "@/lib/period-store";
import { formatYen } from "@/lib/format";
import { cn } from "@/lib/utils";

const STORAGE_BASE = "sevenboard:cf-landing-input:v1";
const storageKeyFor = (orgId: string, fy: number | undefined) =>
  `${STORAGE_BASE}:${orgId || "_"}:${fy ?? "_"}`;

type OutflowKind = "tax" | "bonus" | "capex";

interface Outflow {
  id: string;
  kind: OutflowKind;
  /** 対象年月 "YYYY-MM" */
  month: string;
  /** 金額(円) */
  amount: number;
  /** ラベル (例: 「7月決算法人税納付」「夏季賞与」「サーバー更新」) */
  label: string;
}

interface CfLandingInput {
  outflows: Outflow[];
}

const KIND_LABEL: Record<OutflowKind, string> = {
  tax: "税納付",
  bonus: "賞与",
  capex: "設備投資",
};

const KIND_COLOR: Record<OutflowKind, string> = {
  tax: "text-rose-700 bg-rose-50",
  bonus: "text-amber-700 bg-amber-50",
  capex: "text-violet-700 bg-violet-50",
};

const EMPTY_INPUT: CfLandingInput = { outflows: [] };

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function monthLabel(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const parseNum = (s: string): number => parseFloat(s.replace(/,/g, "")) || 0;
const fmtComma = (n: number): string =>
  Number.isFinite(n) ? Math.round(n).toLocaleString() : "0";

export function CashflowLandingSection() {
  const cf = useMfCashflow();
  const orgId = useScopedOrgId();
  const fiscalYear = usePeriodStore((s) => s.fiscalYear);
  const storageKey = storageKeyFor(orgId, fiscalYear);
  const [input, setInput] = useState<CfLandingInput>(EMPTY_INPUT);
  const [hydrated, setHydrated] = useState(false);
  const userEditedRef = useRef(false);

  /* eslint-disable react-hooks/set-state-in-effect -- LocalStorage 復元 */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!orgId) return;
    userEditedRef.current = false;
    setHydrated(false);
    setInput(EMPTY_INPUT);
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CfLandingInput>;
        setInput({ outflows: parsed.outflows ?? [] });
        userEditedRef.current = true;
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, [storageKey, orgId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated || !userEditedRef.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(input));
    } catch {
      // ignore
    }
  }, [input, hydrated, storageKey]);

  const updateInput = (updater: (prev: CfLandingInput) => CfLandingInput) => {
    userEditedRef.current = true;
    setInput(updater);
  };

  const summary = useMemo(() => {
    if (!cf.data) return null;
    type CfData = {
      runway?: {
        cashBalance?: number;
        variants?: { netBurn?: { months?: number; basis?: number } };
      };
    };
    const data = cf.data as CfData;
    const cashBalance = data.runway?.cashBalance ?? 0;
    const monthlyBurn = data.runway?.variants?.netBurn?.basis ?? 0;
    const runwayMonths = data.runway?.variants?.netBurn?.months ?? 0;
    return { cashBalance, monthlyBurn, runwayMonths };
  }, [cf.data]);

  // 月別予測残高 (6ヶ月)
  const forecast = useMemo(() => {
    if (!summary) return [];
    const out: Array<{
      month: string;
      balance: number;
      burn: number;
      tax: number;
      bonus: number;
      capex: number;
      delta: number;
    }> = [];
    const now = new Date();
    let runningBalance = summary.cashBalance;
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthKey = monthLabel(d);
      const monthOutflows = input.outflows.filter((o) => o.month === monthKey);
      const tax = monthOutflows
        .filter((o) => o.kind === "tax")
        .reduce((a, o) => a + o.amount, 0);
      const bonus = monthOutflows
        .filter((o) => o.kind === "bonus")
        .reduce((a, o) => a + o.amount, 0);
      const capex = monthOutflows
        .filter((o) => o.kind === "capex")
        .reduce((a, o) => a + o.amount, 0);
      const delta = -summary.monthlyBurn - tax - bonus - capex;
      runningBalance += delta;
      out.push({
        month: monthKey,
        balance: runningBalance,
        burn: summary.monthlyBurn,
        tax,
        bonus,
        capex,
        delta,
      });
    }
    return out;
  }, [summary, input.outflows]);

  // 月選択肢 (向こう6ヶ月)
  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const now = new Date();
    for (let i = 1; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      opts.push(monthLabel(d));
    }
    return opts;
  }, []);

  const addOutflow = (kind: OutflowKind) => {
    const defaultMonth = monthOptions[0] ?? monthLabel(new Date());
    updateInput((p) => ({
      ...p,
      outflows: [
        ...p.outflows,
        {
          id: uid(),
          kind,
          month: defaultMonth,
          amount: 0,
          label: "",
        },
      ],
    }));
  };

  const updateOutflow = (id: string, patch: Partial<Outflow>) =>
    updateInput((p) => ({
      ...p,
      outflows: p.outflows.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    }));

  const removeOutflow = (id: string) =>
    updateInput((p) => ({ ...p, outflows: p.outflows.filter((o) => o.id !== id) }));

  if (cf.isLoading) {
    return <div className="text-sm text-muted-foreground">読込中...</div>;
  }
  if (!summary) {
    return (
      <div className="text-sm text-muted-foreground">
        資金繰りデータが取得できませんでした。
        <Link href="/cashflow" className="ml-2 text-[var(--color-primary)] hover:underline">
          資金繰りページ <ExternalLink className="inline h-3 w-3" />
        </Link>{" "}
        で詳細を確認してください。
      </div>
    );
  }

  const lowestBalance = Math.min(...forecast.map((f) => f.balance));
  const lowestThreshold = summary.cashBalance * 0.3;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="現預金残高" value={formatYen(summary.cashBalance)} />
        <Stat label="月次Net Burn" value={formatYen(summary.monthlyBurn)} accent="rose" />
        <Stat
          label="ランウェイ"
          value={`${summary.runwayMonths.toFixed(1)}ヶ月`}
          accent={
            summary.runwayMonths >= 12
              ? "emerald"
              : summary.runwayMonths >= 6
                ? "amber"
                : "rose"
          }
        />
      </div>

      {/* 月別予定アウトフロー入力 */}
      <div className="rounded-md border bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <span className="text-xs font-bold text-[var(--color-primary)]">
            月別予定アウトフロー
          </span>
          <span className="text-[10px] text-muted-foreground">
            (税納付・賞与・設備投資など、Net Burn に上乗せされる支出)
          </span>
          <div className="ml-auto flex gap-1">
            {(["tax", "bonus", "capex"] as OutflowKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => addOutflow(k)}
                className={cn(
                  "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px]",
                  KIND_COLOR[k],
                )}
              >
                <Plus className="h-3 w-3" />
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        {input.outflows.length === 0 ? (
          <div className="px-3 py-3 text-[11px] text-muted-foreground">
            まだ予定アウトフローがありません。右上のボタンから追加してください。例:
            <span className="ml-1">税納付 (決算月の翌々月)</span>、
            <span className="ml-1">夏季賞与 (6月)</span>、
            <span className="ml-1">設備投資 (具体的月)</span>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b bg-muted/30 text-[10px] text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left">種別</th>
                <th className="px-2 py-1.5 text-left">対象月</th>
                <th className="px-2 py-1.5 text-left">ラベル</th>
                <th className="px-2 py-1.5 text-right">金額(円)</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {input.outflows.map((o) => (
                <tr key={o.id} className="border-b last:border-b-0">
                  <td className="px-2 py-1.5">
                    <span
                      className={cn(
                        "inline-block rounded px-1.5 py-0.5 text-[10px]",
                        KIND_COLOR[o.kind],
                      )}
                    >
                      {KIND_LABEL[o.kind]}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={o.month}
                      onChange={(e) => updateOutflow(o.id, { month: e.target.value })}
                      className="rounded border px-1 py-0.5 text-[11px]"
                    >
                      {monthOptions.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={o.label}
                      onChange={(e) => updateOutflow(o.id, { label: e.target.value })}
                      placeholder="メモ"
                      className="w-full rounded border px-1.5 py-0.5 text-[11px]"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={fmtComma(o.amount)}
                      onChange={(e) =>
                        updateOutflow(o.id, {
                          amount: parseNum(e.target.value.replace(/[^\d]/g, "")),
                        })
                      }
                      className="w-28 rounded border px-1.5 py-0.5 text-right text-[11px]"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => removeOutflow(o.id)}
                      className="text-muted-foreground hover:text-rose-600"
                      aria-label="削除"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="overflow-hidden rounded-md border bg-white shadow-sm">
        <div className="border-b px-3 py-2 text-xs font-bold text-[var(--color-primary)]">
          向こう6ヶ月の予測残高 (Net Burn + 予定アウトフロー)
        </div>
        <table className="w-full text-xs tabular-nums">
          <thead className="border-b bg-muted/40 text-[10px] text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left">月</th>
              <th className="px-2 py-1.5 text-right">通常Burn</th>
              <th className="px-2 py-1.5 text-right">税</th>
              <th className="px-2 py-1.5 text-right">賞与</th>
              <th className="px-2 py-1.5 text-right">設備投資</th>
              <th className="px-2 py-1.5 text-right">対前月差</th>
              <th className="px-2 py-1.5 text-right">予測残高</th>
            </tr>
          </thead>
          <tbody>
            {forecast.map((f) => {
              const isLow = f.balance < lowestThreshold;
              return (
                <tr key={f.month} className={cn("border-b last:border-b-0", isLow && "bg-rose-50/50")}>
                  <td className="px-2 py-1.5">{f.month}</td>
                  <td className="px-2 py-1.5 text-right text-rose-700">−{formatYen(f.burn)}</td>
                  <td className="px-2 py-1.5 text-right text-rose-700">
                    {f.tax > 0 ? `−${formatYen(f.tax)}` : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right text-amber-700">
                    {f.bonus > 0 ? `−${formatYen(f.bonus)}` : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right text-violet-700">
                    {f.capex > 0 ? `−${formatYen(f.capex)}` : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right text-rose-700">{formatYen(f.delta)}</td>
                  <td
                    className={cn(
                      "px-2 py-1.5 text-right font-bold",
                      f.balance < 0 && "text-rose-700",
                    )}
                  >
                    {formatYen(f.balance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {lowestBalance < 0 && (
        <div className="rounded-md border-l-4 border-l-rose-500 bg-rose-50/60 p-3 text-xs">
          <strong className="text-rose-700">警告:</strong> 6ヶ月以内に現預金が枯渇する見込みです。
          <Link href="/funding-report" className="ml-1 text-[var(--color-primary)] hover:underline">
            資金調達レポート <ExternalLink className="inline h-3 w-3" />
          </Link>
          で対策を検討してください。
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        ※ 通常 Burn は MF 連携の Net Burn 平均値。税・賞与・設備投資の月別予定額を
        手入力すると、それぞれの月に上乗せして予測残高に反映します。入力データは
        ブラウザに保存されます (顧問先・期単位)。
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "rose" | "emerald" | "amber";
}) {
  return (
    <div
      className={cn(
        "rounded-md border-l-4 bg-white p-3 shadow-sm",
        accent === "rose" && "border-l-rose-500",
        accent === "emerald" && "border-l-emerald-500",
        accent === "amber" && "border-l-amber-500",
        !accent && "border-l-blue-500",
      )}
    >
      <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
      <div className="text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}
