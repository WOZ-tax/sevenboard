"use client";

import { useState, useMemo } from "react";
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
} from "lucide-react";

/* ---------- types ---------- */

type EventType = "deadline" | "meeting" | "task";
type EventStatus = "completed" | "upcoming";

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  type: EventType;
  status: EventStatus;
}

/* ---------- mock data ---------- */

const mockEvents: CalendarEvent[] = [
  { id: "1", date: "2026-04-05", title: "月次決算締め", type: "deadline", status: "completed" },
  { id: "2", date: "2026-04-10", title: "予算会議", type: "meeting", status: "upcoming" },
  { id: "3", date: "2026-04-15", title: "MF会計データ同期", type: "task", status: "upcoming" },
  { id: "4", date: "2026-04-20", title: "顧問先レビュー（A社）", type: "meeting", status: "upcoming" },
  { id: "5", date: "2026-04-25", title: "給与支払い", type: "deadline", status: "upcoming" },
  { id: "6", date: "2026-04-30", title: "源泉所得税納付", type: "deadline", status: "upcoming" },
  { id: "7", date: "2026-05-10", title: "法人税中間申告", type: "deadline", status: "upcoming" },
  { id: "8", date: "2026-03-15", title: "確定申告期限", type: "deadline", status: "completed" },
  { id: "9", date: "2026-03-31", title: "年度決算", type: "deadline", status: "completed" },
];

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
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);

  /* build event lookup map */
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of mockEvents) {
      const list = map.get(ev.date) ?? [];
      list.push(ev);
      map.set(ev.date, list);
    }
    return map;
  }, []);

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

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* header */}
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
                    return (
                      <div
                        key={ev.id}
                        className="flex items-center gap-3 rounded-lg border p-3"
                      >
                        <div className={cn("rounded-full p-2", cfg.bg)}>
                          <Icon className={cn("h-4 w-4", cfg.text)} />
                        </div>
                        <div className="flex-1">
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
                          </div>
                        </div>
                        <Badge
                          className={cn(
                            "border px-2 py-0.5",
                            ev.status === "completed"
                              ? "bg-[#e8f5e9] text-[var(--color-success)] border-green-300"
                              : "bg-gray-100 text-gray-700 border-gray-300"
                          )}
                        >
                          {ev.status === "completed" ? "完了" : "予定"}
                        </Badge>
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
