"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, FileEdit, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { MonthlyReviewApprovalRecord, MonthlyReviewApprovalStatus } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";

interface ApprovalCardProps {
  orgId: string;
  fiscalYear: number;
  month: number;
}

const STATUS_META: Record<MonthlyReviewApprovalStatus, { label: string; icon: typeof CheckCircle2; cls: string }> = {
  DRAFT: { label: "下書き", icon: FileEdit, cls: "bg-gray-100 text-gray-700 border-gray-300" },
  PENDING: { label: "承認待ち", icon: Clock, cls: "bg-amber-50 text-amber-700 border-amber-300" },
  APPROVED: { label: "承認済み", icon: CheckCircle2, cls: "bg-green-50 text-green-700 border-green-300" },
  REJECTED: { label: "差戻し", icon: XCircle, cls: "bg-rose-50 text-rose-700 border-rose-300" },
};

export function ApprovalCard({ orgId, fiscalYear, month }: ApprovalCardProps) {
  const user = useAuthStore((s) => s.user);
  const role = user?.role || "";
  const canApprove = ["ADMIN", "CFO", "ADVISOR"].includes(role);
  const canSubmit = ["ADMIN", "CFO", "ADVISOR", "ACCOUNTANT"].includes(role);

  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["monthly-review-approval", orgId, fiscalYear, month],
    queryFn: () => api.monthlyReviewApproval.get(orgId, fiscalYear, month),
    enabled: !!orgId && !!fiscalYear && !!month,
    staleTime: 30_000,
  });
  const record: MonthlyReviewApprovalRecord | null = data?.record ?? null;
  const status: MonthlyReviewApprovalStatus = record?.status ?? "DRAFT";
  const meta = STATUS_META[status];
  const Icon = meta.icon;

  const [comment, setComment] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["monthly-review-approval", orgId, fiscalYear, month] });
  };

  const submit = useMutation({
    mutationFn: () => api.monthlyReviewApproval.submit(orgId, fiscalYear, month, comment || undefined),
    onSuccess: () => {
      setComment("");
      invalidate();
    },
  });
  const approve = useMutation({
    mutationFn: () => api.monthlyReviewApproval.approve(orgId, fiscalYear, month, comment || undefined),
    onSuccess: () => {
      setComment("");
      invalidate();
    },
  });
  const reject = useMutation({
    mutationFn: () => api.monthlyReviewApproval.reject(orgId, fiscalYear, month, comment || undefined),
    onSuccess: () => {
      setComment("");
      invalidate();
    },
  });
  const reset = useMutation({
    mutationFn: () => api.monthlyReviewApproval.reset(orgId, fiscalYear, month),
    onSuccess: () => {
      setComment("");
      invalidate();
    },
  });

  const pending = submit.isPending || approve.isPending || reject.isPending || reset.isPending;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4 text-[var(--color-primary)]" />
            月次レビュー承認
          </CardTitle>
          <Badge className={cn("border text-xs", meta.cls)}>
            <Icon className="mr-1 inline h-3 w-3" />
            {meta.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="text-xs text-muted-foreground">読み込み中…</div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground">
              {fiscalYear}年度 {month}月 のレビュー承認ステータス
            </div>
            {record?.approvedAt && (
              <div className="text-xs text-muted-foreground">
                最終更新: {new Date(record.updatedAt).toLocaleString("ja-JP")}
              </div>
            )}
            {record?.comment && (
              <div className="rounded border bg-muted/30 px-2 py-1.5 text-xs text-[var(--color-text-primary)]">
                コメント: {record.comment}
              </div>
            )}
            <div className="screen-only space-y-2">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="コメント（任意）"
                className="w-full resize-none rounded border border-[var(--color-border)] bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                rows={2}
                disabled={pending}
              />
              <div className="flex flex-wrap items-center gap-2">
                {canSubmit && status !== "PENDING" && status !== "APPROVED" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => submit.mutate()}
                    disabled={pending}
                    className="h-7 text-xs"
                  >
                    <Clock className="mr-1 h-3 w-3" />
                    承認依頼
                  </Button>
                )}
                {canApprove && status !== "APPROVED" && (
                  <Button
                    size="sm"
                    onClick={() => approve.mutate()}
                    disabled={pending}
                    className="h-7 bg-green-600 text-xs text-white hover:bg-green-700"
                  >
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    承認
                  </Button>
                )}
                {canApprove && (status === "PENDING" || status === "APPROVED") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reject.mutate()}
                    disabled={pending}
                    className="h-7 border-rose-300 text-xs text-rose-700 hover:bg-rose-50"
                  >
                    <XCircle className="mr-1 h-3 w-3" />
                    差戻し
                  </Button>
                )}
                {canApprove && status !== "DRAFT" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => reset.mutate()}
                    disabled={pending}
                    className="h-7 text-xs text-muted-foreground"
                  >
                    下書きに戻す
                  </Button>
                )}
              </div>
              {!canSubmit && !canApprove && (
                <div className="text-xs text-muted-foreground">
                  承認権限がありません（閲覧のみ）
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
