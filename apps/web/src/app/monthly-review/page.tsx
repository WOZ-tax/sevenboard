"use client";

import { useQuery } from "@tanstack/react-query";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useScopedOrgId } from "@/hooks/use-scoped-org-id";
import { usePeriodStore, getPeriodLabel } from "@/lib/period-store";
import { PeriodSegmentControl } from "@/components/ui/period-segment-control";
import { useMfOffice } from "@/hooks/use-mf-data";
import { usePeriodDefaultFromKintone } from "@/hooks/use-kintone-progress";
import { AlertTriangle, Play, Loader2, Printer } from "lucide-react";
// 描画部品は accounting-review 配下の _review/ に置いたまま参照する
// (本再編はメニュー構成の変更が目的なので、ファイルの移動は行わない)。
import { TbReviewResult } from "@/app/accounting-review/_review/tbreview-result";

/**
 * 月次レビュー — tb-review エンジン (REVIEW_ENGINE=tbreview) ネイティブ表示。
 *
 * 旧: /accounting-review の「経理レビュー」タブ。独立メニュー化に伴い専用ページへ移設した。
 * 旧エンジン (legacy) 用のレイアウトは廃棄済み。API が tbreview を返さない場合は
 * 代替表示に落とさず、設定不備として明示する（silent fallback 禁止）。
 */
export default function MonthlyReviewPage() {
  const orgId = useScopedOrgId();
  // kintone 月次進捗の「納品済」最新月を期間デフォルトに自動適用
  usePeriodDefaultFromKintone();
  const { fiscalYear, month, periods } = usePeriodStore();
  const periodLabel = getPeriodLabel(fiscalYear, month, periods);
  const office = useMfOffice();

  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-[1200px] space-y-4">
        {/* 印刷専用ヘッダー */}
        <div className="print-only" data-print-block>
          <h1 className="text-xl font-bold">月次レビュー報告書</h1>
          <div className="mt-1 text-sm">
            {office.data?.name || "—"} — {periodLabel}
          </div>
          <div className="mt-0.5 text-xs text-gray-600">
            出力日: {new Date().toLocaleDateString("ja-JP")}
          </div>
          <hr className="mt-2" />
        </div>

        {/* ヘッダー */}
        <div className="flex items-start justify-between gap-3 screen-only">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
              月次レビュー
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {office.data?.name || "—"} — {periodLabel}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs shrink-0"
            onClick={() => window.print()}
            aria-label="このページをPDFとして出力"
          >
            <Printer className="h-3 w-3" />
            PDF出力
          </Button>
        </div>

        <PeriodSegmentControl showAllPeriod={false} label="対象月（単月）" highlightRange={false} />

        <ReviewBody orgId={orgId} fiscalYear={fiscalYear} month={month} />
      </div>
    </DashboardShell>
  );
}

function ReviewBody({
  orgId,
  fiscalYear,
  month,
}: {
  orgId: string;
  fiscalYear?: number;
  month?: number;
}) {
  const reviewQuery = useQuery({
    queryKey: ["review", orgId, fiscalYear, month],
    queryFn: () => api.review.run(orgId, fiscalYear, month),
    enabled: false,
    staleTime: 30 * 60 * 1000,
  });

  if (!reviewQuery.data && !reviewQuery.isFetching && !reviewQuery.isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertTriangle className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">PL/BS/仕訳/消費税の定量チェックを実行します</p>
          <Button className="mt-4 gap-2 bg-[var(--color-primary)] text-white" onClick={() => reviewQuery.refetch()}>
            <Play className="h-4 w-4" />月次レビュー実行
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (reviewQuery.isError) {
    const err = reviewQuery.error as { statusCode?: number; message?: string } | null;
    const status = err?.statusCode;
    const isMfDisconnected = status === 503;
    const isAuth = status === 401 || status === 403;
    const title = isMfDisconnected
      ? "MFクラウド会計に接続されていません"
      : isAuth
        ? "権限がないか、セッションが切れています"
        : "レビュー実行に失敗しました";
    const hint = isMfDisconnected
      ? "設定 > 連携から MF 接続を完了してください"
      : isAuth
        ? "再ログインのうえお試しください"
        : err?.message || "時間をおいて再試行してください";
    return (
      <Card><CardContent className="py-8 text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-400" />
        <p className="text-sm font-semibold text-red-600">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        {!isMfDisconnected && !isAuth && (
          <Button className="mt-4" variant="outline" onClick={() => reviewQuery.refetch()}>再試行</Button>
        )}
      </CardContent></Card>
    );
  }

  if (reviewQuery.isFetching) {
    return (
      <Card><CardContent className="flex items-center justify-center gap-3 py-12">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary)]" />
        <span className="text-sm text-muted-foreground">分析実行中... PL/BS/仕訳/消費税を検証しています</span>
      </CardContent></Card>
    );
  }

  const d = reviewQuery.data;
  if (!d) return null;

  // tb-review エンジンのレスポンス以外は描画しない。旧エンジン形式で返ってきた場合は
  // 旧レイアウトへ落とさず設定不備として明示する（表示できたように見せない）。
  if (!d.tbreview) {
    return (
      <Card data-testid="review-engine-legacy-response">
        <CardContent className="py-8 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-400" />
          <p className="text-sm font-semibold text-red-600">
            レビューエンジンが旧形式で応答しました
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            この画面は tb-review エンジンの結果のみを表示します。管理者にお問い合わせください。
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => reviewQuery.refetch()}
            disabled={reviewQuery.isFetching}
          >
            再実行
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <TbReviewResult
      data={d}
      onRerun={() => reviewQuery.refetch()}
      isRerunning={reviewQuery.isFetching}
    />
  );
}
