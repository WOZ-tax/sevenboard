"use client";

import { useState } from "react";

interface CommentView {
  id: string;
  content: string;
  status: string;
  priority?: string;
  reviewer?: { id: string; name: string; role: string } | null;
  createdAt: string;
  cellRef?: string | null;
  rejectReason?: string | null;
}
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Send,
  Check,
  Pencil,
  X,
  Trash2,
  Bot,
} from "lucide-react";
import { useAuthStore } from "@/lib/auth";
import { useAiSummary } from "@/hooks/use-mf-data";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

const statusConfig: Record<string, { label: string; color: string }> = {
  PENDING: {
    label: "未レビュー",
    color: "bg-[#f0eeec] text-[var(--color-text-secondary)] border-[var(--color-border)]",
  },
  APPROVED: {
    label: "承認済み",
    color: "bg-[#e8f5e9] text-[var(--color-success)] border-[var(--color-success)]",
  },
  MODIFIED: {
    label: "修正済み",
    color: "bg-[#e1f5fe] text-[var(--color-info)] border-[var(--color-info)]",
  },
  REJECTED: {
    label: "却下",
    color: "bg-[#fce4ec] text-[var(--color-error)] border-[var(--color-error)]",
  },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  HIGH: {
    label: "高",
    color: "bg-red-100 text-red-700 border-red-300",
  },
  MEDIUM: {
    label: "中",
    color: "bg-yellow-100 text-yellow-700 border-yellow-300",
  },
  LOW: {
    label: "低",
    color: "bg-gray-100 text-gray-500 border-gray-300",
  },
};

const mockComments = [
  {
    id: "1",
    content:
      "売上は堅調に推移していますが、人件費の増加傾向に注意が必要です。採用計画の見直しを推奨します。",
    status: "APPROVED",
    priority: "HIGH",
    reviewer: { id: "r1", name: "七海 太郎", role: "ADVISOR" },
    createdAt: "2026-04-05T10:30:00Z",
    cellRef: null,
  },
  {
    id: "2",
    content:
      "主要顧客への売上依存度が高まっています。新規顧客開拓の優先度を上げてください。",
    status: "PENDING",
    priority: "MEDIUM",
    reviewer: null,
    createdAt: "2026-04-04T15:00:00Z",
    cellRef: "trade_receivable",
  },
];

function generateMonthOptions(): { label: string; value: string }[] {
  const options: { label: string; value: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${d.getFullYear()}年${d.getMonth() + 1}月`;
    options.push({ label, value });
  }
  return options;
}

export default function CommentsPage() {
  const user = useAuthStore((s) => s.user);
  const orgId = user?.orgId || "";
  const isAdvisor = user?.role === "ADVISOR";
  const canPost = ["ADMIN", "CFO", "ADVISOR"].includes(user?.role || "");
  const queryClient = useQueryClient();

  const monthOptions = generateMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]?.value || "");
  const [newComment, setNewComment] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [newPriority, setNewPriority] = useState<string>("MEDIUM");

  const { data: commentsData, isLoading, isError } = useQuery({
    queryKey: ["comments", orgId, selectedMonth],
    queryFn: () => api.comments.getAll(orgId, selectedMonth),
    enabled: !!orgId,
    staleTime: 60 * 1000,
  });

  const { data: aiData } = useAiSummary();
  const comments = isError || !commentsData ? mockComments : commentsData;

  const createMutation = useMutation({
    mutationFn: (data: { content: string; month?: string; priority?: string }) =>
      api.comments.create(orgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", orgId] });
      setNewComment("");
      setNewPriority("MEDIUM");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (data: {
      commentId: string;
      status: string;
      content?: string;
      rejectReason?: string;
    }) =>
      api.comments.updateStatus(orgId, data.commentId, {
        status: data.status,
        content: data.content,
        rejectReason: data.rejectReason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", orgId] });
      setEditingId(null);
      setEditContent("");
      setRejectingId(null);
      setRejectReason("");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (commentId: string) => api.comments.remove(orgId, commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", orgId] });
    },
  });

  const handleInsertAiSummary = () => {
    if (aiData?.summary) {
      setNewComment((prev) => (prev ? prev + "\n" + aiData.summary : aiData.summary));
    }
  };

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    createMutation.mutate({ content: newComment.trim(), month: selectedMonth, priority: newPriority });
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-6 w-6 text-[var(--color-tertiary)]" />
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
                顧問コメント
              </h1>
              <p className="text-sm text-muted-foreground">
                月次レポートへの顧問コメント・レビュー
              </p>
            </div>
          </div>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {canPost && (
              <Card>
                <CardContent className="pt-4">
                  <div className="mb-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleInsertAiSummary}
                      disabled={!aiData?.summary}
                      className="gap-2 text-xs"
                    >
                      <Bot className="h-3.5 w-3.5" />
                      AIサマリーを挿入
                    </Button>
                  </div>
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="コメントを入力..."
                    rows={3}
                    className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">優先度:</span>
                      <select
                        value={newPriority}
                        onChange={(e) => setNewPriority(e.target.value)}
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                      >
                        <option value="HIGH">高</option>
                        <option value="MEDIUM">中</option>
                        <option value="LOW">低</option>
                      </select>
                    </div>
                    <Button
                      onClick={handleSubmit}
                      disabled={!newComment.trim() || createMutation.isPending}
                      className="gap-2 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
                      size="sm"
                    >
                      <Send className="h-4 w-4" />
                      {createMutation.isPending ? "送信中..." : "送信"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                        <div className="h-4 w-full animate-pulse rounded bg-muted" />
                        <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : comments.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/30" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    この月のコメントはまだありません
                  </p>
                </CardContent>
              </Card>
            ) : (
              (comments as CommentView[]).map((comment) => {
                const config = statusConfig[comment.status] || statusConfig.PENDING;
                const pConfig = priorityConfig[comment.priority ?? "MEDIUM"] || priorityConfig.MEDIUM;
                const isEditing = editingId === comment.id;
                const isRejecting = rejectingId === comment.id;

                return (
                  <Card key={comment.id}>
                    <CardContent className="pt-4">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant="secondary"
                            className={cn("border px-2 py-0.5 text-xs", config.color)}
                          >
                            {config.label}
                          </Badge>
                          <Badge
                            variant="secondary"
                            className={cn("border px-2 py-0.5 text-xs", pConfig.color)}
                          >
                            {pConfig.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {comment.reviewer && <span>{comment.reviewer.name}</span>}
                          <span>
                            {new Date(comment.createdAt).toLocaleString("ja-JP", {
                              month: "numeric",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>

                      {comment.cellRef && (
                        <div className="mb-1">
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            {comment.cellRef}
                          </Badge>
                        </div>
                      )}

                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            rows={3}
                            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() =>
                                updateStatusMutation.mutate({
                                  commentId: comment.id,
                                  status: "MODIFIED",
                                  content: editContent.trim(),
                                })
                              }
                              disabled={updateStatusMutation.isPending}
                              className="gap-1 bg-blue-600 text-white hover:bg-blue-700"
                            >
                              <Check className="h-3 w-3" />
                              修正して承認
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                              キャンセル
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm leading-relaxed text-foreground">
                          {comment.content}
                        </p>
                      )}

                      {isRejecting && (
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="却下理由（任意）"
                            rows={2}
                            className="w-full resize-none rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() =>
                                updateStatusMutation.mutate({
                                  commentId: comment.id,
                                  status: "REJECTED",
                                  rejectReason: rejectReason.trim() || undefined,
                                })
                              }
                              disabled={updateStatusMutation.isPending}
                              className="gap-1 bg-red-600 text-white hover:bg-red-700"
                            >
                              <X className="h-3 w-3" />
                              却下を確定
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setRejectingId(null)}>
                              キャンセル
                            </Button>
                          </div>
                        </div>
                      )}

                      {comment.status === "REJECTED" && comment.rejectReason && (
                        <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                          却下理由: {comment.rejectReason}
                        </div>
                      )}

                      {!isEditing && !isRejecting && (
                        <div className="mt-3 flex items-center gap-2">
                          {isAdvisor && comment.status === "PENDING" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  updateStatusMutation.mutate({
                                    commentId: comment.id,
                                    status: "APPROVED",
                                  })
                                }
                                disabled={updateStatusMutation.isPending}
                                className="gap-1 border-green-300 text-green-700 hover:bg-green-50"
                              >
                                <Check className="h-3 w-3" />
                                承認
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingId(comment.id);
                                  setEditContent(comment.content);
                                }}
                                className="gap-1 border-blue-300 text-blue-700 hover:bg-blue-50"
                              >
                                <Pencil className="h-3 w-3" />
                                修正
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setRejectingId(comment.id)}
                                className="gap-1 border-red-300 text-red-700 hover:bg-red-50"
                              >
                                <X className="h-3 w-3" />
                                却下
                              </Button>
                            </>
                          )}
                          {(isAdvisor || user?.role === "ADMIN") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { if (window.confirm("このコメントを削除しますか？")) removeMutation.mutate(comment.id); }}
                              disabled={removeMutation.isPending}
                              className="ml-auto text-muted-foreground hover:text-red-600"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          <div className="lg:col-span-1">
            <Card className="sticky top-6">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                  <Bot className="h-4 w-4 text-[var(--color-tertiary)]" />
                  AIサマリー
                </CardTitle>
              </CardHeader>
              <CardContent>
                {aiData?.summary ? (
                  <div className="space-y-3">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {aiData.summary}
                    </p>
                    {aiData.highlights && aiData.highlights.length > 0 && (
                      <div className="space-y-1.5">
                        {aiData.highlights.map(
                          (h: { type: string; text: string }, i: number) => (
                            <div
                              key={i}
                              className={cn(
                                "rounded px-2 py-1 text-[10px]",
                                h.type === "positive" &&
                                  "bg-green-50 text-green-700",
                                h.type === "negative" &&
                                  "bg-red-50 text-red-700",
                                h.type === "neutral" &&
                                  "bg-amber-50 text-amber-700"
                              )}
                            >
                              {h.text}
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      売上は堅調ですが、人件費の増加に注意が必要です。評価損失と資金繰りを重点確認してください。
                    </p>
                    <div className="space-y-1.5">
                      <div className="rounded bg-green-50 px-2 py-1 text-[10px] text-green-700">
                        売上は前月比プラスで推移
                      </div>
                      <div className="rounded bg-red-50 px-2 py-1 text-[10px] text-red-700">
                        人件費の増加が利益を圧迫
                      </div>
                      <div className="rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-700">
                        投資計画に伴う資金繰り確認が必要
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
