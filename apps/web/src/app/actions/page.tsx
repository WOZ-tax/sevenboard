"use client";

import { useState, useMemo, useCallback } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Zap,
  Plus,
  X,
  Pencil,
  Trash2,
  CheckCircle2,
  Play,
  AlertTriangle,
  Clock,
  ExternalLink,
  Filter,
} from "lucide-react";
import { useAuthStore } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/* ---------- types ---------- */

type ActionStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ON_HOLD";
type ActionSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type ActionOwnerRole = "ADVISOR" | "EXECUTIVE" | "ACCOUNTING";
type ActionSourceScreen =
  | "DASHBOARD"
  | "ALERTS"
  | "CASHFLOW"
  | "MONTHLY_REVIEW"
  | "AI_REPORT"
  | "VARIANCE"
  | "KPI"
  | "MANUAL";

interface Action {
  id: string;
  title: string;
  description: string | null;
  sourceScreen: ActionSourceScreen;
  sourceRef: Record<string, unknown> | null;
  severity: ActionSeverity;
  ownerRole: ActionOwnerRole;
  ownerUserId: string | null;
  ownerUser?: { id: string; name: string; email: string } | null;
  createdBy: string;
  createdByUser?: { id: string; name: string } | null;
  dueDate: string | null;
  status: ActionStatus;
  linkedSlackThreadUrl: string | null;
  closedAt: string | null;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ---------- display config ---------- */

const severityConfig: Record<
  ActionSeverity,
  { label: string; dot: string; badge: string; order: number }
> = {
  CRITICAL: {
    label: "緊急",
    dot: "bg-[var(--color-error)]",
    badge: "border-[var(--color-error)] bg-[#fce4ec] text-[var(--color-error)]",
    order: 0,
  },
  HIGH: {
    label: "高",
    dot: "bg-[var(--color-warning)]",
    badge: "border-[var(--color-warning)] bg-[#fff4e5] text-[var(--color-warning)]",
    order: 1,
  },
  MEDIUM: {
    label: "中",
    dot: "bg-[var(--color-info)]",
    badge: "border-[var(--color-info)] bg-[#e1f5fe] text-[var(--color-info)]",
    order: 2,
  },
  LOW: {
    label: "低",
    dot: "bg-gray-400",
    badge: "border-gray-400 bg-gray-100 text-gray-600",
    order: 3,
  },
};

const statusConfig: Record<ActionStatus, { label: string; badge: string }> = {
  NOT_STARTED: {
    label: "未着手",
    badge: "border-gray-300 bg-gray-50 text-gray-700",
  },
  IN_PROGRESS: {
    label: "対応中",
    badge: "border-[var(--color-info)] bg-[#e1f5fe] text-[var(--color-info)]",
  },
  COMPLETED: {
    label: "完了",
    badge: "border-[var(--color-success)] bg-[#e8f5e9] text-[var(--color-success)]",
  },
  ON_HOLD: {
    label: "保留",
    badge: "border-gray-300 bg-gray-50 text-gray-500",
  },
};

const sourceScreenLabels: Record<ActionSourceScreen, string> = {
  DASHBOARD: "ダッシュボード",
  ALERTS: "アラート",
  CASHFLOW: "資金繰り",
  MONTHLY_REVIEW: "月次レビュー",
  AI_REPORT: "AIレポート",
  VARIANCE: "予実差異",
  KPI: "KPI",
  MANUAL: "手動作成",
};

const ownerRoleLabels: Record<ActionOwnerRole, string> = {
  ADVISOR: "顧問",
  EXECUTIVE: "経営者",
  ACCOUNTING: "経理担当",
};

const severityOptions: { value: ActionSeverity; label: string }[] = [
  { value: "CRITICAL", label: "緊急" },
  { value: "HIGH", label: "高" },
  { value: "MEDIUM", label: "中" },
  { value: "LOW", label: "低" },
];

const ownerRoleOptions: { value: ActionOwnerRole; label: string }[] = [
  { value: "ADVISOR", label: "顧問" },
  { value: "EXECUTIVE", label: "経営者" },
  { value: "ACCOUNTING", label: "経理担当" },
];

const sourceScreenOptions: { value: ActionSourceScreen; label: string }[] = [
  { value: "MANUAL", label: "手動作成" },
  { value: "DASHBOARD", label: "ダッシュボード" },
  { value: "ALERTS", label: "アラート" },
  { value: "CASHFLOW", label: "資金繰り" },
  { value: "MONTHLY_REVIEW", label: "月次レビュー" },
  { value: "AI_REPORT", label: "AIレポート" },
  { value: "VARIANCE", label: "予実差異" },
  { value: "KPI", label: "KPI" },
];

/* ---------- mock fallback ---------- */

const mockActions: Action[] = [
  {
    id: "m1",
    title: "売掛金回収サイト短縮の打診（A社）",
    description: "DSOが前月比+8日。主要取引先A社との支払サイト再交渉を検討。",
    sourceScreen: "CASHFLOW",
    sourceRef: null,
    severity: "HIGH",
    ownerRole: "EXECUTIVE",
    ownerUserId: null,
    createdBy: "mock",
    dueDate: "2026-04-25",
    status: "IN_PROGRESS",
    linkedSlackThreadUrl: null,
    closedAt: null,
    isOverdue: false,
    createdAt: "2026-04-15T00:00:00Z",
    updatedAt: "2026-04-18T00:00:00Z",
  },
  {
    id: "m2",
    title: "広告費予算の見直し",
    description: "Q4広告費が予算比+180%。次月の配分を再設計。",
    sourceScreen: "VARIANCE",
    sourceRef: null,
    severity: "MEDIUM",
    ownerRole: "ACCOUNTING",
    ownerUserId: null,
    createdBy: "mock",
    dueDate: "2026-04-30",
    status: "NOT_STARTED",
    linkedSlackThreadUrl: null,
    closedAt: null,
    isOverdue: false,
    createdAt: "2026-04-16T00:00:00Z",
    updatedAt: "2026-04-16T00:00:00Z",
  },
  {
    id: "m3",
    title: "月次レビュー：貸倒引当金の妥当性確認",
    description: "売掛金残高増に伴い引当金見直しが必要。",
    sourceScreen: "MONTHLY_REVIEW",
    sourceRef: null,
    severity: "CRITICAL",
    ownerRole: "ADVISOR",
    ownerUserId: null,
    createdBy: "mock",
    dueDate: "2026-04-10",
    status: "NOT_STARTED",
    linkedSlackThreadUrl: null,
    closedAt: null,
    isOverdue: true,
    createdAt: "2026-04-05T00:00:00Z",
    updatedAt: "2026-04-05T00:00:00Z",
  },
];

const mockSummary = { total: 3, notStarted: 2, inProgress: 1, overdue: 1 };

/* ---------- helpers ---------- */

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(iso);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/* ---------- component ---------- */

export default function ActionsPage() {
  const user = useAuthStore((s) => s.user);
  const orgId = user?.orgId || "";
  const queryClient = useQueryClient();

  // Filters
  const [filterStatus, setFilterStatus] = useState<ActionStatus | "">("");
  const [filterSeverity, setFilterSeverity] = useState<ActionSeverity | "">("");
  const [filterSource, setFilterSource] = useState<ActionSourceScreen | "">("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [copilotOnly, setCopilotOnly] = useState(false);

  // Create form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSeverity, setFormSeverity] = useState<ActionSeverity>("MEDIUM");
  const [formOwnerRole, setFormOwnerRole] = useState<ActionOwnerRole>("ADVISOR");
  const [formDueDate, setFormDueDate] = useState("");
  const [formSlackUrl, setFormSlackUrl] = useState("");

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSeverity, setEditSeverity] = useState<ActionSeverity>("MEDIUM");
  const [editDueDate, setEditDueDate] = useState("");

  // Queries
  const { data: apiActions } = useQuery({
    queryKey: [
      "actions",
      orgId,
      filterStatus,
      filterSource,
      overdueOnly,
    ],
    queryFn: () =>
      api.actions.list(orgId, {
        status: filterStatus || undefined,
        sourceScreen: filterSource || undefined,
        overdueOnly: overdueOnly || undefined,
      }),
    enabled: !!orgId,
  });

  const { data: apiSummary } = useQuery({
    queryKey: ["actions-summary", orgId],
    queryFn: () => api.actions.summary(orgId),
    enabled: !!orgId,
  });

  const rawActions: Action[] = (apiActions as Action[] | undefined) ?? mockActions;
  const summary = apiSummary ?? mockSummary;

  // Client-side severity / copilot filter (server doesn't support these yet)
  const actions = useMemo(() => {
    let list = rawActions;
    if (filterSeverity) list = list.filter((a) => a.severity === filterSeverity);
    if (copilotOnly) {
      list = list.filter(
        (a) =>
          a.sourceRef &&
          (a.sourceRef as Record<string, unknown>).from === "copilot",
      );
    }
    return list;
  }, [rawActions, filterSeverity, copilotOnly]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.actions.create>[1]) =>
      api.actions.create(orgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      queryClient.invalidateQueries({ queryKey: ["actions-summary"] });
      resetCreateForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      actionId,
      data,
    }: {
      actionId: string;
      data: Parameters<typeof api.actions.update>[2];
    }) => api.actions.update(orgId, actionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      queryClient.invalidateQueries({ queryKey: ["actions-summary"] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (actionId: string) => api.actions.remove(orgId, actionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      queryClient.invalidateQueries({ queryKey: ["actions-summary"] });
    },
  });

  const resetCreateForm = useCallback(() => {
    setShowCreateForm(false);
    setFormTitle("");
    setFormDescription("");
    setFormSeverity("MEDIUM");
    setFormOwnerRole("ADVISOR");
    setFormDueDate("");
    setFormSlackUrl("");
  }, []);

  const handleCreate = () => {
    if (!formTitle.trim()) return;
    if (!orgId) {
      resetCreateForm();
      return;
    }
    createMutation.mutate({
      title: formTitle.trim(),
      description: formDescription.trim() || undefined,
      sourceScreen: "MANUAL",
      severity: formSeverity,
      ownerRole: formOwnerRole,
      dueDate: formDueDate || undefined,
      linkedSlackThreadUrl: formSlackUrl.trim() || undefined,
    });
  };

  const handleStartEdit = (a: Action) => {
    setEditingId(a.id);
    setEditTitle(a.title);
    setEditDescription(a.description || "");
    setEditSeverity(a.severity);
    setEditDueDate(a.dueDate ? a.dueDate.slice(0, 10) : "");
  };

  const handleSaveEdit = (actionId: string) => {
    if (!editTitle.trim()) return;
    updateMutation.mutate({
      actionId,
      data: {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        severity: editSeverity,
        dueDate: editDueDate || null,
      },
    });
  };

  const handleStatusChange = (actionId: string, status: ActionStatus) => {
    updateMutation.mutate({ actionId, data: { status } });
  };

  const handleDelete = (actionId: string) => {
    if (!window.confirm("このActionを削除しますか？")) return;
    deleteMutation.mutate(actionId);
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className="h-6 w-6 text-[var(--color-tertiary)]" />
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
                Actionセンター
              </h1>
              <p className="text-sm text-muted-foreground">
                ダッシュボード・アラート・月次レビューから発生した対応事項を一元管理
              </p>
            </div>
          </div>
          <Button onClick={() => setShowCreateForm(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Action追加
          </Button>
        </div>

        {/* summary cards */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <SummaryCard label="総件数" value={summary.total} />
          <SummaryCard
            label="未着手"
            value={summary.notStarted}
            tone="neutral"
          />
          <SummaryCard
            label="対応中"
            value={summary.inProgress}
            tone="info"
          />
          <SummaryCard
            label="期限超過"
            value={summary.overdue}
            tone={summary.overdue > 0 ? "error" : "neutral"}
            icon={AlertTriangle}
          />
        </div>

        {/* create form */}
        {showCreateForm && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  新しいAction
                </h2>
                <Button variant="ghost" size="icon" onClick={resetCreateForm}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <FieldLabel required>タイトル</FieldLabel>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="対応すべき事項を簡潔に"
                    className={inputCls}
                  />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>詳細</FieldLabel>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="背景・理由・期待アウトプット"
                    rows={3}
                    className={inputCls}
                  />
                </div>
                <div>
                  <FieldLabel>重要度</FieldLabel>
                  <select
                    value={formSeverity}
                    onChange={(e) =>
                      setFormSeverity(e.target.value as ActionSeverity)
                    }
                    className={inputCls}
                  >
                    {severityOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel>担当役割</FieldLabel>
                  <select
                    value={formOwnerRole}
                    onChange={(e) =>
                      setFormOwnerRole(e.target.value as ActionOwnerRole)
                    }
                    className={inputCls}
                  >
                    {ownerRoleOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel>期限</FieldLabel>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <FieldLabel>Slackスレッド URL</FieldLabel>
                  <input
                    type="url"
                    value={formSlackUrl}
                    onChange={(e) => setFormSlackUrl(e.target.value)}
                    placeholder="https://..."
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={resetCreateForm}>
                  キャンセル
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!formTitle.trim() || createMutation.isPending}
                >
                  作成
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* filters */}
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <FilterSelect
                value={filterStatus}
                onChange={(v) => setFilterStatus(v as ActionStatus | "")}
                placeholder="ステータス"
                options={Object.entries(statusConfig).map(([v, c]) => ({
                  value: v,
                  label: c.label,
                }))}
              />
              <FilterSelect
                value={filterSeverity}
                onChange={(v) => setFilterSeverity(v as ActionSeverity | "")}
                placeholder="重要度"
                options={severityOptions.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
              />
              <FilterSelect
                value={filterSource}
                onChange={(v) =>
                  setFilterSource(v as ActionSourceScreen | "")
                }
                placeholder="発生元"
                options={sourceScreenOptions.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
              />
              <label className="inline-flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={overdueOnly}
                  onChange={(e) => setOverdueOnly(e.target.checked)}
                  className="h-4 w-4"
                />
                期限超過のみ
              </label>
              <label className="inline-flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={copilotOnly}
                  onChange={(e) => setCopilotOnly(e.target.checked)}
                  className="h-4 w-4"
                />
                Copilot発のみ
              </label>
              {(filterStatus ||
                filterSeverity ||
                filterSource ||
                overdueOnly ||
                copilotOnly) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilterStatus("");
                    setFilterSeverity("");
                    setFilterSource("");
                    setOverdueOnly(false);
                    setCopilotOnly(false);
                  }}
                >
                  クリア
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* action list */}
        <Card>
          <CardContent className="p-0">
            {actions.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                該当するActionはありません
              </div>
            ) : (
              <ul className="divide-y">
                {actions.map((a) => (
                  <ActionRow
                    key={a.id}
                    action={a}
                    isEditing={editingId === a.id}
                    editTitle={editTitle}
                    setEditTitle={setEditTitle}
                    editDescription={editDescription}
                    setEditDescription={setEditDescription}
                    editSeverity={editSeverity}
                    setEditSeverity={setEditSeverity}
                    editDueDate={editDueDate}
                    setEditDueDate={setEditDueDate}
                    onStartEdit={() => handleStartEdit(a)}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={() => handleSaveEdit(a.id)}
                    onStatusChange={(s) => handleStatusChange(a.id, s)}
                    onDelete={() => handleDelete(a.id)}
                  />
                ))}
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

function SummaryCard({
  label,
  value,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: number;
  tone?: "neutral" | "info" | "error" | "success";
  icon?: typeof AlertTriangle;
}) {
  const toneCls = {
    neutral: "text-[var(--color-text-primary)]",
    info: "text-[var(--color-info)]",
    error: "text-[var(--color-error)]",
    success: "text-[var(--color-success)]",
  }[tone];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {label}
        </div>
        <div className={cn("mt-1 text-2xl font-bold", toneCls)}>{value}</div>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
    >
      <option value="">{placeholder}（すべて）</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function ActionRow({
  action,
  isEditing,
  editTitle,
  setEditTitle,
  editDescription,
  setEditDescription,
  editSeverity,
  setEditSeverity,
  editDueDate,
  setEditDueDate,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onStatusChange,
  onDelete,
}: {
  action: Action;
  isEditing: boolean;
  editTitle: string;
  setEditTitle: (v: string) => void;
  editDescription: string;
  setEditDescription: (v: string) => void;
  editSeverity: ActionSeverity;
  setEditSeverity: (v: ActionSeverity) => void;
  editDueDate: string;
  setEditDueDate: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onStatusChange: (s: ActionStatus) => void;
  onDelete: () => void;
}) {
  const sev = severityConfig[action.severity];
  const stat = statusConfig[action.status];
  const remaining = daysUntil(action.dueDate);
  const isDone = action.status === "COMPLETED" || action.status === "ON_HOLD";

  if (isEditing) {
    return (
      <li className="p-4 space-y-2 bg-[var(--color-bg-subtle)]">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className={inputCls}
        />
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          rows={2}
          className={inputCls}
          placeholder="詳細"
        />
        <div className="flex gap-2">
          <select
            value={editSeverity}
            onChange={(e) => setEditSeverity(e.target.value as ActionSeverity)}
            className="rounded-md border px-2 py-1 text-sm"
          >
            {severityOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={editDueDate}
            onChange={(e) => setEditDueDate(e.target.value)}
            className="rounded-md border px-2 py-1 text-sm"
          />
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancelEdit}>
              キャンセル
            </Button>
            <Button size="sm" onClick={onSaveEdit}>
              保存
            </Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="p-4 flex items-start gap-3">
      <span
        className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", sev.dot)}
        title={sev.label}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3
            className={cn(
              "text-sm font-medium text-[var(--color-text-primary)]",
              isDone && "line-through text-muted-foreground",
            )}
          >
            {action.title}
          </h3>
          <Badge variant="outline" className={cn("text-xs", sev.badge)}>
            {sev.label}
          </Badge>
          <Badge variant="outline" className={cn("text-xs", stat.badge)}>
            {stat.label}
          </Badge>
          {action.isOverdue && !isDone && (
            <Badge
              variant="outline"
              className="text-xs border-[var(--color-error)] bg-[#fce4ec] text-[var(--color-error)]"
            >
              期限超過
            </Badge>
          )}
        </div>
        {action.description && (
          <p className="mt-1 text-xs text-muted-foreground whitespace-pre-line">
            {action.description}
          </p>
        )}
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="inline-flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-wide">発生元</span>
            {sourceScreenLabels[action.sourceScreen]}
            {action.sourceRef &&
              (action.sourceRef as Record<string, unknown>).from ===
                "copilot" && (
                <Badge
                  variant="outline"
                  className="ml-1 border-[var(--color-secondary)] bg-[#ede7f6] px-1.5 py-0 text-[10px] text-[var(--color-secondary)]"
                >
                  Copilot発
                </Badge>
              )}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-wide">担当</span>
            {action.ownerUser?.name ?? ownerRoleLabels[action.ownerRole]}
          </span>
          {action.dueDate && (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                action.isOverdue && !isDone && "text-[var(--color-error)]",
              )}
            >
              <Clock className="h-3 w-3" />
              {formatDate(action.dueDate)}
              {remaining !== null && !isDone && (
                <span className="text-[10px]">
                  （{remaining >= 0 ? `あと${remaining}日` : `${-remaining}日超過`}）
                </span>
              )}
            </span>
          )}
          {action.linkedSlackThreadUrl && (
            <a
              href={action.linkedSlackThreadUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[var(--color-info)] hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Slack
            </a>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {action.status === "NOT_STARTED" && (
          <Button
            variant="ghost"
            size="icon"
            title="対応開始"
            onClick={() => onStatusChange("IN_PROGRESS")}
          >
            <Play className="h-4 w-4" />
          </Button>
        )}
        {!isDone && (
          <Button
            variant="ghost"
            size="icon"
            title="完了"
            onClick={() => onStatusChange("COMPLETED")}
          >
            <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          title="編集"
          onClick={onStartEdit}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="削除"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4 text-[var(--color-error)]" />
        </Button>
      </div>
    </li>
  );
}
