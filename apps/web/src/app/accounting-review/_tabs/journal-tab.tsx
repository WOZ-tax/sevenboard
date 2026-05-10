"use client";

/**
 * 仕訳レビュータブ — Phase 0: 一覧 + 期間フィルタ表示。
 *
 * このファイルのスコープ:
 *   - 既存 GET /organizations/:orgId/mf/journals を使って期間内の仕訳を取得
 *   - 期間フィルタ (今月 / 先月 / カスタム)
 *   - 一覧表 (日付 / 借方科目 / 貸方科目 / 金額 / 摘要 / 取引先)
 *
 * 次の Unit (Phase 1+) で追加:
 *   - 科目フィルタ / 金額レンジフィルタ / 未レビューフィルタ
 *   - risk-findings 検知ルールでの異常仕訳マーク
 *   - 残高調書からのドリルダウン経路 (?focusAccount= 等)
 *   - 行コメント / 差戻し / 修正履歴
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Calendar, Loader2, Search } from "lucide-react";
import { api } from "@/lib/api";
import type { MfJournal } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFyElapsed } from "@/hooks/use-fy-elapsed";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  orgId: string;
  fiscalYear: number | undefined;
  month: number | undefined;
}

/**
 * MF v3 仕訳の defensive accessor。
 * 実 shape は apps/api/src/mf/review.service.ts の writeJournalCsv 参照:
 *   - 日付: j.transaction_date (or j.date)
 *   - 摘要: branches[0].remark (or j.memo)
 *   - 取引先: branches[].debitor/creditor.trade_partner_name (journal level にはない)
 *   - 金額: branches[].debitor/creditor.value (or .amount)
 *   - 税区分: branches[].debitor/creditor.tax_name
 *   - 適格判定: branches[].debitor/creditor.invoice_kind
 */
interface MfJournalSide {
  accountName: string;
  subAccountName?: string;
  amount: number;
  taxName?: string;
  invoiceKind?: string;
  partnerName?: string;
}

interface MfJournalRow {
  id: string | null;
  issueDate: string | null;
  description: string | null;
  partnerName: string | null;
  debits: MfJournalSide[];
  credits: MfJournalSide[];
  totalAmount: number;
}

function pickString(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

function normalizeSide(side: Record<string, unknown> | undefined): MfJournalSide | null {
  if (!side) return null;
  return {
    accountName: pickString(side.account_name) ?? "—",
    subAccountName: pickString(side.sub_account_name),
    amount: Number(side.value ?? side.amount ?? 0),
    taxName: pickString(side.tax_name),
    invoiceKind: pickString(side.invoice_kind),
    partnerName: pickString(side.trade_partner_name),
  };
}

function normalizeJournal(j: MfJournal): MfJournalRow {
  const obj = j as unknown as Record<string, unknown>;
  const branches = Array.isArray(j.branches) ? j.branches : [];
  const debits: MfJournalSide[] = [];
  const credits: MfJournalSide[] = [];
  let totalAmount = 0;
  let firstRemark: string | null = null;
  let firstPartner: string | null = null;

  for (const b of branches) {
    const bo = b as Record<string, unknown>;
    // 摘要は branch.remark を優先 (journal.memo は手書きメモ的に使われる)
    if (firstRemark == null) {
      const r = pickString(bo.remark);
      if (r) firstRemark = r;
    }
    const d = normalizeSide(bo.debitor as Record<string, unknown> | undefined);
    if (d) {
      debits.push(d);
      totalAmount += d.amount;
      if (firstPartner == null && d.partnerName) firstPartner = d.partnerName;
    }
    const c = normalizeSide(bo.creditor as Record<string, unknown> | undefined);
    if (c) {
      credits.push(c);
      if (firstPartner == null && c.partnerName) firstPartner = c.partnerName;
    }
  }

  return {
    id: pickString(obj.id) ?? pickString(obj.number) ?? null,
    issueDate:
      pickString(obj.transaction_date) ??
      pickString(obj.date) ??
      pickString(obj.issue_date) ??
      null,
    description:
      firstRemark ??
      pickString(obj.memo) ??
      pickString(obj.description) ??
      null,
    partnerName:
      firstPartner ??
      pickString(obj.partner_name) ??
      pickString(obj.trade_partner_name) ??
      null,
    debits,
    credits,
    totalAmount,
  };
}

// invoice_kind を人間可読ラベルに変換。空 / NOT_TARGET は表示しない。
function invoiceKindLabel(k?: string): { label: string; className: string } | null {
  if (!k || k === "INVOICE_KIND_NOT_TARGET") return null;
  if (k === "INVOICE_KIND_QUALIFIED") {
    return { label: "適格", className: "bg-blue-50 text-blue-700 border-blue-200" };
  }
  if (k === "INVOICE_KIND_80_PERCENT") {
    return { label: "80%控除", className: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  if (k === "INVOICE_KIND_50_PERCENT") {
    return { label: "50%控除", className: "bg-orange-50 text-orange-700 border-orange-200" };
  }
  if (k === "INVOICE_KIND_NOT_QUALIFIED") {
    return { label: "不適格", className: "bg-red-50 text-red-700 border-red-200" };
  }
  // 想定外の enum もそのまま表示 (regression 検知)
  return { label: k.replace(/^INVOICE_KIND_/, ""), className: "bg-muted text-muted-foreground border-muted" };
}

// ============================================================
// 期間プリセット
// ============================================================

type RangePreset = "selectedMonth" | "thisMonth" | "lastMonth" | "custom";

function defaultRangeFor(
  preset: RangePreset,
  customStart: string,
  customEnd: string,
  selectedFy: number | undefined,
  selectedMonth: number | undefined,
  fyStartMonth: number,
): { start: string; end: string } {
  if (
    preset === "selectedMonth" &&
    selectedFy != null &&
    selectedMonth != null
  ) {
    // SevenBoard 期間セレクターで選んだ「会計年度 × 月度」を実カレンダー year-month に変換。
    // 期首月以降の月 → fiscalYear と同年。期首月より前の月 → fiscalYear + 1 (期跨ぎ)。
    const year = selectedMonth >= fyStartMonth ? selectedFy : selectedFy + 1;
    const start = new Date(year, selectedMonth - 1, 1);
    const end = new Date(year, selectedMonth, 0); // 翌月の 0 日 = 当月末日
    return { start: toISODate(start), end: toISODate(end) };
  }
  const today = new Date();
  if (preset === "thisMonth") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { start: toISODate(start), end: toISODate(end) };
  }
  if (preset === "lastMonth") {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return { start: toISODate(start), end: toISODate(end) };
  }
  return { start: customStart, end: customEnd };
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ============================================================
// メイン
// ============================================================

export function JournalReviewTab({ orgId, fiscalYear, month }: Props) {
  const searchParams = useSearchParams();
  // 残高調書からのドリルダウン: `?focusAccount=売掛金` で初期 search にセット
  const focusAccount = searchParams.get("focusAccount");
  const focusPartner = searchParams.get("partner");

  // デフォルトは SevenBoard 期間セレクター (usePeriodStore) で選んだ月度に追従。
  // 「今月」「先月」はカレンダー基準で残し、手動で切り替えたら上書き保持される。
  const [preset, setPreset] = useState<RangePreset>("selectedMonth");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [searchText, setSearchText] = useState("");

  // 会計年度の期首月を取得 (BS推移表 columns から導出)。未取得時は 1 にフォールバック。
  const { fyStartMonth } = useFyElapsed();

  // ドリルダウン経由で来た時に search を自動セット (取引先名があれば優先、なければ勘定名)
  useEffect(() => {
    const next = focusPartner || focusAccount || "";
    if (next) setSearchText(next);
  }, [focusAccount, focusPartner]);

  const range = useMemo(
    () => defaultRangeFor(preset, customStart, customEnd, fiscalYear, month, fyStartMonth),
    [preset, customStart, customEnd, fiscalYear, month, fyStartMonth],
  );
  const queryReady = !!orgId && !!range.start && !!range.end;

  const query = useQuery({
    queryKey: ["mf-journals", orgId, range.start, range.end],
    queryFn: () => api.mf.getJournals(orgId, { startDate: range.start, endDate: range.end }),
    enabled: queryReady,
    staleTime: 60 * 1000,
  });

  // risk-findings: 検知済 journal_id を背景色でハイライトするための Set を組み立て
  const riskQuery = useQuery({
    queryKey: ["risk-findings", orgId, fiscalYear, month],
    queryFn: () =>
      api.riskFindings.list(orgId, fiscalYear!, month!, "OPEN,CONFIRMED"),
    enabled: !!orgId && fiscalYear != null && month != null,
    staleTime: 60 * 1000,
  });
  // 各 finding の evidence から journal_id を抽出。
  // 現在の rule 群では LLM journal-anomaly 系が evidence.candidateJournal.id を持つ。
  // 他の rule で evidence.journalId / journalIds が後付けされても拾えるよう defensive に書く。
  const flaggedJournalIds = useMemo(() => {
    const set = new Set<string>();
    for (const f of riskQuery.data ?? []) {
      const ev = f.evidence as Record<string, unknown> | undefined;
      if (!ev) continue;
      const single = (ev as { journalId?: unknown }).journalId;
      if (typeof single === "string") set.add(single);
      const list = (ev as { journalIds?: unknown }).journalIds;
      if (Array.isArray(list)) {
        for (const v of list) if (typeof v === "string") set.add(v);
      }
      const candidate = (ev as { candidateJournal?: { id?: unknown } }).candidateJournal;
      if (candidate && typeof candidate.id === "string") set.add(candidate.id);
    }
    return set;
  }, [riskQuery.data]);

  const rows = useMemo(() => {
    const all = (query.data?.journals ?? []).map(normalizeJournal);
    if (!searchText.trim()) return all;
    const q = searchText.trim().toLowerCase();
    return all.filter(
      (r) =>
        (r.description ?? "").toLowerCase().includes(q) ||
        (r.partnerName ?? "").toLowerCase().includes(q) ||
        r.debits.some((d) => d.accountName.toLowerCase().includes(q)) ||
        r.credits.some((c) => c.accountName.toLowerCase().includes(q)),
    );
  }, [query.data, searchText]);

  if (!orgId) {
    return (
      <div className="rounded-md border border-dashed bg-muted/20 p-8 text-center">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
          顧問先を選択してください
        </h3>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* フィルタ行 */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2 text-xs">
        <div className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">期間</span>
        </div>
        <PresetButton
          current={preset}
          value="selectedMonth"
          label={
            fiscalYear != null && month != null
              ? `${fiscalYear}年${month}月度`
              : "選択月度"
          }
          onClick={setPreset}
          disabled={fiscalYear == null || month == null}
        />
        <PresetButton current={preset} value="thisMonth" label="今月" onClick={setPreset} />
        <PresetButton current={preset} value="lastMonth" label="先月" onClick={setPreset} />
        <PresetButton current={preset} value="custom" label="カスタム" onClick={setPreset} />
        {preset === "custom" && (
          <>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded border px-1.5 py-0.5 text-xs"
            />
            <span className="text-muted-foreground">〜</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded border px-1.5 py-0.5 text-xs"
            />
          </>
        )}
        {preset !== "custom" && (
          <span className="ml-1 text-muted-foreground">
            {range.start} 〜 {range.end}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="科目 / 摘要 / 取引先で絞り込み"
            className="w-56 rounded border px-2 py-0.5 text-xs"
          />
          {query.data && (
            <Badge variant="secondary" className="text-[10px]">
              {rows.length} / {query.data.journals.length} 件
            </Badge>
          )}
          {flaggedJournalIds.size > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-red-700">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border-l-2 border-red-500 bg-red-50" />
              異常検知 {flaggedJournalIds.size} 件
            </span>
          )}
        </div>
      </div>

      {/* 一覧 */}
      {query.isLoading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          仕訳を取得中…
        </div>
      ) : query.isError ? (
        <div className="rounded-md border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          仕訳の取得に失敗しました。MFクラウド会計の接続状態を確認してください。
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          指定期間に仕訳がありません
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-[var(--color-border)] bg-[var(--color-background)]">
                <th className="w-24 px-2 py-2 text-left font-semibold text-[var(--color-text-primary)]">日付</th>
                <th className="px-2 py-2 text-left font-semibold text-[var(--color-text-primary)]">借方</th>
                <th className="px-2 py-2 text-left font-semibold text-[var(--color-text-primary)]">貸方</th>
                <th className="w-32 px-2 py-2 text-right font-semibold text-[var(--color-text-primary)]">金額</th>
                <th className="px-2 py-2 text-left font-semibold text-[var(--color-text-primary)]">摘要</th>
                <th className="w-32 px-2 py-2 text-left font-semibold text-[var(--color-text-primary)]">取引先</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const flagged = r.id != null && flaggedJournalIds.has(r.id);
                return (
                  <tr
                    key={r.id ?? i}
                    className={cn(
                      "border-b border-muted/50",
                      flagged
                        ? "border-l-2 border-l-red-500 bg-red-50 hover:bg-red-100"
                        : "hover:bg-muted/30",
                    )}
                  >
                    <td className="px-2 py-1.5 text-muted-foreground tabular-nums">
                      {flagged ? (
                        <Tooltip>
                          <TooltipTrigger
                            type="button"
                            className="inline-flex items-center gap-1 bg-transparent p-0 text-inherit"
                          >
                            <AlertTriangle className="h-3 w-3 text-red-600" />
                            {r.issueDate ?? "—"}
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            AI CFO が異常を検知した仕訳
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        r.issueDate ?? "—"
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <SideCell sides={r.debits} />
                    </td>
                    <td className="px-2 py-1.5">
                      <SideCell sides={r.credits} />
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatYen(r.totalAmount)}
                    </td>
                    <td className="max-w-[280px] truncate px-2 py-1.5 text-muted-foreground" title={r.description ?? ""}>
                      {r.description ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {r.partnerName ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] italic text-muted-foreground">
        異常検知マーク・コメント・差戻しは Phase 1 以降で実装予定です。
      </p>
    </div>
  );
}

// ============================================================
// sub components
// ============================================================

function PresetButton({
  current,
  value,
  label,
  onClick,
  disabled,
}: {
  current: RangePreset;
  value: RangePreset;
  label: string;
  onClick: (v: RangePreset) => void;
  disabled?: boolean;
}) {
  const selected = current === value;
  return (
    <Button
      type="button"
      variant={selected ? "default" : "outline"}
      size="sm"
      className={cn("h-6 px-2 text-[11px]", selected && "")}
      onClick={() => onClick(value)}
      disabled={disabled}
    >
      {label}
    </Button>
  );
}

function SideCell({
  sides,
}: {
  sides: MfJournalSide[];
}) {
  if (sides.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="space-y-0.5">
      {sides.map((s, i) => {
        const inv = invoiceKindLabel(s.invoiceKind);
        return (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-[var(--color-text-primary)]">{s.accountName}</span>
            {s.subAccountName && (
              <span className="text-[10px] text-muted-foreground">/ {s.subAccountName}</span>
            )}
            {s.taxName && (
              <span className="rounded border border-muted/60 bg-muted/30 px-1 py-0 text-[9px] text-muted-foreground" title="消費税区分">
                {s.taxName}
              </span>
            )}
            {inv && (
              <span
                className={cn(
                  "rounded border px-1 py-0 text-[9px] font-medium",
                  inv.className,
                )}
                title="インボイス区分"
              >
                {inv.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatYen(n: number): string {
  return Math.round(n).toLocaleString();
}
