"use client";

import { useState } from "react";
import { Zap, Check } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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

interface ActionizeButtonProps {
  /** 画面種別。発生元を自動タグ付けする */
  sourceScreen: ActionSourceScreen;
  /** 発生元の追加情報（alertId, findingId, kpiName など） */
  sourceRef?: Record<string, unknown>;
  /** デフォルトのタイトル（編集可能） */
  defaultTitle?: string;
  /** デフォルトの詳細（編集可能） */
  defaultDescription?: string;
  /** デフォルトの重要度 */
  defaultSeverity?: ActionSeverity;
  /** デフォルトの担当役割 */
  defaultOwnerRole?: ActionOwnerRole;
  /** サーバー送信時の発生元紐付け参照 */
  sourceRefId?: string;
  /** 小型（インラインリスト行用）/ 通常 */
  size?: "sm" | "default";
  /** アイコンのみ表示 */
  iconOnly?: boolean;
  className?: string;
}

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

const inputCls =
  "mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

export function ActionizeButton({
  sourceScreen,
  sourceRef,
  defaultTitle = "",
  defaultDescription = "",
  defaultSeverity = "MEDIUM",
  defaultOwnerRole = "ADVISOR",
  size = "sm",
  iconOnly = false,
  className,
}: ActionizeButtonProps) {
  const user = useAuthStore((s) => s.user);
  const orgId = user?.orgId || "";
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [severity, setSeverity] = useState<ActionSeverity>(defaultSeverity);
  const [ownerRole, setOwnerRole] = useState<ActionOwnerRole>(defaultOwnerRole);
  const [dueDate, setDueDate] = useState("");
  const [justCreated, setJustCreated] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.actions.create>[1]) =>
      api.actions.create(orgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      queryClient.invalidateQueries({ queryKey: ["actions-summary"] });
      setOpen(false);
      setJustCreated(true);
      setTimeout(() => setJustCreated(false), 2400);
      setDueDate("");
    },
  });

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v) {
      setTitle(defaultTitle);
      setDescription(defaultDescription);
      setSeverity(defaultSeverity);
      setOwnerRole(defaultOwnerRole);
    }
  };

  const handleCreate = () => {
    if (!title.trim() || !orgId) return;
    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      sourceScreen,
      sourceRef,
      severity,
      ownerRole,
      dueDate: dueDate || undefined,
    });
  };

  if (justCreated) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs text-[var(--color-success)]",
          className,
        )}
      >
        <Check className="h-3.5 w-3.5" />
        Action化しました
      </span>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size={size}
            className={cn(
              "gap-1 border-[var(--color-tertiary)] text-[var(--color-tertiary)] hover:bg-[var(--color-tertiary)]/10",
              size === "sm" && "h-7 px-2 text-xs",
              className,
            )}
          />
        }
      >
        <Zap className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {!iconOnly && "Action化"}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-[var(--color-tertiary)]" />
            Action化
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              タイトル <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="対応すべき事項を簡潔に"
              className={inputCls}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              詳細
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={inputCls}
              placeholder="背景・期待アウトプット"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                重要度
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as ActionSeverity)}
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
              <label className="text-xs font-medium text-muted-foreground">
                担当役割
              </label>
              <select
                value={ownerRole}
                onChange={(e) =>
                  setOwnerRole(e.target.value as ActionOwnerRole)
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
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              期限
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            キャンセル
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!title.trim() || createMutation.isPending}
          >
            作成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
