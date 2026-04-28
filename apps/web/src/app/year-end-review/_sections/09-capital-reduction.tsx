"use client";

import { useEffect, useState } from "react";
import { useMfBS } from "@/hooks/use-mf-data";
import { GAIKEI_CAPITAL_RATE } from "@/lib/tax-rates-2026";

const STORAGE_KEY = "sevenboard:capital-reduction-input";
const ONE_OKU = 100_000_000;

const parseNum = (s: string): number => parseFloat(s.replace(/,/g, "")) || 0;
const fmtComma = (n: number): string =>
  Number.isFinite(n) ? Math.round(n).toLocaleString() : "0";

export function CapitalReductionSection() {
  const bs = useMfBS();
  const [capital, setCapital] = useState("0");
  const [capitalReserve, setCapitalReserve] = useState("0");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 復元
        if (p.capital) setCapital(p.capital);
         
        if (p.capitalReserve) setCapitalReserve(p.capitalReserve);
      }
    } catch {
      // ignore
    }
     
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY)) return;
    if (!bs.data) return;

    type Row = { name?: string; amount?: number; rows?: Row[] };
    const find = (rows: Row[] | undefined, key: string): Row | undefined => {
      if (!rows) return undefined;
      for (const r of rows) {
        if (r.name?.includes(key)) return r;
        const c = find(r.rows, key);
        if (c) return c;
      }
      return undefined;
    };
    const data = bs.data as { rows?: Row[] };
    const cap = find(data.rows, "資本金")?.amount ?? 0;
    const reserve = find(data.rows, "資本剰余金")?.amount ?? 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- MF実績からの初期プリセット
    if (cap) setCapital(String(cap));
     
    if (reserve) setCapitalReserve(String(reserve));
  }, [hydrated, bs.data]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ capital, capitalReserve }));
    } catch {
      // ignore
    }
  }, [capital, capitalReserve, hydrated]);

  const capitalAmount = parseNum(capital);
  const capitalEqAmount = capitalAmount + parseNum(capitalReserve);
  const isLargeCap = capitalAmount > ONE_OKU;

  const currentCapitalPortion = capitalEqAmount * GAIKEI_CAPITAL_RATE;
  const savings = currentCapitalPortion;

  return (
    <div className="space-y-4">
      <div className="rounded-md border-l-4 border-l-amber-500 bg-amber-50/50 p-3 text-xs leading-relaxed">
        <strong>外形標準課税</strong>は資本金1億円超の法人に対し、所得とは無関係に
        資本金等の額に応じて課税される（資本金割: 資本金等の額 × 0.525%）。
        中小企業特例（軽減税率15%, 交際費損金算入, 各種税額控除）の対象外にもなる。
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border bg-white shadow-sm">
          <div className="border-b px-3 py-2 text-xs font-bold text-[var(--color-primary)]">
            現状の資本構成
          </div>
          <div className="space-y-2 p-3">
            <YenField label="資本金（円）" value={capital} onChange={setCapital} />
            <YenField
              label="資本剰余金（円）"
              value={capitalReserve}
              onChange={setCapitalReserve}
            />
            <div className="border-t pt-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">資本金等の額</span>
                <span className="font-bold tabular-nums">¥{fmtComma(capitalEqAmount)}</span>
              </div>
              <div className="mt-0.5 flex justify-between">
                <span className="text-muted-foreground">外形標準課税</span>
                <span className={isLargeCap ? "font-bold text-rose-600" : "text-muted-foreground"}>
                  {isLargeCap ? "対象" : "対象外（資本金1億円以下）"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-md border bg-white shadow-sm">
          <div className="border-b px-3 py-2 text-xs font-bold text-[var(--color-primary)]">
            減資による効果試算
          </div>
          <table className="w-full text-xs">
            <thead className="text-[10px] text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left">項目</th>
                <th className="px-3 py-1.5 text-right">現状</th>
                <th className="px-3 py-1.5 text-right">減資後</th>
                <th className="px-3 py-1.5 text-right">差額</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-1.5">資本金割（年）</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  ¥{fmtComma(currentCapitalPortion)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">¥0</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">
                  −¥{fmtComma(savings)}
                </td>
              </tr>
              <tr className="border-t">
                <td className="px-3 py-1.5">中小企業特例適用</td>
                <td className="px-3 py-1.5 text-right text-rose-600">対象外</td>
                <td className="px-3 py-1.5 text-right text-emerald-700">対象</td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">
                  軽減税率15% / 交際費 / 税額控除
                </td>
              </tr>
            </tbody>
          </table>
          {isLargeCap && (
            <div className="border-t bg-emerald-50/50 px-3 py-2 text-xs">
              <strong>年間節税効果: </strong>
              <span className="font-bold text-emerald-700">¥{fmtComma(savings)}</span>
              <span className="ml-2 text-muted-foreground">
                ※法人税の軽減税率効果は別途
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-md border bg-white shadow-sm">
        <div className="border-b px-3 py-2 text-xs font-bold text-[var(--color-primary)]">
          減資の手続き
        </div>
        <ol className="space-y-1.5 p-3 text-xs leading-relaxed text-muted-foreground">
          <li>
            <strong className="text-[var(--color-text-primary)]">1. 株主総会での決議</strong> —
            外部株主には丁寧な説明が必要
          </li>
          <li>
            <strong className="text-[var(--color-text-primary)]">2. 減資額の確定と公告</strong>
          </li>
          <li>
            <strong className="text-[var(--color-text-primary)]">3. 債権者保護手続き</strong> —
            1ヶ月以上の異議申述期間
          </li>
          <li>
            <strong className="text-[var(--color-text-primary)]">4. 法務局への減資登記申請</strong>
          </li>
        </ol>
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          ※ 登記費用として、約30〜40万円ほど発生します。弊社でも登記をお受けすることが可能です。
        </div>
      </div>

      {!isLargeCap && (
        <p className="text-xs text-muted-foreground">
          現状の資本金は1億円以下のため、減資による外形標準課税回避は不要です。
        </p>
      )}
    </div>
  );
}

function YenField({
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
      <input
        type="text"
        inputMode="numeric"
        value={fmtComma(parseNum(value))}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        className="w-full rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      />
    </div>
  );
}
