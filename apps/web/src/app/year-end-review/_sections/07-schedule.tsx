"use client";

import { useEffect, useMemo, useState } from "react";
import { useMfOffice } from "@/hooks/use-mf-data";
import { usePeriodStore } from "@/lib/period-store";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  Send,
  Loader2,
} from "lucide-react";
import {
  useYearEndSchedule,
  useScheduleMutation,
  useScheduleSlackNotify,
} from "@/hooks/use-year-end-state";

interface ScheduleItem {
  id: string;
  /** 決算日からの日数オフセット */
  offsetDays: number;
  responsible: "SRA" | "貴社" | "両社";
  task: string;
  detail: string;
}

const DEFAULT_TEMPLATE: ScheduleItem[] = [
  { id: "fy-end", offsetDays: 0, responsible: "両社", task: "決算日", detail: "—" },
  {
    id: "doc-submit",
    offsetDays: 30,
    responsible: "貴社",
    task: "資料提出",
    detail: "スムーズな資料共有をお願いいたします。共有が遅くなると期限ギリギリ、もしくは間に合わない可能性があります。",
  },
  {
    id: "qa-send",
    offsetDays: 37,
    responsible: "SRA",
    task: "QA送付",
    detail: "不明点等があればQAシートを共有させていただきます。",
  },
  {
    id: "qa-reply",
    offsetDays: 38,
    responsible: "貴社",
    task: "QA回答",
    detail: "QAシートの内容のご回答をお願いいたします。",
  },
  {
    id: "draft-send",
    offsetDays: 45,
    responsible: "SRA",
    task: "DRAFT送付",
    detail: "納税額についても合わせて共有させていただきます。",
  },
  {
    id: "draft-confirm",
    offsetDays: 46,
    responsible: "貴社",
    task: "DRAFT確認",
    detail: "本店所在地、代表者住所、株主構成などが相違ないかご確認ください。",
  },
  {
    id: "filing",
    offsetDays: 50,
    responsible: "両社",
    task: "電子申告及び法人税・消費税の納税",
    detail: "納付漏れのないようにご対応をお願いいたします。",
  },
  {
    id: "shareholder-meeting",
    offsetDays: 60,
    responsible: "貴社",
    task: "株主総会・役員報酬改定",
    detail: "総会にて決議されましたらご連絡ください。",
  },
];

interface ItemState {
  done: boolean;
  customDate?: string; // YYYY-MM-DD
}

export function ScheduleSection() {
  const office = useMfOffice();
  const fiscalYear = usePeriodStore((s) => s.fiscalYear);
  const scheduleQuery = useYearEndSchedule(fiscalYear);
  const scheduleMutation = useScheduleMutation();
  // 設定画面で登録済の brief webhook (Organization.briefSlackWebhookUrl) を流用
  const notifyMutation = useScheduleSlackNotify();
  const [sendingState, setSendingState] = useState<
    "idle" | "sending" | "ok" | "error"
  >("idle");
  const [sendError, setSendError] = useState("");

  // 旧 LocalStorage の自動クリーンアップ (DB 化後不要)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem("sevenboard:year-end-schedule");
      // 旧 webhook ローカル保存も削除 (設定画面の DB webhook に統合)
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("sevenboard:slack-webhook:")) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignore
    }
  }, []);

  const itemStates = useMemo<Record<string, ItemState>>(() => {
    const map: Record<string, ItemState> = {};
    for (const row of scheduleQuery.data ?? []) {
      map[row.itemId] = {
        done: row.isDone,
        customDate: row.customDate ?? undefined,
      };
    }
    return map;
  }, [scheduleQuery.data]);

  // 決算日 = 現在選択中の会計年度の end_date
  const fyEndDate = useMemo(() => {
    type Period = { fiscal_year: number; start_date: string; end_date: string };
    const periods = (office.data as { accounting_periods?: Period[] } | undefined)
      ?.accounting_periods;
    const period = periods?.find((p) => p.fiscal_year === fiscalYear) ?? periods?.[0];
    return period?.end_date ?? null;
  }, [office.data, fiscalYear]);

  const today = useMemo(() => new Date(), []);

  const items = useMemo(() => {
    if (!fyEndDate) return [];
    const fyEnd = new Date(fyEndDate);
    return DEFAULT_TEMPLATE.map((tpl) => {
      const state = itemStates[tpl.id] ?? { done: false };
      const baseDate = state.customDate
        ? new Date(state.customDate)
        : new Date(fyEnd.getTime() + tpl.offsetDays * 24 * 60 * 60 * 1000);
      const dateStr = baseDate.toISOString().slice(0, 10);
      const daysFromToday = Math.floor((baseDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      let status: "done" | "overdue" | "soon" | "future" = "future";
      if (state.done) status = "done";
      else if (daysFromToday < 0) status = "overdue";
      else if (daysFromToday <= 7) status = "soon";
      return { ...tpl, dateStr, daysFromToday, status, customDate: state.customDate };
    });
  }, [fyEndDate, itemStates, today]);

  const toggleDone = (id: string) => {
    if (!fiscalYear) return;
    scheduleMutation.mutate({
      itemId: id,
      fiscalYear,
      isDone: !itemStates[id]?.done,
    });
  };

  const setCustomDate = (id: string, customDate: string) => {
    if (!fiscalYear) return;
    scheduleMutation.mutate({
      itemId: id,
      fiscalYear,
      customDate,
    });
  };

  const orgName = (office.data as { name?: string } | undefined)?.name ?? "";

  /** Slack 用テキスト整形 (plain text、Slack mrkdwn は最低限) */
  const buildSlackMessage = (): string => {
    const lines: string[] = [];
    lines.push(`■ 決算スケジュール${orgName ? ` (${orgName})` : ""}`);
    if (fyEndDate) lines.push(`決算日: ${fyEndDate}`);
    lines.push("");
    for (const it of items) {
      const mark =
        it.status === "done"
          ? "✅"
          : it.status === "overdue"
            ? "⚠️"
            : it.status === "soon"
              ? "🟡"
              : "⬜";
      const meta =
        it.status === "done"
          ? "完了"
          : it.status === "overdue"
            ? `${Math.abs(it.daysFromToday)}日超過`
            : `あと${it.daysFromToday}日`;
      lines.push(
        `${mark} ${it.dateStr} [${it.responsible}] ${it.task} (${meta})`,
      );
    }
    return lines.join("\n");
  };

  const sendToSlack = async () => {
    setSendingState("sending");
    setSendError("");
    try {
      const text = buildSlackMessage();
      if (!text || !text.trim()) {
        throw new Error(
          `本文が空です (items=${items.length}, fyEndDate=${fyEndDate ?? "null"})`,
        );
      }
      const res = await notifyMutation.mutateAsync(text);
      if (!res.ok) {
        throw new Error(res.reason ?? "送信失敗");
      }
      setSendingState("ok");
      setTimeout(() => setSendingState("idle"), 3000);
    } catch (err) {
      setSendingState("error");
      setSendError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!fyEndDate) {
    return (
      <div className="text-sm text-muted-foreground">
        会計年度情報が読み込まれるまでお待ちください。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        決算日: <span className="font-bold text-foreground">{fyEndDate}</span>
        {" "}（以下のスケジュールは決算日基準で自動計算。日付は個別変更可）
      </div>

      <div className="overflow-hidden rounded-md border bg-white shadow-sm">
        <table className="w-full text-xs">
          <thead className="border-b bg-muted/40 text-[10px] text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2"></th>
              <th className="px-3 py-2 text-left">期日</th>
              <th className="px-3 py-2 text-left">対応者</th>
              <th className="px-3 py-2 text-left">タスク</th>
              <th className="px-3 py-2 text-left">備考</th>
              <th className="px-3 py-2 text-right">状態</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr
                key={it.id}
                className={cn(
                  "border-b last:border-b-0",
                  it.status === "done" && "bg-emerald-50/30 text-muted-foreground line-through",
                  it.status === "overdue" && "bg-rose-50/40",
                  it.status === "soon" && "bg-amber-50/40",
                )}
              >
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => toggleDone(it.id)}
                    aria-label={it.status === "done" ? "未完了に戻す" : "完了"}
                  >
                    {it.status === "done" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                    )}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="date"
                    value={it.dateStr}
                    onChange={(e) => setCustomDate(it.id, e.target.value)}
                    className="rounded border bg-transparent px-1.5 py-0.5 text-xs"
                  />
                </td>
                <td className="px-3 py-2">
                  <RoleBadge role={it.responsible} />
                </td>
                <td className="px-3 py-2 font-medium">{it.task}</td>
                <td className="px-3 py-2 text-muted-foreground">{it.detail}</td>
                <td className="px-3 py-2 text-right text-[10px]">
                  <StatusBadge status={it.status} daysFromToday={it.daysFromToday} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={sendToSlack}
          disabled={sendingState === "sending"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium",
            "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {sendingState === "sending" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          スケジュールを Slack に送信
        </button>
        {sendingState === "ok" && (
          <span className="text-[11px] text-emerald-700">送信完了</span>
        )}
        {sendingState === "error" && (
          <span className="text-[11px] text-rose-700">送信失敗: {sendError}</span>
        )}
        <span className="text-[10px] text-muted-foreground">
          (設定画面で登録済の Slack Webhook 宛)
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        ※ チェック状態と日付は顧問先全体で共有されます (DB保存)。
      </p>
    </div>
  );
}

function RoleBadge({ role }: { role: ScheduleItem["responsible"] }) {
  return (
    <span
      className={cn(
        "rounded px-2 py-0.5 text-[10px] font-semibold",
        role === "SRA" && "bg-blue-100 text-blue-700",
        role === "貴社" && "bg-violet-100 text-violet-700",
        role === "両社" && "bg-emerald-100 text-emerald-700",
      )}
    >
      {role}
    </span>
  );
}

function StatusBadge({
  status,
  daysFromToday,
}: {
  status: "done" | "overdue" | "soon" | "future";
  daysFromToday: number;
}) {
  if (status === "done") return <span className="text-emerald-700">完了</span>;
  if (status === "overdue")
    return (
      <span className="inline-flex items-center gap-1 text-rose-700">
        <AlertTriangle className="h-3 w-3" />
        {Math.abs(daysFromToday)}日超過
      </span>
    );
  if (status === "soon")
    return <span className="text-amber-700">あと{daysFromToday}日</span>;
  return <span className="text-muted-foreground">あと{daysFromToday}日</span>;
}
