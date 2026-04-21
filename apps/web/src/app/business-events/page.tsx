"use client";

import { useState, useCallback, useMemo } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Briefcase,
  Plus,
  X,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  Users,
  Wallet,
  Megaphone,
  UserPlus,
  UserMinus,
  Package,
  CircleDollarSign,
  CalendarDays,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/* ---------- types ---------- */

type EventType =
  | "HIRE"
  | "RESIGNATION"
  | "PRICE_CHANGE"
  | "CAMPAIGN_START"
  | "CAMPAIGN_END"
  | "PRODUCT_LAUNCH"
  | "CONTRACT_WIN"
  | "CONTRACT_LOSS"
  | "SYSTEM_CHANGE"
  | "OTHER";

type ImpactTag = "sales" | "cost" | "cash" | "headcount";

interface BusinessEvent {
  id: string;
  eventDate: string;
  eventType: EventType;
  title: string;
  note: string | null;
  impactTags: ImpactTag[];
  createdBy: string;
  createdByUser?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

/* ---------- display config ---------- */

const eventTypeConfig: Record<
  EventType,
  { label: string; icon: typeof Users; iconCls: string; defaultTags: ImpactTag[] }
> = {
  HIRE: {
    label: "採用",
    icon: UserPlus,
    iconCls: "text-[var(--color-info)]",
    defaultTags: ["headcount", "cost"],
  },
  RESIGNATION: {
    label: "退職",
    icon: UserMinus,
    iconCls: "text-[var(--color-error)]",
    defaultTags: ["headcount", "cost"],
  },
  PRICE_CHANGE: {
    label: "価格改定",
    icon: CircleDollarSign,
    iconCls: "text-[var(--color-warning)]",
    defaultTags: ["sales"],
  },
  CAMPAIGN_START: {
    label: "キャンペーン開始",
    icon: Megaphone,
    iconCls: "text-[var(--color-tertiary)]",
    defaultTags: ["sales", "cost"],
  },
  CAMPAIGN_END: {
    label: "キャンペーン終了",
    icon: Megaphone,
    iconCls: "text-muted-foreground",
    defaultTags: ["sales"],
  },
  PRODUCT_LAUNCH: {
    label: "新商品リリース",
    icon: Package,
    iconCls: "text-[var(--color-success)]",
    defaultTags: ["sales"],
  },
  CONTRACT_WIN: {
    label: "契約獲得",
    icon: TrendingUp,
    iconCls: "text-[var(--color-success)]",
    defaultTags: ["sales", "cash"],
  },
  CONTRACT_LOSS: {
    label: "契約失注",
    icon: TrendingDown,
    iconCls: "text-[var(--color-error)]",
    defaultTags: ["sales"],
  },
  SYSTEM_CHANGE: {
    label: "システム変更",
    icon: Sparkles,
    iconCls: "text-[var(--color-info)]",
    defaultTags: ["cost"],
  },
  OTHER: {
    label: "その他",
    icon: CalendarDays,
    iconCls: "text-muted-foreground",
    defaultTags: [],
  },
};

const impactTagConfig: Record<
  ImpactTag,
  { label: string; icon: typeof TrendingUp; cls: string }
> = {
  sales: {
    label: "売上",
    icon: TrendingUp,
    cls: "bg-[#e1f5fe] text-[var(--color-info)] border-[var(--color-info)]/30",
  },
  cost: {
    label: "コスト",
    icon: Wallet,
    cls: "bg-[#fff4e5] text-[var(--color-warning)] border-[var(--color-warning)]/30",
  },
  cash: {
    label: "資金",
    icon: CircleDollarSign,
    cls: "bg-[#e8f5e9] text-[var(--color-success)] border-[var(--color-success)]/30",
  },
  headcount: {
    label: "人員",
    icon: Users,
    cls: "bg-[#f3e5f5] text-purple-700 border-purple-300",
  },
};

const eventTypeOptions: { value: EventType; label: string }[] = (
  Object.entries(eventTypeConfig) as [EventType, (typeof eventTypeConfig)[EventType]][]
).map(([value, cfg]) => ({ value, label: cfg.label }));

const impactTagOptions: ImpactTag[] = ["sales", "cost", "cash", "headcount"];

/* ---------- mock fallback ---------- */

const mockEvents: BusinessEvent[] = [
  {
    id: "e1",
    eventDate: "2026-04-01",
    eventType: "HIRE",
    title: "営業2名採用（中途）",
    note: "新規開拓加速。月間人件費 +120万円想定。",
    impactTags: ["headcount", "cost"],
    createdBy: "mock",
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
  },
  {
    id: "e2",
    eventDate: "2026-03-15",
    eventType: "PRICE_CHANGE",
    title: "スタンダードプラン +10%",
    note: "既存顧客は6月から適用。新規は即時。",
    impactTags: ["sales"],
    createdBy: "mock",
    createdAt: "2026-03-15T00:00:00Z",
    updatedAt: "2026-03-15T00:00:00Z",
  },
  {
    id: "e3",
    eventDate: "2026-04-15",
    eventType: "CONTRACT_WIN",
    title: "B社大型案件獲得（年間1,200万円）",
    note: "5月より売上計上開始。",
    impactTags: ["sales", "cash"],
    createdBy: "mock",
    createdAt: "2026-04-15T00:00:00Z",
    updatedAt: "2026-04-15T00:00:00Z",
  },
];

/* ---------- helpers ---------- */

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ---------- component ---------- */

export default function BusinessEventsPage() {
  const user = useAuthStore((s) => s.user);
  const orgId = user?.orgId || "";
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formDate, setFormDate] = useState(todayIso());
  const [formType, setFormType] = useState<EventType>("OTHER");
  const [formTitle, setFormTitle] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formTags, setFormTags] = useState<ImpactTag[]>([]);

  const [filterType, setFilterType] = useState<EventType | "">("");
  const [filterTag, setFilterTag] = useState<ImpactTag | "">("");

  const { data: apiEvents } = useQuery({
    queryKey: ["business-events", orgId],
    queryFn: () => api.businessEvents.list(orgId),
    enabled: !!orgId,
  });

  const rawEvents: BusinessEvent[] =
    (apiEvents as BusinessEvent[] | undefined) ?? mockEvents;

  const events = useMemo(() => {
    let list = rawEvents.slice().sort((a, b) =>
      b.eventDate.localeCompare(a.eventDate),
    );
    if (filterType) list = list.filter((e) => e.eventType === filterType);
    if (filterTag) list = list.filter((e) => e.impactTags.includes(filterTag));
    return list;
  }, [rawEvents, filterType, filterTag]);

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.businessEvents.create>[1]) =>
      api.businessEvents.create(orgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-events"] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: Parameters<typeof api.businessEvents.update>[2] }) =>
      api.businessEvents.update(orgId, eventId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-events"] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (eventId: string) => api.businessEvents.remove(orgId, eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-events"] });
    },
  });

  const resetForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setFormDate(todayIso());
    setFormType("OTHER");
    setFormTitle("");
    setFormNote("");
    setFormTags([]);
  }, []);

  const handleTypeChange = (t: EventType) => {
    setFormType(t);
    // 既存のタグを尊重しつつ、デフォルトタグをマージ
    const defaults = eventTypeConfig[t].defaultTags;
    if (formTags.length === 0) setFormTags(defaults);
  };

  const handleStartEdit = (e: BusinessEvent) => {
    setEditingId(e.id);
    setShowForm(true);
    setFormDate(e.eventDate.slice(0, 10));
    setFormType(e.eventType);
    setFormTitle(e.title);
    setFormNote(e.note || "");
    setFormTags(e.impactTags);
  };

  const handleSubmit = () => {
    if (!formTitle.trim() || !orgId) {
      if (!orgId) resetForm();
      return;
    }
    const payload = {
      eventDate: formDate,
      eventType: formType,
      title: formTitle.trim(),
      note: formNote.trim() || undefined,
      impactTags: formTags.length > 0 ? formTags : undefined,
    };
    if (editingId) {
      updateMutation.mutate({ eventId: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (eventId: string) => {
    if (!window.confirm("このイベントを削除しますか？")) return;
    deleteMutation.mutate(eventId);
  };

  const toggleTag = (tag: ImpactTag) => {
    setFormTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Briefcase className="h-6 w-6 text-[var(--color-tertiary)]" />
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
                経営イベントログ
              </h1>
              <p className="text-sm text-muted-foreground">
                採用・価格改定・契約など、数値の変化点を記録。KPI推移の解釈に使う
              </p>
            </div>
          </div>
          <Button
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
            }}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            イベント追加
          </Button>
        </div>

        {showForm && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">
                  {editingId ? "イベント編集" : "新しいイベント"}
                </h2>
                <Button variant="ghost" size="icon" onClick={resetForm}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel required>発生日</FieldLabel>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <FieldLabel required>種別</FieldLabel>
                  <select
                    value={formType}
                    onChange={(e) =>
                      handleTypeChange(e.target.value as EventType)
                    }
                    className={inputCls}
                  >
                    {eventTypeOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel required>タイトル</FieldLabel>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="例: 営業2名採用（中途）"
                    className={inputCls}
                  />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>詳細・メモ</FieldLabel>
                  <textarea
                    value={formNote}
                    onChange={(e) => setFormNote(e.target.value)}
                    rows={3}
                    placeholder="背景・影響試算など"
                    className={inputCls}
                  />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>影響タグ</FieldLabel>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {impactTagOptions.map((tag) => {
                      const cfg = impactTagConfig[tag];
                      const active = formTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-all",
                            active
                              ? cfg.cls + " ring-2 ring-offset-1"
                              : "border-gray-300 bg-white text-muted-foreground hover:bg-gray-50",
                          )}
                        >
                          <cfg.icon className="h-3 w-3" />
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={resetForm}>
                  キャンセル
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={
                    !formTitle.trim() ||
                    createMutation.isPending ||
                    updateMutation.isPending
                  }
                >
                  {editingId ? "保存" : "作成"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* filters */}
        <Card>
          <CardContent className="p-3 flex flex-wrap items-center gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as EventType | "")}
              className="rounded-md border px-2 py-1 text-sm"
            >
              <option value="">種別（すべて）</option>
              {eventTypeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value as ImpactTag | "")}
              className="rounded-md border px-2 py-1 text-sm"
            >
              <option value="">影響（すべて）</option>
              {impactTagOptions.map((t) => (
                <option key={t} value={t}>
                  {impactTagConfig[t].label}
                </option>
              ))}
            </select>
            {(filterType || filterTag) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterType("");
                  setFilterTag("");
                }}
              >
                クリア
              </Button>
            )}
          </CardContent>
        </Card>

        {/* timeline */}
        <Card>
          <CardContent className="p-0">
            {events.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                該当するイベントはありません
              </div>
            ) : (
              <ul className="divide-y">
                {events.map((e) => {
                  const typeCfg = eventTypeConfig[e.eventType];
                  const TypeIcon = typeCfg.icon;
                  return (
                    <li key={e.id} className="p-4 flex items-start gap-3">
                      <div
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted",
                        )}
                      >
                        <TypeIcon className={cn("h-4 w-4", typeCfg.iconCls)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground font-mono">
                            {formatDate(e.eventDate)}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {typeCfg.label}
                          </Badge>
                          {e.impactTags.map((tag) => {
                            const tagCfg = impactTagConfig[tag];
                            return (
                              <Badge
                                key={tag}
                                variant="outline"
                                className={cn("text-xs gap-0.5", tagCfg.cls)}
                              >
                                <tagCfg.icon className="h-2.5 w-2.5" />
                                {tagCfg.label}
                              </Badge>
                            );
                          })}
                        </div>
                        <h3 className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">
                          {e.title}
                        </h3>
                        {e.note && (
                          <p className="mt-1 text-xs text-muted-foreground whitespace-pre-line">
                            {e.note}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStartEdit(e)}
                          title="編集"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(e.id)}
                          title="削除"
                        >
                          <Trash2 className="h-4 w-4 text-[var(--color-error)]" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

/* ---------- sub-components ---------- */

const inputCls =
  "mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="text-xs font-medium text-muted-foreground">
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
  );
}
