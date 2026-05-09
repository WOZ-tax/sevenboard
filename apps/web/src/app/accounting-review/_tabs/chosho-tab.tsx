"use client";

/**
 * 残高調書タブ — Phase 1 Unit 2A/2B-1/2B-2/2B-3:
 *   - MF推移表 (BS) を 3 階層 expandable テーブルで表示
 *   - Unit 2B-1: 選択月セルの異常検知 (零残高違反 / 3ヶ月以上滞留) を赤表示
 *   - Unit 2B-2: preview の snapshot 保存 (DRAFT) + 保存済 version 読み込み
 *   - Unit 2B-3: 行コメント (1:N) + セルコメント (1:1) の追加・編集・削除
 *
 * モード:
 *   URL ?versionId=... 指定時 → 保存済 version モード (GET /chosho/versions/:id)
 *                              + コメント機能 ON
 *   未指定時             → preview モード (MF 推移表をその場で読む)
 *                              + コメント機能 OFF (versionId が無いため)
 *
 * 次の Unit 2B-4 以降で追加:
 *   - 期待ルール編集 / 確認済✓
 *   - draft → approved 承認フロー
 */

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Loader2, MessageSquare, Save } from "lucide-react";
import { toast } from "sonner";
import { useChoshoPreview } from "@/hooks/use-chosho-preview";
import { useChoshoComments } from "@/hooks/use-chosho-comments";
import {
  api,
  type ChoshoAnomaly,
  type ChoshoCellComment,
  type ChoshoPreviewRow,
  type ChoshoRowComment,
  type ChoshoVersionDetail,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuthStore } from "@/lib/auth";
import {
  CellCommentDialog,
  RowCommentCountBadge,
  RowCommentDialog,
} from "../_chosho/comment-dialogs";

interface Props {
  orgId: string;
  fiscalYear: number | undefined;
  month: number | undefined;
}

export function ChoshoTab({ orgId, fiscalYear, month }: Props) {
  const searchParams = useSearchParams();
  const versionId = searchParams.get("versionId");

  if (versionId) {
    return <SavedVersionView orgId={orgId} versionId={versionId} />;
  }
  return <PreviewView orgId={orgId} fiscalYear={fiscalYear} month={month} />;
}

// ============================================================
// preview モード (URL に ?versionId= が無いとき)
// ============================================================

function PreviewView({ orgId, fiscalYear, month }: Props) {
  const query = useChoshoPreview({ orgId, fiscalYear, month });

  if (!orgId || fiscalYear == null || month == null) {
    return (
      <EmptyState
        message="顧問先と対象月を選択してください"
        sub="期間セレクターから fiscalYear / month を指定するとデータが読み込まれます。"
      />
    );
  }

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        MF推移表を取得中…
      </div>
    );
  }

  if (query.isError) {
    return (
      <EmptyState
        message="残高調書の取得に失敗しました"
        sub="MFクラウド会計の接続状態を確認してください。"
      />
    );
  }

  const data = query.data;
  if (!data || data.rows.length === 0) {
    return (
      <EmptyState
        message="表示できる残高がありません"
        sub="MFクラウド会計を接続すると残高調書が表示されます。"
      />
    );
  }

  return (
    <ChoshoTable
      data={data}
      headerSlot={
        <SaveDraftButton
          orgId={orgId}
          fiscalYear={data.fiscalYear}
          month={data.selectedMonth}
        />
      }
    />
  );
}

// ============================================================
// 保存済 version モード (URL に ?versionId= があるとき)
// ============================================================

function SavedVersionView({ orgId, versionId }: { orgId: string; versionId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const query = useQuery<ChoshoVersionDetail>({
    queryKey: ["chosho", "version", orgId, versionId],
    queryFn: () => api.chosho.getVersion(orgId, versionId),
    enabled: !!orgId && !!versionId,
    staleTime: 60 * 1000,
  });

  // saved version モードでのみコメント機能を有効化
  const comments = useChoshoComments({ orgId, versionId });
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);

  const approveMutation = useMutation({
    mutationFn: () => api.chosho.approveVersion(orgId, versionId),
    onSuccess: (saved) => {
      qc.setQueryData(["chosho", "version", orgId, versionId], saved);
      toast.success("残高調書を承認しました");
    },
    onError: (err) => {
      // 409 (status != DRAFT / 既存 APPROVED) は ConflictException メッセージを表示
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "承認に失敗しました";
      toast.error(msg);
    },
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        保存済の残高調書を読み込み中…
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <EmptyState
        message="保存済の残高調書が見つかりません"
        sub="version ID が無効か、別の顧問先の version の可能性があります。"
      />
    );
  }

  const data = query.data;
  // editable = DRAFT のみ。APPROVED/ARCHIVED は閲覧のみ (API 側でも mutation 拒否)
  const editable = data.status === "DRAFT";
  return (
    <ChoshoTable
      data={data}
      commentsEnabled
      commentsEditable={editable}
      rowComments={comments.rowComments.data ?? []}
      cellComments={comments.cellComments.data ?? []}
      currentUserId={currentUserId}
      onAddRowComment={comments.addRowComment.mutate}
      onDeleteRowComment={comments.deleteRowComment.mutate}
      onUpsertCellComment={comments.upsertCellComment.mutate}
      onDeleteCellComment={comments.deleteCellComment.mutate}
      isAddingRowComment={comments.addRowComment.isPending}
      isUpsertingCellComment={comments.upsertCellComment.isPending}
      isDeletingCellComment={comments.deleteCellComment.isPending}
      headerSlot={
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "font-mono text-[10px]",
              data.status === "APPROVED" && "border-emerald-500 bg-emerald-50 text-emerald-700",
            )}
          >
            {data.status === "DRAFT" ? "下書き" : data.status === "APPROVED" ? "承認済" : "保管"}
          </Badge>
          {editable && (
            <Button
              size="sm"
              variant="default"
              className="h-7 bg-emerald-600 text-xs hover:bg-emerald-700"
              onClick={() => {
                if (window.confirm("この残高調書を承認しますか? 承認後は編集できません。")) {
                  approveMutation.mutate();
                }
              }}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : null}
              承認する
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => router.push("/accounting-review")}
          >
            preview に戻る
          </Button>
        </div>
      }
    />
  );
}

// ============================================================
// 保存ボタン
// ============================================================

function SaveDraftButton({
  orgId,
  fiscalYear,
  month,
}: {
  orgId: string;
  fiscalYear: number;
  month: number;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.chosho.createVersion(orgId, { fiscalYear, month }),
    onSuccess: (saved) => {
      qc.setQueryData(["chosho", "version", orgId, saved.versionId], saved);
      toast.success("残高調書を下書き保存しました");
      // URL に ?versionId= を付けて保存済モードへ遷移
      router.push(`/accounting-review?versionId=${saved.versionId}`);
    },
    onError: () => {
      toast.error("保存に失敗しました。再度お試しください。");
    },
  });

  return (
    <Button
      size="sm"
      className="h-7 text-xs"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? (
        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
      ) : (
        <Save className="mr-1.5 h-3 w-3" />
      )}
      下書き保存
    </Button>
  );
}

interface ChoshoTableProps {
  data: {
    fiscalYear: number;
    selectedMonth: number;
    fyStartMonth: number;
    monthOrder: number[];
    rows: ChoshoPreviewRow[];
  };
  /** 右上のアクション領域 (保存ボタン or バッジ等)。 */
  headerSlot?: React.ReactNode;
  /** saved version モードのみ true。コメント機能 (閲覧+編集) の表示判定。 */
  commentsEnabled?: boolean;
  /**
   * コメントの編集可否。DRAFT のみ true。APPROVED/ARCHIVED では既存コメントは表示するが
   * 追加・更新・削除のボタンを無効化する (API 側でも 409 で拒否される)。
   */
  commentsEditable?: boolean;
  rowComments?: ChoshoRowComment[];
  cellComments?: ChoshoCellComment[];
  currentUserId?: string | null;
  onAddRowComment?: (input: { rowId: string; body: string; urls: string[] }) => void;
  onDeleteRowComment?: (commentId: string) => void;
  onUpsertCellComment?: (input: {
    rowId: string;
    month: number;
    body: string;
    urls: string[];
    anomalyType: "ZERO_VIOLATION" | "AGING_3M";
  }) => void;
  onDeleteCellComment?: (input: { rowId: string; month: number }) => void;
  isAddingRowComment?: boolean;
  isUpsertingCellComment?: boolean;
  isDeletingCellComment?: boolean;
}

function ChoshoTable({
  data,
  headerSlot,
  commentsEnabled = false,
  commentsEditable = true,
  rowComments = [],
  cellComments = [],
  currentUserId = null,
  onAddRowComment,
  onDeleteRowComment,
  onUpsertCellComment,
  onDeleteCellComment,
  isAddingRowComment = false,
  isUpsertingCellComment = false,
  isDeletingCellComment = false,
}: ChoshoTableProps) {
  // 親 rowKey の Set。closed なら子は描画しない。
  // 初期状態: level 0 (大区分) と level 1 を開く / level 2 以降は閉じる。
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const init = new Set<string>();
    for (const r of data.rows) {
      if (r.hasChildren && r.level <= 1) init.add(r.rowKey);
    }
    return init;
  });

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 描画対象: 親が全て expanded である行だけ通す。
  const visibleRows = useMemo(() => {
    // rowKey → row 引きの map
    const byKey = new Map(data.rows.map((r) => [r.rowKey, r]));
    return data.rows.filter((r) => {
      // 親を辿って 1 つでも閉じていたら hide
      let cur: ChoshoPreviewRow | undefined = r;
      while (cur && cur.parentRowKey) {
        const parent = byKey.get(cur.parentRowKey);
        if (!parent) break;
        if (!expanded.has(parent.rowKey)) return false;
        cur = parent;
      }
      return true;
    });
  }, [data.rows, expanded]);

  // 選択月の column index (monthOrder ベース)。これより後ろの月は outOfRange。
  const selectedIdx = data.monthOrder.indexOf(data.selectedMonth);

  // rowId -> その行の row comment 配列 への lookup map (saved version モードのみ)
  const rowCommentsByRow = useMemo(() => {
    const m = new Map<string, ChoshoRowComment[]>();
    for (const c of rowComments) {
      const arr = m.get(c.rowId);
      if (arr) arr.push(c);
      else m.set(c.rowId, [c]);
    }
    return m;
  }, [rowComments]);

  // (rowId, month) -> CellComment 1 件 (UNIQUE 制約あり)
  const cellCommentsByCell = useMemo(() => {
    const m = new Map<string, ChoshoCellComment>();
    for (const c of cellComments) m.set(`${c.rowId}:${c.month}`, c);
    return m;
  }, [cellComments]);

  // どの行/セルの Dialog を開いているか (一度に 1 つだけ)
  const [openRowComment, setOpenRowComment] = useState<string | null>(null); // rowId
  const [openCellComment, setOpenCellComment] = useState<{
    rowId: string;
    month: number;
    anomaly: ChoshoAnomaly;
    rowName: string;
  } | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div>
          <span className="font-semibold text-[var(--color-text-primary)]">
            残高調書 (BS)
          </span>
          <span className="ml-2">
            {data.fiscalYear}年度 / {data.selectedMonth}月度時点 (期首{data.fyStartMonth}月)
          </span>
        </div>
        <div className="flex items-center gap-3">
          {headerSlot}
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-muted/40" />
            未確定 (選択月以降)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border-l-2 border-red-500 bg-red-50" />
            異常 (0が正/3ヶ月滞留)
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-[var(--color-border)] bg-[var(--color-background)]">
              <th className="sticky left-0 z-10 min-w-[280px] bg-[var(--color-background)] px-3 py-2 text-left font-semibold text-[var(--color-text-primary)]">
                科目
              </th>
              {data.monthOrder.map((m, i) => {
                const outOfRange = selectedIdx >= 0 && i > selectedIdx;
                return (
                  <th
                    key={m}
                    className={cn(
                      "min-w-[96px] px-2 py-2 text-right font-semibold text-[var(--color-text-primary)] tabular-nums",
                      outOfRange && "bg-muted/30 text-muted-foreground/60",
                    )}
                  >
                    {m}月
                  </th>
                );
              })}
              <th className="min-w-[96px] px-2 py-2 text-right font-semibold text-[var(--color-text-primary)] tabular-nums">
                決算整理
              </th>
              {commentsEnabled && (
                <th className="min-w-[40px] px-1 py-2 text-center font-semibold text-[var(--color-text-primary)]">
                  💬
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => {
              const rowCommentList = rowCommentsByRow.get(r.rowKey) ?? [];
              const cellCommentLookup = (month: number) =>
                cellCommentsByCell.get(`${r.rowKey}:${month}`) ?? null;
              return (
                <ChoshoRow
                  key={r.rowKey}
                  row={r}
                  monthOrder={data.monthOrder}
                  selectedIdx={selectedIdx}
                  isExpanded={expanded.has(r.rowKey)}
                  onToggle={() => toggle(r.rowKey)}
                  commentsEnabled={commentsEnabled}
                  commentsEditable={commentsEditable}
                  rowCommentCount={rowCommentList.length}
                  onOpenRowComment={() => setOpenRowComment(r.rowKey)}
                  cellCommentLookup={cellCommentLookup}
                  onOpenCellComment={(month, anomaly) =>
                    setOpenCellComment({ rowId: r.rowKey, month, anomaly, rowName: r.name })
                  }
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 行コメント Dialog */}
      {commentsEnabled && openRowComment != null && (
        <RowCommentDialog
          open={openRowComment != null}
          onOpenChange={(v) => { if (!v) setOpenRowComment(null); }}
          rowId={openRowComment}
          rowName={data.rows.find((r) => r.rowKey === openRowComment)?.name ?? ""}
          comments={rowCommentsByRow.get(openRowComment) ?? []}
          onAdd={(input) => onAddRowComment?.(input)}
          onDelete={(commentId) => onDeleteRowComment?.(commentId)}
          isAdding={isAddingRowComment}
          currentUserId={currentUserId}
          editable={commentsEditable}
        />
      )}

      {/* セルコメント Dialog */}
      {commentsEnabled && openCellComment && (
        <CellCommentDialog
          open={!!openCellComment}
          onOpenChange={(v) => { if (!v) setOpenCellComment(null); }}
          rowId={openCellComment.rowId}
          rowName={openCellComment.rowName}
          month={openCellComment.month}
          anomalyType={openCellComment.anomaly.type}
          anomalyMessage={openCellComment.anomaly.message}
          existing={
            cellCommentsByCell.get(
              `${openCellComment.rowId}:${openCellComment.month}`,
            ) ?? null
          }
          onUpsert={(input) => {
            onUpsertCellComment?.(input);
            setOpenCellComment(null);
          }}
          onDelete={(input) => {
            onDeleteCellComment?.(input);
            setOpenCellComment(null);
          }}
          isSaving={isUpsertingCellComment}
          isDeleting={isDeletingCellComment}
          editable={commentsEditable}
        />
      )}
    </div>
  );
}

function ChoshoRow({
  row,
  monthOrder,
  selectedIdx,
  isExpanded,
  onToggle,
  commentsEnabled,
  commentsEditable,
  rowCommentCount,
  onOpenRowComment,
  cellCommentLookup,
  onOpenCellComment,
}: {
  row: ChoshoPreviewRow;
  monthOrder: number[];
  selectedIdx: number;
  isExpanded: boolean;
  onToggle: () => void;
  commentsEnabled: boolean;
  /** false = 閲覧のみ (APPROVED 時)。Dialog は開けるが追加/削除は無効 */
  commentsEditable: boolean;
  rowCommentCount: number;
  onOpenRowComment: () => void;
  cellCommentLookup: (month: number) => ChoshoCellComment | null;
  onOpenCellComment: (month: number, anomaly: ChoshoAnomaly) => void;
}) {
  // 大区分 (level 0) は太字背景、勘定 (level 1) は通常太字、補助以降 (level 2+) は通常文字。
  const isHeader = row.level === 0;
  const isAccountRow = row.level === 1;

  return (
    <tr
      className={cn(
        "border-b border-muted/50",
        isHeader && "bg-muted/40 font-bold",
        isAccountRow && "font-semibold",
      )}
    >
      <td
        className="sticky left-0 z-10 bg-card px-3 py-1.5 text-left"
        style={{ paddingLeft: `${0.75 + row.level * 1.25}rem` }}
      >
        <div className="flex items-center gap-1">
          {row.hasChildren ? (
            <button
              type="button"
              onClick={onToggle}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-muted/60"
              aria-label={isExpanded ? "折りたたむ" : "展開する"}
            >
              <ChevronRight
                className={cn(
                  "h-3 w-3 transition-transform",
                  isExpanded && "rotate-90",
                )}
              />
            </button>
          ) : (
            <span className="inline-block h-4 w-4 shrink-0" />
          )}
          <span
            className={cn(
              isHeader
                ? "text-[var(--color-text-primary)]"
                : isAccountRow
                  ? "text-[var(--color-text-primary)]"
                  : "text-muted-foreground",
            )}
          >
            {row.name}
          </span>
        </div>
      </td>
      {monthOrder.map((m, i) => {
        const outOfRange = selectedIdx >= 0 && i > selectedIdx;
        const v = row.monthlyBalances[m];
        // 異常は selectedMonth セルにのみ付く (builder 側保証)。
        // anomalies[0].month と m が一致するセルだけ赤表示。
        const cellAnomalies = row.anomalies.filter((a) => a.month === m);
        const hasAnomaly = cellAnomalies.length > 0 && !outOfRange;
        const cellComment = commentsEnabled ? cellCommentLookup(m) : null;
        const hasCellComment = !!cellComment;
        const cellClass = cn(
          "px-2 py-1.5 text-right tabular-nums",
          v != null && v < 0 && "text-[var(--color-negative)]",
          outOfRange && "bg-muted/20 text-muted-foreground/50",
          hasAnomaly && "border-l-2 border-red-500 bg-red-50 font-semibold text-red-700",
        );
        const content = v != null ? formatYen(v) : "";
        if (hasAnomaly) {
          return (
            <td key={m} className={cellClass}>
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  onClick={
                    commentsEnabled
                      ? () => onOpenCellComment(m, cellAnomalies[0])
                      : undefined
                  }
                  className={cn(
                    "bg-transparent p-0 text-inherit underline decoration-red-300 decoration-dotted underline-offset-2",
                    commentsEnabled ? "cursor-pointer" : "cursor-help",
                  )}
                >
                  {content}
                  {hasCellComment && (
                    <span className="ml-0.5 text-[9px]" title="コメントあり">
                      💬
                    </span>
                  )}
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <AnomalyTooltipBody anomalies={cellAnomalies} hint={commentsEnabled ? "クリックでコメント編集" : undefined} />
                </TooltipContent>
              </Tooltip>
            </td>
          );
        }
        return (
          <td key={m} className={cellClass}>
            {content}
          </td>
        );
      })}
      <td className="px-2 py-1.5 text-right tabular-nums">
        {row.settlementBalance != null ? formatYen(row.settlementBalance) : ""}
      </td>
      {commentsEnabled && (
        <td className="px-1 py-1.5 text-center">
          {/* level 0 (大区分) は親集計なのでコメント不要 */}
          {row.level > 0 && (
            <button
              type="button"
              onClick={onOpenRowComment}
              className="inline-flex items-center gap-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              aria-label="行コメント"
            >
              <MessageSquare className="h-3 w-3" />
              <RowCommentCountBadge count={rowCommentCount} />
            </button>
          )}
        </td>
      )}
    </tr>
  );
}

function AnomalyTooltipBody({
  anomalies,
  hint,
}: {
  anomalies: ChoshoAnomaly[];
  hint?: string;
}) {
  const labelOf = (type: ChoshoAnomaly["type"]): string => {
    if (type === "ZERO_VIOLATION") return "0が正のはずが残高あり";
    if (type === "AGING_3M") return "3ヶ月以上滞留";
    return type;
  };
  return (
    <div className="space-y-1.5 text-xs">
      {anomalies.map((a, i) => (
        <div key={i}>
          <div className="font-semibold text-red-700">{labelOf(a.type)}</div>
          <div className="text-muted-foreground">{a.message}</div>
        </div>
      ))}
      {hint && <div className="text-[10px] italic text-muted-foreground">{hint}</div>}
    </div>
  );
}

function formatYen(n: number): string {
  return Math.round(n).toLocaleString();
}

function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="rounded-md border border-dashed bg-muted/20 p-8 text-center">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
        {message}
      </h3>
      {sub && (
        <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}
