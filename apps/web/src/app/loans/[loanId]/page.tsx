"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  FileText,
  Landmark,
  Loader2,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { PrintButton } from "@/components/ui/print-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCurrentOrg } from "@/contexts/current-org";
import { useScopedOrgId } from "@/hooks/use-scoped-org-id";
import { api } from "@/lib/api";
import type { LoanDetail } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { LoanBasicForm } from "../_components/loan-basic-form";
import { ScheduleEditor } from "../_components/schedule-editor";
import { ScheduleTable } from "../_components/schedule-table";
import {
  REPAYMENT_METHOD_LABELS,
  RATE_TYPE_LABELS,
  STATUS_LABELS,
  emptyLoanForm,
  formStateToBasicInput,
  normalizeLoanForm,
  pct,
  scheduleFormToRows,
  scheduleRowsToForm,
  validateLoanForm,
  yen,
  type LoanFormState,
  type ScheduleRowForm,
} from "../_lib/loan-format";

export default function LoanDetailPage() {
  const params = useParams<{ loanId: string }>();
  const loanId = params?.loanId ?? "";
  const { currentOrg } = useCurrentOrg();
  const orgId = useScopedOrgId();
  const router = useRouter();
  const queryClient = useQueryClient();

  const detailQuery = useQuery<LoanDetail>({
    queryKey: ["loans", "detail", orgId, loanId],
    queryFn: () => api.loans.get(orgId, loanId),
    enabled: !!orgId && !!loanId,
    staleTime: 60 * 1000,
  });
  const loan = detailQuery.data;

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [scheduleEditing, setScheduleEditing] = useState(false);
  const [editForm, setEditForm] = useState<LoanFormState>(emptyLoanForm);
  const [scheduleRows, setScheduleRows] = useState<ScheduleRowForm[]>([]);

  // === 基本情報更新 ===
  const updateBasicMutation = useMutation({
    mutationFn: () => api.loans.update(orgId, loanId, formStateToBasicInput(editForm)),
    onSuccess: (updated) => {
      queryClient.setQueryData(["loans", "detail", orgId, loanId], updated);
      queryClient.invalidateQueries({ queryKey: ["loans", "list"] });
      setEditOpen(false);
      toast.success("基本情報を更新しました。");
    },
    onError: (err: unknown) => {
      toast.error(`更新に失敗しました: ${(err as Error).message}`);
    },
  });

  const handleOpenEdit = () => {
    if (!loan) return;
    setEditForm(normalizeLoanForm(loan));
    setEditOpen(true);
  };

  const handleSubmitEdit = () => {
    const errors = validateLoanForm(editForm);
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    updateBasicMutation.mutate();
  };

  // === スケジュール更新 ===
  const updateScheduleMutation = useMutation({
    mutationFn: () =>
      api.loans.updateSchedule(orgId, loanId, scheduleFormToRows(scheduleRows)),
    onSuccess: (updated) => {
      queryClient.setQueryData(["loans", "detail", orgId, loanId], updated);
      queryClient.invalidateQueries({ queryKey: ["loans", "list"] });
      setScheduleEditing(false);
      toast.success("スケジュールを更新しました。");
    },
    onError: (err: unknown) => {
      toast.error(`スケジュールの更新に失敗しました: ${(err as Error).message}`);
    },
  });

  const handleStartScheduleEdit = () => {
    setScheduleRows(scheduleRowsToForm(loan?.scheduleEntries));
    setScheduleEditing(true);
  };

  // === 削除 ===
  const deleteMutation = useMutation({
    mutationFn: () => api.loans.remove(orgId, loanId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loans", "list"] });
      toast.success("借入を削除しました。");
      router.push("/loans");
    },
    onError: (err: unknown) => {
      toast.error(`削除に失敗しました: ${(err as Error).message}`);
    },
  });

  // === 書類ダウンロード ===
  const openDocument = async (docId: string) => {
    try {
      const { url } = await api.loans.downloadDocument(orgId, loanId, docId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(`書類を開けませんでした: ${(err as Error).message}`);
    }
  };

  const balanceChartData = useMemo(() => {
    const rows = [...(loan?.scheduleEntries ?? [])].sort((a, b) => a.seq - b.seq);
    return rows.map((r) => ({
      label: r.dueDate || String(r.seq),
      残高: r.balanceAfter,
    }));
  }, [loan?.scheduleEntries]);

  if (!currentOrg) {
    return (
      <DashboardShell>
        <div className="mx-auto max-w-[1200px] p-6">
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              顧問先を選択してください。
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-[1280px] space-y-4 p-6">
        {/* ヘッダー */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/loans"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "gap-1",
              )}
            >
              <ArrowLeft className="h-4 w-4" />
              借入一覧へ
            </Link>
            <Landmark className="h-6 w-6 text-[var(--color-primary)]" />
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
                {loan ? loan.lenderName : "借入詳細"}
                {loan?.branchName ? ` ${loan.branchName}` : ""}
              </h1>
              {loan && (
                <p className="text-sm text-muted-foreground">
                  {loan.loanType || REPAYMENT_METHOD_LABELS[loan.repaymentMethod]}
                </p>
              )}
            </div>
          </div>
          {loan && (
            <div className="flex items-center gap-2 screen-only">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleOpenEdit}
              >
                <Pencil className="h-4 w-4" />
                基本情報を編集
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                削除
              </Button>
              <PrintButton />
            </div>
          )}
        </div>

        {/* 読込状態 */}
        {detailQuery.isLoading && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              読み込み中…
            </CardContent>
          </Card>
        )}
        {detailQuery.isError && (
          <Card>
            <CardContent className="flex items-start gap-3 p-6 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <div className="font-semibold text-[var(--color-text-primary)]">
                  借入詳細を取得できませんでした。
                </div>
                <div className="mt-1 text-muted-foreground">
                  {(detailQuery.error as Error).message}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {loan && (
          <>
            {/* 基本情報 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">基本情報</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoItem label="借入先" value={loan.lenderName} />
                  <InfoItem label="支店" value={loan.branchName || "—"} />
                  <InfoItem
                    label="借入種別"
                    value={loan.loanType || REPAYMENT_METHOD_LABELS[loan.repaymentMethod]}
                  />
                  <InfoItem label="借入総額" value={yen(loan.principal)} mono />
                  <InfoItem
                    label="利率"
                    value={
                      <span className="inline-flex items-center gap-1.5">
                        {pct(loan.interestRate)}
                        <Badge variant="outline" className="text-[10px]">
                          {RATE_TYPE_LABELS[loan.rateType]}
                        </Badge>
                      </span>
                    }
                  />
                  <InfoItem
                    label="返済方式"
                    value={REPAYMENT_METHOD_LABELS[loan.repaymentMethod]}
                  />
                  <InfoItem label="借入開始日" value={loan.startDate || "—"} />
                  <InfoItem label="返済期間" value={`${loan.termMonths}ヶ月`} />
                  <InfoItem label="返済期日" value={loan.maturityDate || "—"} />
                  <InfoItem label="当月残高" value={yen(loan.currentBalance)} mono />
                  <InfoItem
                    label="次回返済"
                    value={
                      loan.nextDueDate
                        ? `${loan.nextDueDate} / ${yen(loan.nextPaymentAmount)}`
                        : "—"
                    }
                  />
                  <InfoItem
                    label="状態"
                    value={
                      <Badge
                        variant="outline"
                        className={
                          loan.status === "REPAID"
                            ? "border-muted-foreground/30 text-muted-foreground"
                            : "border-emerald-300 bg-emerald-50 text-emerald-700"
                        }
                      >
                        {STATUS_LABELS[loan.status]}
                      </Badge>
                    }
                  />
                </dl>

                {loan.driveUrl && (
                  <div className="mt-4 border-t pt-3">
                    <a
                      href={loan.driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-[var(--color-primary)] hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Drive の関連資料を開く
                    </a>
                  </div>
                )}

                {/* 書類リスト */}
                <div className="mt-4 border-t pt-3">
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">
                    添付書類
                  </div>
                  {loan.documents.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      添付書類はありません。
                    </div>
                  ) : (
                    <ul className="space-y-1">
                      {loan.documents.map((doc) => (
                        <li key={doc.id}>
                          <button
                            type="button"
                            onClick={() => openDocument(doc.id)}
                            className="inline-flex items-center gap-1.5 text-sm text-[var(--color-primary)] hover:underline"
                          >
                            <FileText className="h-4 w-4" />
                            {doc.fileName}
                            <span className="text-xs text-muted-foreground">
                              ({doc.createdAt})
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 残高推移 */}
            {balanceChartData.length > 1 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">残高推移</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={balanceChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 10 }}
                          minTickGap={24}
                        />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v: number) => `${Math.round(v / 10000)}万`}
                        />
                        <RechartsTooltip
                          formatter={(value) => yen(Number(value))}
                        />
                        <Area
                          type="monotone"
                          dataKey="残高"
                          stroke="var(--color-primary)"
                          fill="var(--color-primary)"
                          fillOpacity={0.15}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 償還スケジュール */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">償還スケジュール</CardTitle>
                {scheduleEditing ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setScheduleEditing(false)}
                      disabled={updateScheduleMutation.isPending}
                    >
                      <X className="h-4 w-4" />
                      キャンセル
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
                      onClick={() => updateScheduleMutation.mutate()}
                      disabled={updateScheduleMutation.isPending}
                    >
                      {updateScheduleMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      保存
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleStartScheduleEdit}
                  >
                    <Pencil className="h-4 w-4" />
                    スケジュールを編集
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {scheduleEditing ? (
                  <ScheduleEditor rows={scheduleRows} onChange={setScheduleRows} />
                ) : (
                  <ScheduleTable rows={loan.scheduleEntries} />
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* 基本情報編集ダイアログ */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>基本情報を編集</DialogTitle>
            <DialogDescription>
              借入の基本情報を更新します。スケジュールは別途「スケジュールを編集」から変更してください。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto py-2">
            <LoanBasicForm
              value={editForm}
              onChange={(patch) => setEditForm((prev) => ({ ...prev, ...patch }))}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditOpen(false)}
              disabled={updateBasicMutation.isPending}
            >
              キャンセル
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
              onClick={handleSubmitEdit}
              disabled={updateBasicMutation.isPending}
            >
              {updateBasicMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>借入を削除しますか？</DialogTitle>
            <DialogDescription>
              {loan
                ? `「${loan.lenderName}${loan.branchName ? ` ${loan.branchName}` : ""}」の借入情報とスケジュールを削除します。この操作は取り消せません。`
                : "この借入を削除します。この操作は取り消せません。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteMutation.isPending}
            >
              キャンセル
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="gap-1.5"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}

function InfoItem({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-sm text-[var(--color-text-primary)]",
          mono && "font-medium tabular-nums",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
