"use client";

import { useState, useMemo, useCallback } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Users,
  CheckCircle,
  Plus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useScopedOrgId } from "@/hooks/use-scoped-org-id";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { UpdateCalendarEventInput } from "@/lib/api-types";

/* ---------- types ---------- */

type EventType = "deadline" | "meeting" | "task";
type EventStatus = "completed" | "upcoming" | "cancelled";

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  type: EventType;
  status: EventStatus;
  description?: string | null;
}

/* ---------- event type config ---------- */

const eventTypeConfig: Record<
  EventType,
  { icon: typeof Clock; bg: string; text: string; label: string }
> = {
  deadline: {
    icon: Clock,
    bg: "bg-[#fce4ec]",
    text: "text-[var(--color-error)]",
    label: "期限",
  },
  meeting: {
    icon: Users,
    bg: "bg-[#e1f5fe]",
    text: "text-[var(--color-info)]",
    label: "会議",
  },
  task: {
    icon: CheckCircle,
    bg: "bg-[#e8f5e9]",
    text: "text-[var(--color-success)]",
    label: "タスク",
  },
};

const eventTypeOptions: { value: EventType; label: string }[] = [
  { value: "deadline", label: "期限" },
  { value: "meeting", label: "会議" },
  { value: "task", label: "タスク" },
];

/* ---------- helpers ---------- */

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatDateKey(year: number, month: number, day: number) {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function isToday(year: number, month: number, day: number) {
  const now = new Date();
  return (
    now.getFullYear() === year &&
    now.getMonth() === month &&
    now.getDate() === day
  );
}

/* ---------- component ---------- */

export default function CalendarPage() {
  const orgId = useScopedOrgId();
  const queryClient = useQueryClient();

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formType, setFormType] = useState<EventType>("task");
  const [formDescription, setFormDescription] = useState("");

  // Edit form state
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState<EventType>("task");
  const [editDescription, setEditDescription] = useState("");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // API query
  const { data: apiEvents } = useQuery({
    queryKey: ["calendar-events", orgId, year, month + 1],
    queryFn: () => api.calendar.getEvents(orgId, year, month + 1),
    enabled: !!orgId,
  });

  const events: CalendarEvent[] = useMemo(
    () => apiEvents ?? [],
    [apiEvents],
  );

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: { title: string; date: string; type?: string; description?: string }) =>
      api.calendar.createEvent(orgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      resetAddForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: UpdateCalendarEventInput }) =>
      api.calendar.updateEvent(orgId, eventId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      setEditingEventId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (eventId: string) => api.calendar.deleteEvent(orgId, eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);

  /* build event lookup map */
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const list = map.get(ev.date) ?? [];
      list.push(ev);
      map.set(ev.date, list);
    }
    return map;
  }, [events]);

  /* navigation */
  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDate(null);
  };
  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDate(null);
  };

  /* selected day events */
  const selectedEvents = selectedDate ? eventsByDate.get(selectedDate) ?? [] : [];

  /* build calendar grid cells */
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  /* form handlers */
  const resetAddForm = useCallback(() => {
    setShowAddForm(false);
    setFormTitle("");
    setFormDate("");
    setFormType("task");
    setFormDescription("");
  }, []);

  const handleOpenAddForm = () => {
    setFormDate(selectedDate || formatDateKey(year, month, new Date().getDate()));
    setShowAddForm(true);
  };

  const handleCreate = () => {
    if (!formTitle.trim()) return;
    if (orgId) {
      createMutation.mutate({
        title: formTitle.trim(),
        date: formDate,
        type: formType,
        description: formDescription.trim() || undefined,
      });
    } else {
      // Mock fallback: just close form
      resetAddForm();
    }
  };

  const handleStartEdit = (ev: CalendarEvent) => {
    setEditingEventId(ev.id);
    setEditTitle(ev.title);
    setEditType(ev.type);
    setEditDescription(ev.description || "");
  };

  const handleSaveEdit = (eventId: string) => {
    if (!editTitle.trim()) return;
    if (orgId) {
      updateMutation.mutate({
        eventId,
        data: {
          title: editTitle.trim(),
          type: editType,
          description: editDescription.trim() || undefined,
        },
      });
    } else {
      setEditingEventId(null);
    }
  };

  const handleComplete = (eventId: string) => {
    if (orgId) {
      updateMutation.mutate({
        eventId,
        data: { status: "completed" },
      });
    }
  };

  const handleDelete = (eventId: string) => {
    if (!window.confirm("このイベントを削除しますか？")) return;
    if (orgId) {
      deleteMutation.mutate(eventId);
    }
  };

  return (
    <DashboardShell>
      <div className="space-y-4">
        {/* header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="h-6 w-6 text-[var(--color-tertiary)]" />
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
                タスクカレンダー
              </h1>
              <p className="text-sm text-muted-foreground">
                月次の経営タスク・イベントをカレンダー形式で管理
              </p>
            </div>
          </div>
          <Button onClick={handleOpenAddForm} className="gap-1.5">
            <Plus className="h-4 w-4" />
            イベント追加
          </Button>
        </div>

        {/* add form */}
        {showAddForm && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  新しいイベント
                </h2>
                <Button variant="ghost" size="icon" onClick={resetAddForm}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    タイトル <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="イベント名"
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    日付 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    タイプ
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as EventType)}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  >
                    {eventTypeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    説明
                  </label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="任意"
                    rows={2}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={resetAddForm}>
                  キャンセル
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!formTitle.trim() || createMutation.isPending}
                >
                  {createMutation.isPending ? "保存中..." : "保存"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* month navigation */}
        <div className="flex items-center justify-center gap-4">
          <Button variant="outline" size="icon" onClick={goToPrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center text-lg font-semibold text-[var(--color-text-primary)]">
            {year}年{month + 1}月
          </span>
          <Button variant="outline" size="icon" onClick={goToNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* calendar grid */}
        <Card>
          <CardContent className="p-4">
            {/* weekday header */}
            <div className="grid grid-cols-7 border-b pb-2">
              {WEEKDAYS.map((w, i) => (
                <div
                  key={w}
                  className={cn(
                    "text-center text-xs font-semibold",
                    i === 0 && "text-[var(--color-error)]",
                    i === 6 && "text-[var(--color-info)]",
                    i !== 0 && i !== 6 && "text-muted-foreground"
                  )}
                >
                  {w}
                </div>
              ))}
            </div>

            {/* day cells */}
            <div className="grid grid-cols-7">
              {cells.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} className="min-h-[90px] border-b border-r p-1 last:border-r-0" />;
                }

                const dateKey = formatDateKey(year, month, day);
                const dayEvents = eventsByDate.get(dateKey) ?? [];
                const dayOfWeek = (firstDay + day - 1) % 7;
                const today = isToday(year, month, day);
                const isSelected = selectedDate === dateKey;

                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => setSelectedDate(dateKey)}
                    className={cn(
                      "min-h-[90px] border-b border-r p-1 text-left transition-colors last:border-r-0 hover:bg-gray-50",
                      dayOfWeek === 0 && "bg-red-50/40",
                      dayOfWeek === 6 && "bg-blue-50/40",
                      today && "bg-[var(--color-tertiary)]/10",
                      isSelected && "ring-2 ring-inset ring-[var(--color-primary)]"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                        today && "bg-[var(--color-primary)] text-white",
                        !today && dayOfWeek === 0 && "text-[var(--color-error)]",
                        !today && dayOfWeek === 6 && "text-[var(--color-info)]",
                        !today && dayOfWeek !== 0 && dayOfWeek !== 6 && "text-[var(--color-text-primary)]"
                      )}
                    >
                      {day}
                    </span>
                    <div className="mt-0.5 space-y-0.5">
                      {dayEvents.slice(0, 3).map((ev) => {
                        const cfg = eventTypeConfig[ev.type];
                        const Icon = cfg.icon;
                        return (
                          <div
                            key={ev.id}
                            className={cn(
                              "flex items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-tight",
                              cfg.bg,
                              cfg.text,
                              ev.status === "completed" && "opacity-60 line-through"
                            )}
                          >
                            <Icon className="h-3 w-3 shrink-0" />
                            <span className="truncate">{ev.title}</span>
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div className="px-1 text-[10px] text-muted-foreground">
                          +{dayEvents.length - 3}件
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* selected day detail panel */}
        {selectedDate && (
          <Card>
            <CardContent className="p-4">
              <h2 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
                {selectedDate} のイベント
              </h2>
              {selectedEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">予定なし</p>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map((ev) => {
                    const cfg = eventTypeConfig[ev.type];
                    const Icon = cfg.icon;
                    const isEditing = editingEventId === ev.id;

                    if (isEditing) {
                      return (
                        <div
                          key={ev.id}
                          className="rounded-lg border p-3 space-y-2"
                        >
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                          />
                          <div className="flex gap-2">
                            <select
                              value={editType}
                              onChange={(e) => setEditType(e.target.value as EventType)}
                              className="rounded-md border px-2 py-1 text-sm"
                            >
                              {eventTypeOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              placeholder="説明（任意）"
                              className="flex-1 rounded-md border px-2 py-1 text-sm"
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingEventId(null)}
                            >
                              キャンセル
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSaveEdit(ev.id)}
                              disabled={updateMutation.isPending}
                            >
                              {updateMutation.isPending ? "保存中..." : "保存"}
                            </Button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={ev.id}
                        className="flex items-center gap-3 rounded-lg border p-3"
                      >
                        <div className={cn("rounded-full p-2", cfg.bg)}>
                          <Icon className={cn("h-4 w-4", cfg.text)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div
                            className={cn(
                              "text-sm font-medium text-[var(--color-text-primary)]",
                              ev.status === "completed" && "line-through opacity-60"
                            )}
                          >
                            {ev.title}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {cfg.label}
                            {ev.description && ` - ${ev.description}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {ev.status !== "completed" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-[var(--color-success)]"
                              title="完了にする"
                              onClick={() => handleComplete(ev.id)}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="編集"
                            onClick={() => handleStartEdit(ev)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:text-red-700"
                            title="削除"
                            onClick={() => handleDelete(ev.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          <Badge
                            className={cn(
                              "border px-2 py-0.5 ml-1",
                              ev.status === "completed"
                                ? "bg-[#e8f5e9] text-[var(--color-success)] border-green-300"
                                : ev.status === "cancelled"
                                  ? "bg-gray-100 text-gray-500 border-gray-300"
                                  : "bg-gray-100 text-gray-700 border-gray-300"
                            )}
                          >
                            {ev.status === "completed" ? "完了" : ev.status === "cancelled" ? "取消" : "予定"}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
