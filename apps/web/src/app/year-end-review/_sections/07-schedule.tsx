"use client";

import { useEffect, useMemo, useState } from "react";
import { useMfOffice } from "@/hooks/use-mf-data";
import { useScopedOrgId } from "@/hooks/use-scoped-org-id";
import { usePeriodStore } from "@/lib/period-store";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, AlertTriangle, Send, Loader2 } from "lucide-react";

const STORAGE_KEY = "sevenboard:year-end-schedule";
const WEBHOOK_STORAGE_PREFIX = "sevenboard:slack-webhook:";

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
  const orgId = useScopedOrgId();
  const fiscalYear = usePeriodStore((s) => s.fiscalYear);
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});
  const [hydrated, setHydrated] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [sendingState, setSendingState] = useState<
    "idle" | "sending" | "ok" | "error"
  >("idle");
  const [sendError, setSendError] = useState("");

  const webhookKey = WEBHOOK_STORAGE_PREFIX + (orgId || "_");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItemStates(JSON.parse(raw));
    } catch {
      // ignore
    }

    setHydrated(true);
  }, []);

  // 顧問先切替時に webhook URL を読み直す
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = localStorage.getItem(webhookKey) ?? "";
      setWebhookUrl(v);
    } catch {
      // ignore
    }
  }, [webhookKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(itemStates));
    } catch {
      // ignore
    }
  }, [itemStates, hydrated]);

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

  const toggleDone = (id: string) =>
    setItemStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], done: !prev[id]?.done },
    }));

  const setCustomDate = (id: string, customDate: string) =>
    setItemStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], done: prev[id]?.done ?? false, customDate },
    }));

  const orgName = (office.data as { name?: string } | undefined)?.name ?? "";

  const saveWebhookUrl = (v: string) => {
    setWebhookUrl(v);
    try {
      if (v.trim()) {
        localStorage.setItem(webhookKey, v.trim());
      } else {
        localStorage.removeItem(webhookKey);
      }
    } catch {
      // ignore
    }
  };

  /** Slack 用テキスト整形 (mrkdwn) */
  const buildSlackMessage = (): string => {
    const lines: string[] = [];
    lines.push(
      `*決算スケジュール${orgName ? ` — ${orgName}` : ""}*`,
    );
    if (fyEndDate) lines.push(`決算日: \`${fyEndDate}\``);
    lines.push("");
    lines.push("期日 | 対応者 | タスク");
    lines.push("---");
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
        `${mark} \`${it.dateStr}\` | *${it.responsible}* | ${it.task} (${meta})`,
      );
    }
    return lines.join("\n");
  };

  const sendToSlack = async () => {
    if (!webhookUrl.trim()) return;
    setSendingState("sending");
    setSendError("");
    try {
      const res = await fetch(webhookUrl.trim(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: buildSlackMessage() }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${body}`);
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

      {/* Slack Webhook 投稿 */}
      <div className="rounded-md border bg-white shadow-sm">
        <div className="border-b px-3 py-2 text-xs font-bold text-[var(--color-primary)]">
          Slack に送信
        </div>
        <div className="space-y-2 p-2.5">
          <div>
            <label className="mb-0.5 block text-[11px] font-semibold text-muted-foreground">
              Slack Incoming Webhook URL (顧問先単位、ブラウザに保存)
            </label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => saveWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/T.../B.../..."
              className="w-full rounded border px-2 py-1.5 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Slack 管理画面の Apps → Incoming Webhooks で投稿先チャンネル用の URL を発行して貼り付けてください。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={sendToSlack}
              disabled={!webhookUrl.trim() || sendingState === "sending"}
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
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        ※ チェック状態と日付の変更はブラウザ内に保存されます（顧問先ごと共有はしません）。
        本格運用ではDBへの保存が必要です。Webhook URL も同様にブラウザ保存です。
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
