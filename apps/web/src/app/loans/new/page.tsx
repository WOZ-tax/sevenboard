"use client";

export const dynamic = "force-dynamic";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  FileUp,
  Landmark,
  Loader2,
  Pencil,
  Sparkles,
} from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { useCurrentOrg } from "@/contexts/current-org";
import { useScopedOrgId } from "@/hooks/use-scoped-org-id";
import { api, isMfNotConnected } from "@/lib/api";
import type { LoanExtractValidation } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { LoanBasicForm } from "../_components/loan-basic-form";
import { ScheduleEditor } from "../_components/schedule-editor";
import {
  emptyLoanForm,
  formStateToBasicInput,
  generateSchedule,
  normalizeLoanForm,
  scheduleFormToRows,
  scheduleRowsToForm,
  toNumberOrNull,
  validateLoanForm,
  type LoanFormState,
  type ScheduleRowForm,
} from "../_lib/loan-format";

type Mode = "pdf" | "manual";

export default function NewLoanPage() {
  const { currentOrg } = useCurrentOrg();
  const orgId = useScopedOrgId();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("pdf");
  const [form, setForm] = useState<LoanFormState>(emptyLoanForm);
  const [scheduleRows, setScheduleRows] = useState<ScheduleRowForm[]>([]);
  const [documentId, setDocumentId] = useState<string | undefined>(undefined);
  const [validation, setValidation] = useState<LoanExtractValidation | null>(
    null,
  );
  const [extractedFileName, setExtractedFileName] = useState<string | null>(
    null,
  );

  const patchForm = useCallback((patch: Partial<LoanFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const rowIssues = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const issue of validation?.rowIssues ?? []) {
      const list = map.get(issue.seq) ?? [];
      list.push(issue.message);
      map.set(issue.seq, list);
    }
    return map;
  }, [validation]);

  // === PDF 抽出 ===
  const extractMutation = useMutation({
    mutationFn: (file: File) => api.loans.extract(orgId, file),
    onSuccess: (res, file) => {
      setDocumentId(res.documentId);
      setValidation(res.validation);
      setExtractedFileName(file.name);
      if (res.draft) {
        setForm(normalizeLoanForm(res.draft.loan));
        setScheduleRows(scheduleRowsToForm(res.draft.entries));
        toast.success("PDF から読み取りました。内容を確認してください。");
      } else {
        // 読取失敗: フォームは空のまま、手入力を促す
        setScheduleRows([]);
        toast.warning(
          "PDF から自動読み取りできませんでした。手入力で登録してください。",
        );
      }
    },
    onError: (err: unknown) => {
      toast.error(
        isMfNotConnected(err)
          ? "MF が未接続のため読み取りできません。"
          : `PDF の読み取りに失敗しました: ${(err as Error).message}`,
      );
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 同じファイルを選び直しても onChange が発火するようリセット
    e.target.value = "";
    if (!file) return;
    if (!orgId) {
      toast.error("顧問先が未選択です。");
      return;
    }
    extractMutation.mutate(file);
  };

  // === 元利均等で自動生成 ===
  const handleAutoGenerate = useCallback(() => {
    const principal = toNumberOrNull(form.principal);
    const rate = toNumberOrNull(form.interestRate);
    const term = toNumberOrNull(form.termMonths);
    if (!principal || principal <= 0 || !term || term <= 0) {
      toast.error("借入総額・返済期間を入力してから自動生成してください。");
      return;
    }
    if (!form.startDate) {
      toast.error("借入開始日を入力してから自動生成してください。");
      return;
    }
    const rows = generateSchedule({
      principal,
      annualRatePct: rate ?? 0,
      termMonths: term,
      startDate: form.startDate,
      method: form.repaymentMethod,
      markEstimated: form.rateType === "VARIABLE",
    });
    setScheduleRows(scheduleRowsToForm(rows));
    // 自動生成後は前回の PDF 検算結果を消す (行が入れ替わったため)
    setValidation((prev) =>
      prev ? { ...prev, rowIssues: [] } : prev,
    );
    toast.success(`${rows.length}回分のスケジュールを生成しました。`);
  }, [form]);

  // === 登録 ===
  const createMutation = useMutation({
    mutationFn: () => {
      const input = {
        ...formStateToBasicInput(form),
        scheduleEntries: scheduleFormToRows(scheduleRows),
        ...(documentId ? { documentId } : {}),
      };
      return api.loans.create(orgId, input);
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["loans", "list"] });
      toast.success("借入を登録しました。");
      router.push(`/loans/${created.id}`);
    },
    onError: (err: unknown) => {
      toast.error(`登録に失敗しました: ${(err as Error).message}`);
    },
  });

  const handleSubmit = () => {
    const errors = validateLoanForm(form);
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    if (!orgId) {
      toast.error("顧問先が未選択です。");
      return;
    }
    createMutation.mutate();
  };

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

  const globalIssues = validation?.globalIssues ?? [];
  const showForm = mode === "manual" || documentId != null || scheduleRows.length > 0;

  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-[1280px] space-y-4 p-6">
        {/* ヘッダー */}
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
              借入を登録
            </h1>
            <p className="text-sm text-muted-foreground">
              契約書 PDF の読み取り、または手入力で登録します。
            </p>
          </div>
        </div>

        {/* モード切替タブ */}
        <div className="inline-flex rounded-lg border bg-muted p-1">
          <ModeTab
            active={mode === "pdf"}
            onClick={() => setMode("pdf")}
            icon={<FileUp className="h-4 w-4" />}
            label="PDFから読み取り"
          />
          <ModeTab
            active={mode === "manual"}
            onClick={() => setMode("manual")}
            icon={<Pencil className="h-4 w-4" />}
            label="手入力"
          />
        </div>

        {/* PDF アップロード */}
        {mode === "pdf" && (
          <Card>
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
              <label
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "cursor-pointer gap-1.5",
                  extractMutation.isPending && "pointer-events-none opacity-60",
                )}
              >
                {extractMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileUp className="h-4 w-4" />
                )}
                契約書 PDF を選択
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={extractMutation.isPending}
                />
              </label>
              <span className="text-sm text-muted-foreground">
                {extractMutation.isPending
                  ? "読み取り中…"
                  : extractedFileName
                    ? `読み取り済み: ${extractedFileName}`
                    : "PDF を選ぶと基本情報とスケジュールを自動抽出します。"}
              </span>
            </CardContent>
          </Card>
        )}

        {/* グローバル検算エラー (警告のみ・ブロックしない) */}
        {globalIssues.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              検算で要確認の項目があります(修正して登録できます)
            </div>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-8 text-xs text-amber-800">
              {globalIssues.map((issue) => (
                <li key={issue.code}>{issue.message}</li>
              ))}
            </ul>
          </div>
        )}

        {showForm && (
          <>
            {/* 基本情報 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">基本情報</CardTitle>
              </CardHeader>
              <CardContent>
                <LoanBasicForm value={form} onChange={patchForm} />
              </CardContent>
            </Card>

            {/* 償還スケジュール */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">償還スケジュール</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleAutoGenerate}
                >
                  <Sparkles className="h-4 w-4" />
                  {form.repaymentMethod === "EQUAL_PRINCIPAL"
                    ? "元金均等で自動生成"
                    : "元利均等で自動生成"}
                </Button>
              </CardHeader>
              <CardContent>
                <ScheduleEditor
                  rows={scheduleRows}
                  onChange={setScheduleRows}
                  rowIssues={rowIssues}
                />
              </CardContent>
            </Card>

            {/* 登録 */}
            <div className="flex items-center justify-end gap-2">
              <Link
                href="/loans"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                キャンセル
              </Link>
              <Button
                size="sm"
                className="gap-1.5 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
                onClick={handleSubmit}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                この内容で登録
              </Button>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
