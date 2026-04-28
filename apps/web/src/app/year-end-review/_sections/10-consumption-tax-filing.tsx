"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMfPL } from "@/hooks/use-mf-data";
import { usePeriodStore } from "@/lib/period-store";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

// :v2 = 旧バージョンの空フォーム自動保存バグの localStorage を無効化
const STORAGE_KEY = "sevenboard:consumption-tax-input:v2";

const parseNum = (s: string): number => parseFloat(s.replace(/,/g, "")) || 0;
const fmtComma = (n: number): string =>
  Number.isFinite(n) ? Math.round(n).toLocaleString() : "0";

interface FormState {
  /** 課税売上(税抜・円) */
  taxableSales: string;
  /** 課税仕入(税抜・円) */
  taxablePurchase: string;
  /** 業種(第1〜6種) */
  bizCategory: 1 | 2 | 3 | 4 | 5 | 6;
}

const DEFAULT_FORM: FormState = {
  taxableSales: "0",
  taxablePurchase: "0",
  bizCategory: 5,
};

const MINASHI_RATES: Record<FormState["bizCategory"], number> = {
  1: 0.9,
  2: 0.8,
  3: 0.7,
  4: 0.6,
  5: 0.5,
  6: 0.4,
};

const BIZ_LABELS: Record<FormState["bizCategory"], string> = {
  1: "第1種(卸売業)",
  2: "第2種(小売業)",
  3: "第3種(製造業等)",
  4: "第4種(その他)",
  5: "第5種(サービス業等)",
  6: "第6種(不動産業)",
};

export function ConsumptionTaxFilingSection() {
  const pl = useMfPL();
  const lockedMonth = usePeriodStore((s) => s.month);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [hydrated, setHydrated] = useState(false);
  const userEditedRef = useRef(false);

  const updateForm = (updater: (prev: FormState) => FormState) => {
    userEditedRef.current = true;
    setForm(updater);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 復元
        setForm((p) => ({ ...p, ...JSON.parse(raw) }));
        userEditedRef.current = true;
      }
    } catch {
      // ignore
    }

    setHydrated(true);
  }, []);

  // MF実績からプリセット
  useEffect(() => {
    if (!hydrated) return;
    if (userEditedRef.current) return;
    if (!Array.isArray(pl.data)) return;

    const findPl = (key: string, exclude?: string[]): number => {
      const row = pl.data!.find(
        (r) =>
          r.category.includes(key) &&
          (!exclude || !exclude.some((e) => r.category.includes(e))),
      );
      return row?.current ?? 0;
    };

    const elapsed = lockedMonth ? Math.max(1, lockedMonth) : 12;
    const annualize = (v: number) => Math.round((v / elapsed) * 12);

    // 課税売上 = 売上高(年換算)
    const sales = annualize(findPl("売上高", ["原価", "総利益"]));
    // 課税仕入 ≈ 売上原価 + 販管費 − 人件費
    // 人件費 = 役員報酬 + 給料賃金 + 賞与 + 雑給 + 法定福利費 + 福利厚生費
    const cogs = annualize(findPl("売上原価"));
    const sga = annualize(findPl("販売費及び一般管理費"));
    const laborKeys = [
      "役員報酬",
      "給料",
      "賞与",
      "雑給",
      "法定福利費",
      "福利厚生費",
    ];
    const laborTotal = laborKeys.reduce(
      (acc, k) => acc + annualize(findPl(k)),
      0,
    );
    const taxablePurchase = Math.max(0, cogs + sga - laborTotal);

    if (sales > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- MF実績からの初期プリセット
      setForm((p) => ({
        ...p,
        taxableSales: String(sales),
        taxablePurchase: String(taxablePurchase),
      }));
    }
  }, [hydrated, pl.data, lockedMonth]);

  useEffect(() => {
    if (!hydrated) return;
    if (!userEditedRef.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    } catch {
      // ignore
    }
  }, [form, hydrated]);

  const result = useMemo(() => {
    const sales = parseNum(form.taxableSales);
    const purchase = parseNum(form.taxablePurchase);
    const salesTax = sales * 0.1;
    const purchaseTax = purchase * 0.1;
    // 原則課税: 売上消費税 - 仕入消費税
    const principalPayment = Math.max(0, salesTax - purchaseTax);
    // 簡易課税: 売上消費税 × (1 - みなし仕入率)
    const minashi = MINASHI_RATES[form.bizCategory];
    const simplePayment = Math.max(0, salesTax * (1 - minashi));
    const advantage = principalPayment - simplePayment;
    return { sales, purchase, salesTax, purchaseTax, principalPayment, simplePayment, advantage };
  }, [form]);

  const useSimple = result.advantage > 0;

  return (
    <div className="space-y-3">
      <div className="rounded-md border-l-4 border-l-blue-500 bg-blue-50/50 p-3 text-xs leading-relaxed">
        基準期間（前々事業年度）の課税売上高が <strong>5,000万円以下</strong> の場合、
        原則課税方式と簡易課税方式のいずれか有利な方を選択できます。
        変更には<strong className="text-rose-600">期末までに税務署への届出書提出が必要</strong>です。
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border bg-white shadow-sm">
          <div className="border-b px-3 py-2 text-xs font-bold text-[var(--color-primary)]">
            事業計画（来期予想・税抜）
          </div>
          <div className="space-y-1.5 p-2.5">
            <YenField
              label="課税売上高（税抜・円）"
              value={form.taxableSales}
              onChange={(v) => updateForm((p) => ({ ...p, taxableSales: v }))}
            />
            <YenField
              label="課税仕入高（税抜・円）"
              value={form.taxablePurchase}
              onChange={(v) => updateForm((p) => ({ ...p, taxablePurchase: v }))}
            />
            <div>
              <label className="mb-0.5 block text-[11px] font-semibold text-muted-foreground">
                簡易課税の業種区分
              </label>
              <select
                value={form.bizCategory}
                onChange={(e) =>
                  updateForm((p) => ({ ...p, bizCategory: parseInt(e.target.value, 10) as FormState["bizCategory"] }))
                }
                className="w-full rounded border bg-white px-2 py-1.5 text-xs"
              >
                {([1, 2, 3, 4, 5, 6] as const).map((k) => (
                  <option key={k} value={k}>
                    {BIZ_LABELS[k]} (みなし仕入率 {MINASHI_RATES[k] * 100}%)
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-md border bg-white shadow-sm">
          <div className="border-b px-3 py-2 text-xs font-bold text-[var(--color-primary)]">
            原則 vs 簡易 比較
          </div>
          <table className="w-full text-xs">
            <thead className="text-[10px] text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left">項目</th>
                <th className="px-3 py-1.5 text-right">原則課税</th>
                <th className="px-3 py-1.5 text-right">簡易課税</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-1.5">売上消費税</td>
                <td className="px-3 py-1.5 text-right tabular-nums" colSpan={2}>
                  ¥{fmtComma(result.salesTax)}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5">控除対象消費税</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  −¥{fmtComma(result.purchaseTax)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  −¥{fmtComma(result.salesTax * MINASHI_RATES[form.bizCategory])}
                </td>
              </tr>
              <tr className="border-t font-bold">
                <td className="px-3 py-1.5">納付税額</td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right tabular-nums",
                    !useSimple && "bg-emerald-50/50 text-emerald-700",
                  )}
                >
                  ¥{fmtComma(result.principalPayment)}
                </td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right tabular-nums",
                    useSimple && "bg-emerald-50/50 text-emerald-700",
                  )}
                >
                  ¥{fmtComma(result.simplePayment)}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="border-t bg-muted/30 px-3 py-2 text-xs">
            {useSimple ? (
              <span className="text-emerald-700">
                <strong>簡易課税</strong>の方が <strong>¥{fmtComma(result.advantage)}</strong> 有利
              </span>
            ) : (
              <span className="text-emerald-700">
                <strong>原則課税</strong>の方が <strong>¥{fmtComma(Math.abs(result.advantage))}</strong> 有利
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-white shadow-sm">
        <div className="border-b px-3 py-2 text-xs font-bold text-[var(--color-primary)]">
          届出書の提出履歴（手動管理）
        </div>
        <div className="p-3 text-xs text-muted-foreground">
          消費税課税事業者選択届出書 / 消費税簡易課税制度選択届出書 / 消費税課税事業者選択不適用届出書 等の
          提出履歴は kintone もしくは Notion で管理してください。
          届出のタイミングを誤ると意図せぬ課税方式が適用されます。
        </div>
      </div>

      <div className="rounded-md border-l-4 border-l-amber-500 bg-amber-50/50 p-3 text-xs">
        <div className="mb-1 flex items-center gap-1.5 font-semibold text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5" />
          多額の固定資産購入予定がある場合
        </div>
        <p className="leading-relaxed text-amber-900/80">
          原則課税方式では固定資産の消費税額を控除対象額に含められるため、
          設備投資が多い期は <strong>原則課税の方が有利</strong> な場合があります。
        </p>
      </div>
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
