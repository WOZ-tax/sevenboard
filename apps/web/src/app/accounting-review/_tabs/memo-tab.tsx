"use client";

/**
 * レビューメモタブ — Phase 2 / Unit 2-2:
 * 「要確認」フラグが立った仕訳に対するコメント (返信ツリー) を一覧表示する。
 *
 * カラム: 取引No / 取引日 / 科目 (借方/貸方サマリ) / 摘要 / コメント / 返信 / ステータス
 *
 * - フラグなしの仕訳は表示しない
 * - 仕訳レビュー側で「メモへ」リンクを押すと URL ?focusJournal=<id>&compose=1 で
 *   該当行が展開された状態 + 新規コメント入力欄が開いた状態で着地
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Reply,
  Trash2,
  Link as LinkIcon,
  X,
} from "lucide-react";
import { UrlChipsEditor } from "../_chosho/comment-dialogs";
import { toast } from "sonner";
import {
  api,
  type ChoshoRecentCellComment,
  type JournalReviewCommentItem,
  type JournalReviewFlagItem,
  type JournalReviewSnapshotItem,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthStore } from "@/lib/auth";
import { useFyElapsed } from "@/hooks/use-fy-elapsed";
import { ThinkingIndicator } from "@/components/ai/thinking-indicator";

interface Props {
  orgId: string;
  fiscalYear: number | undefined;
  month: number | undefined;
}

type MfJournalRefItem = JournalReviewSnapshotItem;
type MemoSource = "chosho" | "journal";
const MEMO_PAGE_SIZE = 50;
const URL_DISPLAY_LIMIT = 56;

function shortenUrlForDisplay(rawUrl: string): string {
  const fallback = shortenMiddle(rawUrl, URL_DISPLAY_LIMIT);
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, "");
    const rest = `${parsed.pathname === "/" ? "" : parsed.pathname}${parsed.search}${parsed.hash}`;
    const label = `${host}${rest}`;
    return shortenMiddle(label || host, URL_DISPLAY_LIMIT);
  } catch {
    return fallback;
  }
}

function shortenMiddle(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const head = Math.max(16, Math.floor(limit * 0.62));
  const tail = Math.max(8, limit - head - 3);
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export function MemoTab({ orgId, fiscalYear, month }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusJournal = searchParams.get("focusJournal");
  const composeOnLoad = searchParams.get("compose") === "1";
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const [memoSource, setMemoSource] = useState<MemoSource>(
    focusJournal ? "journal" : "chosho",
  );
  const [journalPage, setJournalPage] = useState(1);
  const [choshoPage, setChoshoPage] = useState(1);

  // 期間フィルタ: 「全期間 (会計年度全体)」or 「特定月度」
  // 初期表示は fiscalYear 内の全期間。グローバル期間セレクターの後続変更だけ追従する。
  const [filterMonth, setFilterMonth] = useState<number | "all">("all");
  const [userOverride, setUserOverride] = useState(false);
  const observedGlobalMonthRef = useRef<number | undefined>(undefined);
  const observedFiscalYearRef = useRef<number | undefined>(fiscalYear);
  useEffect(() => {
    if (observedFiscalYearRef.current === fiscalYear) return;
    observedFiscalYearRef.current = fiscalYear;
    setFilterMonth("all");
    setUserOverride(false);
    setJournalPage(1);
    setChoshoPage(1);
  }, [fiscalYear]);
  useEffect(() => {
    const prev = observedGlobalMonthRef.current;
    observedGlobalMonthRef.current = month;
    if (prev == null || month == null || month === prev || userOverride) return;
    setFilterMonth(month);
    setJournalPage(1);
    setChoshoPage(1);
  }, [month, userOverride]);
  const handleSetFilterMonth = (next: number | "all") => {
    setFilterMonth(next);
    setUserOverride(true);
    setJournalPage(1);
    setChoshoPage(1);
  };

  const monthFilterValue = filterMonth === "all" ? undefined : filterMonth;
  const flagsQueryKey = [
    "journal-flags-page",
    orgId,
    fiscalYear,
    monthFilterValue ?? "all",
    journalPage,
    MEMO_PAGE_SIZE,
  ] as const;
  const { fyStartMonth } = useFyElapsed();
  const monthsInFy = useMemo(() => {
    // 期首から12ヶ月分のカレンダー月を順に並べる (例: fyStart=4 → [4..12, 1..3])
    const out: number[] = [];
    for (let i = 0; i < 12; i++) out.push(((fyStartMonth - 1 + i) % 12) + 1);
    return out;
  }, [fyStartMonth]);

  // フラグ立った journal 一覧 (フィルタ反映)
  const flagsQuery = useQuery({
    queryKey: flagsQueryKey,
    queryFn: () =>
      api.journalReview.listFlagsPage(orgId, fiscalYear!, {
        month: monthFilterValue,
        page: journalPage,
        limit: MEMO_PAGE_SIZE,
      }),
    enabled: memoSource === "journal" && !!orgId && fiscalYear != null,
    staleTime: 30_000,
  });
  const flagsPage = flagsQuery.data;
  const flags = flagsPage?.items ?? [];
  const flaggedJournalIds = flags.map((f) => f.journalId);
  const flaggedJournalKey = flaggedJournalIds.slice().sort().join(",");

  // フラグ立った journal の表示用 snapshot を取得。
  // 未取得月だけ API 側で MF から取得し、2回目以降はDB cacheから返す。
  const journalsQuery = useQuery({
    queryKey: [
      "journal-review-snapshots-for-memo",
      orgId,
      fiscalYear,
      monthFilterValue ?? "all",
      month ?? "no-through-month",
      flaggedJournalKey,
    ],
    queryFn: () =>
      api.journalReview.listSnapshots(orgId, {
        fiscalYear: fiscalYear!,
        month: monthFilterValue,
        throughMonth: monthFilterValue == null ? month : undefined,
        journalIds: flaggedJournalIds,
      }),
    enabled:
      memoSource === "journal" &&
      !!orgId &&
      fiscalYear != null &&
      flagsQuery.isSuccess &&
      flaggedJournalIds.length > 0,
    staleTime: 60 * 1000,
  });
  const journalsById = useMemo(() => {
    const m = new Map<string, MfJournalRefItem>();
    for (const j of journalsQuery.data ?? []) m.set(j.id, j);
    return m;
  }, [journalsQuery.data]);

  // 期間内のフラグ立った journal_id 配列を作って、その分のコメントだけ引く
  const commentsQuery = useQuery({
    queryKey: ["journal-comments", orgId, flaggedJournalKey],
    queryFn: () => api.journalReview.listComments(orgId, flaggedJournalIds),
    enabled:
      memoSource === "journal" && !!orgId && flaggedJournalIds.length > 0,
    staleTime: 30_000,
  });
  const commentsByJournal = useMemo(() => {
    const m = new Map<string, JournalReviewCommentItem[]>();
    for (const c of commentsQuery.data ?? []) {
      const arr = m.get(c.journalId);
      if (arr) arr.push(c);
      else m.set(c.journalId, [c]);
    }
    return m;
  }, [commentsQuery.data]);

  useEffect(() => {
    if (memoSource !== "journal" || !flagsPage) return;
    if (journalPage > flagsPage.totalPages)
      setJournalPage(flagsPage.totalPages);
  }, [memoSource, flagsPage, journalPage]);

  // mutations
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["journal-comments", orgId] });
  };
  const addComment = useMutation({
    mutationFn: (input: {
      journalId: string;
      body: string;
      urls: string[];
      parentCommentId?: string;
    }) => api.journalReview.addComment(orgId, input),
    onSuccess: () => invalidate(),
    onError: () => toast.error("コメント追加に失敗しました"),
  });
  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) =>
      api.journalReview.deleteComment(orgId, commentId),
    onSuccess: () => invalidate(),
    onError: () => toast.error("コメント削除に失敗しました"),
  });
  const deleteComment = (commentId: string) =>
    deleteCommentMutation.mutate(commentId);
  const updateCommentMutation = useMutation({
    mutationFn: (input: { commentId: string; body: string; urls: string[] }) =>
      api.journalReview.updateComment(orgId, input.commentId, {
        body: input.body,
        urls: input.urls,
      }),
    onSuccess: () => invalidate(),
    onError: () => toast.error("コメント編集に失敗しました"),
  });
  const updateComment = (commentId: string, body: string, urls: string[]) =>
    updateCommentMutation.mutate({ commentId, body, urls });
  const upsertFlag = useMutation({
    mutationFn: (input: {
      journalId: string;
      fiscalYear: number;
      month: number;
      resolved: boolean;
    }) =>
      api.journalReview.upsertFlag(orgId, input.journalId, {
        resolved: input.resolved,
        fiscalYear: input.fiscalYear,
        month: input.month,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: flagsQueryKey }),
  });
  const deleteFlagMutation = useMutation({
    mutationFn: (journalId: string) =>
      api.journalReview.deleteFlag(orgId, journalId),
    onSuccess: () => {
      // フラグ自体 + 紐づく全コメントが消えるので両方の cache を invalidate
      qc.invalidateQueries({ queryKey: ["journal-flags", orgId] });
      qc.invalidateQueries({ queryKey: ["journal-flags-page", orgId] });
      qc.invalidateQueries({ queryKey: ["journal-comments", orgId] });
    },
    onError: () => toast.error("レビューメモ削除に失敗しました"),
  });
  // MF 側で過去仕訳が修正された場合の手動「更新」。 該当月 (or 全期間) の
  // snapshot cache を破棄 → 次の listSnapshots 呼び出しで MF から取り直す。
  const refreshSnapshotsMutation = useMutation({
    mutationFn: () =>
      api.journalReview.refreshSnapshots(orgId, {
        fiscalYear: fiscalYear!,
        month: monthFilterValue,
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["journal-review-snapshots-for-memo", orgId],
      });
      toast.success(
        monthFilterValue == null
          ? "全期間の仕訳を最新に更新しました"
          : `${monthFilterValue}月度の仕訳を最新に更新しました`,
      );
    },
    onError: () => toast.error("更新に失敗しました"),
  });

  // 行展開状態 + compose mode (新規 root コメント編集)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [composing, setComposing] = useState<Set<string>>(new Set());

  // URL ?focusJournal=&compose=1 で来たら自動展開 + 新規入力モード
  useEffect(() => {
    if (focusJournal) {
      setMemoSource("journal");
      setExpanded((prev) => new Set(prev).add(focusJournal));
      if (composeOnLoad) {
        setComposing((prev) => new Set(prev).add(focusJournal));
      }
      // クリアして履歴を汚さない
      const params = new URLSearchParams(searchParams.toString());
      params.delete("focusJournal");
      params.delete("compose");
      router.replace(`/accounting-review?${params.toString()}`, {
        scroll: false,
      });
    }
  }, [focusJournal, composeOnLoad, router, searchParams]);

  if (!orgId || fiscalYear == null) {
    return (
      <div className="rounded-md border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        顧問先と会計年度を選択してください
      </div>
    );
  }

  // 初回 snapshot 取得は MF を 12 ヶ月分叩くため数〜十数秒。 ThinkingIndicator で
  // 段階表示する (AI 生成中と同じ感じ)。 cache hit 時は ms オーダーで終わるので、
  // この分岐に来ない。
  if (
    memoSource === "journal" &&
    (flagsQuery.isLoading || journalsQuery.isLoading)
  ) {
    return (
      <ThinkingIndicator
        stages={[
          "フラグ立った仕訳を集計中",
          "MF から仕訳詳細を取得中",
          "取引No / 科目 / 摘要 を整形中",
          "コメントスレッドと紐付け中",
        ]}
      />
    );
  }

  const handleToggleExpand = (journalId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(journalId)) next.delete(journalId);
      else next.add(journalId);
      return next;
    });
  };
  const handleStartCompose = (journalId: string) => {
    setExpanded((prev) => new Set(prev).add(journalId));
    setComposing((prev) => new Set(prev).add(journalId));
  };
  const handleEndCompose = (journalId: string) => {
    setComposing((prev) => {
      const next = new Set(prev);
      next.delete(journalId);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[var(--color-text-primary)]">
            レビューメモ
          </span>
          <span>{fiscalYear}年度</span>
          <Select
            value={filterMonth === "all" ? "all" : String(filterMonth)}
            onValueChange={(v) =>
              handleSetFilterMonth(v === "all" ? "all" : Number(v))
            }
          >
            <SelectTrigger className="h-7 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全期間</SelectItem>
              {monthsInFy.map((m) => (
                <SelectItem key={m} value={String(m)} className="tabular-nums">
                  {m}月度
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {memoSource === "journal" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => refreshSnapshotsMutation.mutate()}
              disabled={
                refreshSnapshotsMutation.isPending || fiscalYear == null
              }
              title={
                monthFilterValue == null
                  ? "全期間の仕訳キャッシュを破棄して MF から取り直す"
                  : `${monthFilterValue}月度の仕訳キャッシュを破棄して MF から取り直す`
              }
            >
              {refreshSnapshotsMutation.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : null}
              更新
            </Button>
          ) : null}
        </div>
        {memoSource === "journal" && flagsPage ? (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              未解決 {flagsPage.unresolvedTotal}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              全体 {flagsPage.total}
            </Badge>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-md border border-[var(--color-border)] bg-card p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setMemoSource("chosho")}
          className={cn(
            "relative h-10 rounded border px-3 text-sm font-semibold transition-all",
            memoSource === "chosho"
              ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] shadow-sm ring-1 ring-[var(--color-primary)]/20 before:absolute before:inset-x-3 before:top-0 before:h-0.5 before:rounded-full before:bg-[var(--color-primary)]"
              : "border-transparent text-muted-foreground hover:border-[var(--color-border)] hover:bg-muted/50 hover:text-[var(--color-text-primary)]",
          )}
        >
          残高調書
        </button>
        <button
          type="button"
          onClick={() => setMemoSource("journal")}
          className={cn(
            "relative h-10 rounded border px-3 text-sm font-semibold transition-all",
            memoSource === "journal"
              ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] shadow-sm ring-1 ring-[var(--color-primary)]/20 before:absolute before:inset-x-3 before:top-0 before:h-0.5 before:rounded-full before:bg-[var(--color-primary)]"
              : "border-transparent text-muted-foreground hover:border-[var(--color-border)] hover:bg-muted/50 hover:text-[var(--color-text-primary)]",
          )}
        >
          仕訳レビュー
          {flagsPage ? (
            <span
              className={cn(
                "ml-2 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                memoSource === "journal"
                  ? "border-[var(--color-primary)]/30 bg-background text-[var(--color-primary)]"
                  : "border-transparent bg-muted-foreground/10 text-muted-foreground",
              )}
            >
              未解決 {flagsPage.unresolvedTotal}
            </span>
          ) : null}
        </button>
      </div>

      {memoSource === "journal" ? (
        flags.length === 0 ? (
          flagsPage && flagsPage.total > 0 ? (
            <div className="rounded-md border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              ページを調整中です。
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              この期間にフラグ立った仕訳はありません。仕訳レビュータブで気になる仕訳をクリックしてフラグを立ててください。
            </div>
          )
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border bg-card">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b-2 border-[var(--color-border)] bg-[var(--color-background)]">
                    <th className="w-6 px-1 py-2"></th>
                    <th className="w-24 px-2 py-2 text-left font-semibold text-[var(--color-text-primary)]">
                      取引No
                    </th>
                    <th className="w-24 px-2 py-2 text-left font-semibold text-[var(--color-text-primary)]">
                      取引日
                    </th>
                    <th className="px-2 py-2 text-left font-semibold text-[var(--color-text-primary)]">
                      科目
                    </th>
                    <th className="px-2 py-2 text-left font-semibold text-[var(--color-text-primary)]">
                      摘要
                    </th>
                    <th className="w-20 px-2 py-2 text-center font-semibold text-[var(--color-text-primary)]">
                      コメント
                    </th>
                    <th className="w-20 px-2 py-2 text-center font-semibold text-[var(--color-text-primary)]">
                      返信
                    </th>
                    <th className="w-24 px-2 py-2 text-center font-semibold text-[var(--color-text-primary)]">
                      ステータス
                    </th>
                    <th
                      className="w-10 px-1 py-2 text-center font-semibold text-[var(--color-text-primary)]"
                      title="メモ削除"
                    ></th>
                  </tr>
                </thead>
                <tbody>
                  {flags.map((flag) => {
                    const j = journalsById.get(flag.journalId) ?? null;
                    const all = commentsByJournal.get(flag.journalId) ?? [];
                    const roots = all.filter((c) => c.parentCommentId == null);
                    const replies = all.filter(
                      (c) => c.parentCommentId != null,
                    );
                    const replyCount = replies.length;
                    const isExpanded = expanded.has(flag.journalId);
                    const isResolved = flag.resolvedAt != null;
                    return (
                      <FlaggedJournalRow
                        key={flag.journalId}
                        flag={flag}
                        journal={j}
                        rootComments={roots}
                        allReplies={replies}
                        rootCount={roots.length}
                        replyCount={replyCount}
                        isExpanded={isExpanded}
                        isComposing={composing.has(flag.journalId)}
                        isResolved={isResolved}
                        currentUserId={currentUserId}
                        onToggleExpand={() =>
                          handleToggleExpand(flag.journalId)
                        }
                        onStartCompose={() =>
                          handleStartCompose(flag.journalId)
                        }
                        onEndCompose={() => handleEndCompose(flag.journalId)}
                        onAdd={(input) => addComment.mutate(input)}
                        onDelete={(id) => deleteComment(id)}
                        onUpdate={updateComment}
                        isUpdating={updateCommentMutation.isPending}
                        onToggleResolve={() =>
                          upsertFlag.mutate({
                            journalId: flag.journalId,
                            fiscalYear: flag.fiscalYear,
                            month: flag.month,
                            resolved: !isResolved,
                          })
                        }
                        onDeleteFlag={() => {
                          if (
                            typeof window !== "undefined" &&
                            window.confirm(
                              "このレビューメモを削除しますか?\nフラグと紐づく全コメント (返信含む) が消えます。",
                            )
                          ) {
                            deleteFlagMutation.mutate(flag.journalId);
                          }
                        }}
                        isAdding={addComment.isPending}
                        isResolving={upsertFlag.isPending}
                        isDeletingFlag={deleteFlagMutation.isPending}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>

            {flagsPage ? (
              <MemoPagination
                page={journalPage}
                limit={MEMO_PAGE_SIZE}
                total={flagsPage.total}
                totalPages={flagsPage.totalPages}
                unresolvedTotal={flagsPage.unresolvedTotal}
                onPageChange={setJournalPage}
              />
            ) : null}
          </>
        )
      ) : (
        <ChoshoCellMemoSection
          orgId={orgId}
          fiscalYear={fiscalYear}
          month={monthFilterValue}
          fyStartMonth={fyStartMonth}
          currentUserId={currentUserId}
          page={choshoPage}
          pageSize={MEMO_PAGE_SIZE}
          onPageChange={setChoshoPage}
        />
      )}

      <p className="text-[10px] italic text-muted-foreground">
        ▶ をクリックでスレッド展開。「コメント追加」で root、各 root
        の「返信」で reply。 URL は貼ると chip 化。削除は本人のみ +
        確認ポップアップあり。
      </p>
    </div>
  );
}

function MemoPagination({
  page,
  limit,
  total,
  totalPages,
  unresolvedTotal,
  onPageChange,
}: {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  unresolvedTotal: number;
  onPageChange: (page: number) => void;
}) {
  const safeTotalPages = Math.max(1, totalPages);
  const clampedPage = Math.min(Math.max(page, 1), safeTotalPages);
  const start = total === 0 ? 0 : (clampedPage - 1) * limit + 1;
  const end = Math.min(total, clampedPage * limit);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <div>
        全体 {total} 件 / 未解決 {unresolvedTotal} 件
        {total > 0 ? (
          <span className="ml-2 tabular-nums">
            {start}-{end} 件を表示
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          onClick={() => onPageChange(clampedPage - 1)}
          disabled={clampedPage <= 1}
        >
          <ChevronLeft className="mr-1 h-3 w-3" />
          前へ
        </Button>
        <span className="min-w-16 text-center tabular-nums">
          {clampedPage} / {safeTotalPages}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          onClick={() => onPageChange(clampedPage + 1)}
          disabled={clampedPage >= safeTotalPages}
        >
          次へ
          <ChevronRight className="ml-1 h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// フラグ立った仕訳の 1 行 (展開で コメントスレッド表示)
// ============================================================

function FlaggedJournalRow({
  flag,
  journal,
  rootComments,
  allReplies,
  rootCount,
  replyCount,
  isExpanded,
  isComposing,
  isResolved,
  currentUserId,
  onToggleExpand,
  onStartCompose,
  onEndCompose,
  onAdd,
  onDelete,
  onUpdate,
  isUpdating,
  onToggleResolve,
  onDeleteFlag,
  isAdding,
  isResolving,
  isDeletingFlag,
}: {
  flag: JournalReviewFlagItem;
  journal: MfJournalRefItem | null;
  rootComments: JournalReviewCommentItem[];
  allReplies: JournalReviewCommentItem[];
  rootCount: number;
  replyCount: number;
  isExpanded: boolean;
  isComposing: boolean;
  isResolved: boolean;
  currentUserId: string | null;
  onToggleExpand: () => void;
  onStartCompose: () => void;
  onEndCompose: () => void;
  onAdd: (input: {
    journalId: string;
    body: string;
    urls: string[];
    parentCommentId?: string;
  }) => void;
  onDelete: (commentId: string) => void;
  onUpdate: (commentId: string, body: string, urls: string[]) => void;
  isUpdating: boolean;
  onToggleResolve: () => void;
  onDeleteFlag: () => void;
  isAdding: boolean;
  isResolving: boolean;
  isDeletingFlag: boolean;
}) {
  return (
    <>
      <tr
        className={cn(
          "border-b border-muted/50",
          !isResolved && "bg-blue-50/40 hover:bg-blue-50/70",
          isResolved && "hover:bg-muted/30",
        )}
      >
        <td className="px-1 py-1.5 text-center">
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-muted/60"
            aria-label={isExpanded ? "折りたたむ" : "展開"}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        </td>
        <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground tabular-nums">
          {journal?.number ?? journal?.id ?? flag.journalId}
        </td>
        <td className="px-2 py-1.5 text-muted-foreground tabular-nums">
          {journal?.issueDate ?? "—"}
        </td>
        <td className="px-2 py-1.5">
          {journal ? (
            <ShortAccountSummary journal={journal} />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td
          className="max-w-[280px] truncate px-2 py-1.5 text-muted-foreground"
          title={journal?.description ?? ""}
        >
          {journal?.description ?? "—"}
        </td>
        <td className="px-2 py-1.5 text-center">
          <Badge
            variant={rootCount > 0 ? "secondary" : "outline"}
            className="text-[10px]"
          >
            {rootCount}
          </Badge>
        </td>
        <td className="px-2 py-1.5 text-center">
          <Badge
            variant={replyCount > 0 ? "secondary" : "outline"}
            className="text-[10px]"
          >
            {replyCount}
          </Badge>
        </td>
        <td className="px-2 py-1.5 text-center">
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 text-[10px] font-medium",
              isResolved
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-red-300 bg-red-50 text-red-700",
            )}
          >
            {isResolved ? "✓ 解決済" : "未解決"}
          </span>
        </td>
        <td className="px-1 py-1.5 text-center">
          <button
            type="button"
            onClick={onDeleteFlag}
            disabled={isDeletingFlag}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
            title="レビューメモを削除 (フラグ + 全コメント)"
            aria-label="レビューメモを削除"
          >
            {isDeletingFlag ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b border-muted/50">
          <td></td>
          <td colSpan={8} className="px-2 py-2">
            <CommentThread
              journalId={flag.journalId}
              roots={rootComments}
              replies={allReplies}
              currentUserId={currentUserId}
              isAdding={isAdding}
              isComposing={isComposing}
              onStartCompose={onStartCompose}
              onEndCompose={onEndCompose}
              onAdd={onAdd}
              onDelete={onDelete}
              onUpdate={onUpdate}
              isUpdating={isUpdating}
              isResolved={isResolved}
              isResolving={isResolving}
              onToggleResolve={onToggleResolve}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ============================================================
// コメントスレッド (root + replies)
// ============================================================

function CommentThread({
  journalId,
  roots,
  replies,
  currentUserId,
  isAdding,
  isComposing,
  onStartCompose,
  onEndCompose,
  onAdd,
  onDelete,
  onUpdate,
  isUpdating,
  isResolved,
  isResolving,
  onToggleResolve,
}: {
  journalId: string;
  roots: JournalReviewCommentItem[];
  replies: JournalReviewCommentItem[];
  currentUserId: string | null;
  isAdding: boolean;
  isComposing: boolean;
  onStartCompose: () => void;
  onEndCompose: () => void;
  onAdd: (input: {
    journalId: string;
    body: string;
    urls: string[];
    parentCommentId?: string;
  }) => void;
  onDelete: (commentId: string) => void;
  onUpdate: (commentId: string, body: string, urls: string[]) => void;
  isUpdating: boolean;
  isResolved: boolean;
  isResolving: boolean;
  onToggleResolve: () => void;
}) {
  const repliesByRoot = useMemo(() => {
    const m = new Map<string, JournalReviewCommentItem[]>();
    for (const r of replies) {
      if (!r.parentCommentId) continue;
      const arr = m.get(r.parentCommentId);
      if (arr) arr.push(r);
      else m.set(r.parentCommentId, [r]);
    }
    return m;
  }, [replies]);

  return (
    <div className="space-y-2 rounded bg-muted/20 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">ステータス</span>
        <button
          type="button"
          onClick={onToggleResolve}
          disabled={isResolving}
          className={cn(
            "shrink-0 rounded border px-1.5 py-0.5 text-[10px]",
            isResolved
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100",
          )}
          title={isResolved ? "クリックで再オープン" : "クリックで解決済"}
        >
          {isResolving ? (
            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
          ) : null}
          {isResolved ? "✓ 解決" : "未解決"}
        </button>
      </div>
      {roots.length === 0 && !isComposing && (
        <p className="py-2 text-center text-[11px] text-muted-foreground">
          まだコメントはありません
        </p>
      )}
      {roots.map((root) => (
        <RootComment
          key={root.id}
          journalId={journalId}
          root={root}
          replies={repliesByRoot.get(root.id) ?? []}
          currentUserId={currentUserId}
          onAdd={onAdd}
          onDelete={onDelete}
          onUpdate={onUpdate}
          isAdding={isAdding}
          isUpdating={isUpdating}
        />
      ))}
      {isComposing ? (
        <CommentComposer
          placeholder="新規コメントを入力…"
          onSubmit={(body, urls) => {
            onAdd({ journalId, body, urls });
            onEndCompose();
          }}
          onCancel={onEndCompose}
          isSubmitting={isAdding}
          autoFocus
        />
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={onStartCompose}
        >
          <Plus className="mr-1 h-3 w-3" />
          コメント追加
        </Button>
      )}
    </div>
  );
}

function RootComment({
  journalId,
  root,
  replies,
  currentUserId,
  onAdd,
  onDelete,
  onUpdate,
  isAdding,
  isUpdating,
}: {
  journalId: string;
  root: JournalReviewCommentItem;
  replies: JournalReviewCommentItem[];
  currentUserId: string | null;
  onAdd: (input: {
    journalId: string;
    body: string;
    urls: string[];
    parentCommentId?: string;
  }) => void;
  onDelete: (commentId: string) => void;
  onUpdate: (commentId: string, body: string, urls: string[]) => void;
  isAdding: boolean;
  isUpdating: boolean;
}) {
  const [replying, setReplying] = useState(false);
  return (
    <div className="rounded border bg-card p-2 text-xs">
      <CommentBubble
        comment={root}
        currentUserId={currentUserId}
        onDelete={() => onDelete(root.id)}
        onUpdate={(body, urls) => onUpdate(root.id, body, urls)}
        isUpdating={isUpdating}
      />
      {replies.length > 0 && (
        <div className="mt-1.5 space-y-1.5 border-l-2 border-muted pl-2">
          {replies.map((rep) => (
            <CommentBubble
              key={rep.id}
              comment={rep}
              currentUserId={currentUserId}
              onDelete={() => onDelete(rep.id)}
              onUpdate={(body, urls) => onUpdate(rep.id, body, urls)}
              isUpdating={isUpdating}
            />
          ))}
        </div>
      )}
      <div className="mt-1.5">
        {replying ? (
          <CommentComposer
            placeholder="返信を入力…"
            onSubmit={(body, urls) => {
              onAdd({ journalId, body, urls, parentCommentId: root.id });
              setReplying(false);
            }}
            onCancel={() => setReplying(false)}
            isSubmitting={isAdding}
            autoFocus
            small
          />
        ) : (
          <button
            type="button"
            onClick={() => setReplying(true)}
            className="inline-flex items-center gap-0.5 rounded text-[10px] text-muted-foreground hover:text-[var(--color-primary)]"
          >
            <Reply className="h-2.5 w-2.5" />
            返信
          </button>
        )}
      </div>
    </div>
  );
}

/** 共通: 削除確認ポップアップ。OK で onConfirm 実行。 */
function confirmAndDelete(onConfirm: () => void) {
  if (typeof window !== "undefined" && window.confirm("本当に削除しますか?")) {
    onConfirm();
  }
}

function CommentBubble({
  comment,
  currentUserId,
  onDelete,
  onUpdate,
  isUpdating,
}: {
  comment: {
    id: string;
    body: string;
    urls: string[];
    authorId: string | null;
    authorName: string | null;
    createdAt: string;
  };
  currentUserId: string | null;
  onDelete: () => void;
  /** 本人のみ編集可。 渡されない時は編集ボタン非表示 (legacy 互換)。 */
  onUpdate?: (body: string, urls: string[]) => void;
  isUpdating?: boolean;
}) {
  const isMine = !!currentUserId && comment.authorId === currentUserId;
  const [editing, setEditing] = useState(false);
  const [draftBody, setDraftBody] = useState(comment.body);
  const [draftUrls, setDraftUrls] = useState<string[]>(comment.urls);
  const startEdit = () => {
    setDraftBody(comment.body);
    setDraftUrls(comment.urls);
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraftBody(comment.body);
    setDraftUrls(comment.urls);
  };
  const saveEdit = () => {
    const trimmed = draftBody.trim();
    if (!trimmed || !onUpdate) return;
    onUpdate(trimmed, draftUrls);
    setEditing(false);
  };
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="font-semibold text-[var(--color-text-primary)]">
          {comment.authorName ?? "(不明なユーザー)"}
        </span>
        <span>·</span>
        <span>{new Date(comment.createdAt).toLocaleString("ja-JP")}</span>
      </div>
      {editing ? (
        <div className="space-y-1.5">
          <textarea
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            rows={3}
            className="w-full rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            autoFocus
          />
          <UrlChipsEditor urls={draftUrls} onChange={setDraftUrls} />
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={cancelEdit}
              disabled={isUpdating}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={saveEdit}
              disabled={isUpdating || !draftBody.trim()}
            >
              {isUpdating ? (
                <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
              ) : null}
              保存
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="whitespace-pre-wrap break-words text-xs">
            {comment.body}
          </div>
          {comment.urls.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {comment.urls.map((u) => (
                <MemoUrlLink key={u} url={u} />
              ))}
            </div>
          )}
          {isMine && (
            <div className="mt-0.5 flex justify-end gap-2">
              {onUpdate && (
                <button
                  type="button"
                  onClick={startEdit}
                  className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-[var(--color-primary)]"
                  title="このコメントを編集"
                >
                  <Pencil className="h-2.5 w-2.5" />
                  編集
                </button>
              )}
              <button
                type="button"
                onClick={() => confirmAndDelete(onDelete)}
                className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-red-600"
                title="このコメントを削除"
              >
                <Trash2 className="h-2.5 w-2.5" />
                削除
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MemoUrlLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={url}
      className="inline-flex min-w-0 max-w-full items-center gap-0.5 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-[var(--color-primary)] hover:underline"
    >
      <LinkIcon className="h-2.5 w-2.5 shrink-0" />
      <span className="min-w-0 truncate">{shortenUrlForDisplay(url)}</span>
    </a>
  );
}

function CommentComposer({
  placeholder,
  onSubmit,
  onCancel,
  isSubmitting,
  autoFocus,
  small,
}: {
  placeholder: string;
  onSubmit: (body: string, urls: string[]) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  autoFocus?: boolean;
  small?: boolean;
}) {
  const [body, setBody] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  const [urlDraft, setUrlDraft] = useState("");
  const tryAddUrl = () => {
    const v = urlDraft.trim();
    if (!v || urls.includes(v)) {
      setUrlDraft("");
      return;
    }
    setUrls([...urls, v]);
    setUrlDraft("");
  };
  const handleSubmit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    onSubmit(trimmed, urls);
    setBody("");
    setUrls([]);
  };
  return (
    <div className={cn("space-y-1", small && "space-y-0.5")}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={small ? 2 : 3}
        autoFocus={autoFocus}
        className="w-full rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      />
      {urls.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {urls.map((u) => (
            <span
              key={u}
              title={u}
              className="inline-flex min-w-0 max-w-full items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              <LinkIcon className="h-2.5 w-2.5 shrink-0" />
              <span className="min-w-0 truncate">
                {shortenUrlForDisplay(u)}
              </span>
              <button
                type="button"
                onClick={() => setUrls(urls.filter((x) => x !== u))}
                className="ml-0.5 hover:text-foreground"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <input
          type="url"
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              tryAddUrl();
            }
          }}
          placeholder="https://... (Enter で追加)"
          className="flex-1 rounded border px-2 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 text-[10px]"
          onClick={onCancel}
        >
          キャンセル
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-6 text-[10px]"
          onClick={handleSubmit}
          disabled={isSubmitting || !body.trim()}
        >
          {isSubmitting && (
            <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
          )}
          送信
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// 借方/貸方の科目を簡潔に表示 (1 行)
// ============================================================

function ShortAccountSummary({ journal }: { journal: MfJournalRefItem }) {
  const dr = journal.debits[0]?.accountName ?? "—";
  const cr = journal.credits[0]?.accountName ?? "—";
  return (
    <span className="text-[11px]">
      <span className="text-[var(--color-text-primary)]">{dr}</span>
      <span className="mx-1 text-muted-foreground">/</span>
      <span className="text-[var(--color-text-primary)]">{cr}</span>
      <span className="ml-2 tabular-nums text-muted-foreground">
        ¥{Math.round(journal.totalAmount).toLocaleString()}
      </span>
    </span>
  );
}

// ============================================================
// chosho セルコメントセクション (Phase 2-3)
// saved rowId / preview rowKey のセルコメントを journal と並列で表示
// ============================================================

function ChoshoCellMemoSection({
  orgId,
  fiscalYear,
  month,
  fyStartMonth,
  currentUserId,
  page,
  pageSize,
  onPageChange,
}: {
  orgId: string;
  fiscalYear: number | undefined;
  /** undefined = 会計年度全期間、 number = 該当月のみ */
  month: number | undefined;
  fyStartMonth: number;
  currentUserId: string | null;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const qc = useQueryClient();
  const queryKey = [
    "chosho-recent-cell-comment-groups",
    orgId,
    fiscalYear,
    month ?? "all",
    page,
    pageSize,
  ];
  const cellQuery = useQuery({
    queryKey,
    queryFn: () =>
      api.chosho.listRecentCellCommentGroups(orgId, fiscalYear!, {
        month,
        page,
        limit: pageSize,
      }),
    enabled: !!orgId && fiscalYear != null,
    staleTime: 30_000,
  });
  const pageData = cellQuery.data;
  const items = pageData?.items ?? [];

  const addCell = useMutation({
    mutationFn: (input: {
      versionId: string | null;
      rowId: string | null;
      rowKey: string | null;
      month: number;
      body: string;
      urls: string[];
      anomalyType: "EXPECTED_VALUE_VIOLATION" | "AGING_3M" | null;
      parentCommentId?: string;
    }) => {
      if (input.rowId && input.versionId) {
        return api.chosho.addCellComment(orgId, input.versionId, input.rowId, {
          month: input.month,
          body: input.body,
          urls: input.urls,
          anomalyType: input.anomalyType,
          parentCommentId: input.parentCommentId,
        });
      }
      if (fiscalYear != null && input.rowKey) {
        return api.chosho.addPreviewCellComment(orgId, {
          fiscalYear,
          month: input.month,
          rowKey: input.rowKey,
          body: input.body,
          urls: input.urls,
          anomalyType: input.anomalyType,
          parentCommentId: input.parentCommentId,
        });
      }
      throw new Error("セルコメントの紐付け情報が不足しています");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: () => toast.error("セルコメント追加に失敗しました"),
  });
  const resolveCell = useMutation({
    mutationFn: (input: { commentId: string; resolved: boolean }) =>
      api.chosho.resolveCellComment(orgId, input.commentId, input.resolved),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: () => toast.error("解決状態の更新に失敗しました"),
  });
  const deleteCell = useMutation({
    mutationFn: (commentId: string) =>
      api.chosho.deleteCellCommentById(orgId, commentId),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: () => toast.error("削除に失敗しました"),
  });
  const updateCell = useMutation({
    mutationFn: (input: { commentId: string; body: string; urls: string[] }) =>
      api.chosho.updateCellCommentById(orgId, input.commentId, {
        body: input.body,
        urls: input.urls,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: () => toast.error("コメント編集に失敗しました"),
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // (rowId or rowKey, month) 単位でグルーピング (1セル = 1グループ)
  // saved 旧経路は rowId、preview/saved 共通の新経路は rowKey で紐付く。
  const cellsGroup = useMemo(() => {
    type Group = {
      key: string;
      rowId: string | null;
      rowKey: string | null;
      versionId: string | null;
      rowName: string;
      month: number;
      anomalyType: "EXPECTED_VALUE_VIOLATION" | "AGING_3M" | null;
      roots: ChoshoRecentCellComment[];
      replies: ChoshoRecentCellComment[];
    };
    const map = new Map<string, Group>();
    for (const c of items) {
      const targetKey = c.rowId ?? c.rowKey;
      if (!targetKey) continue;
      const key = `${targetKey}:${c.month}`;
      let g: Group | undefined = map.get(key);
      if (!g) {
        const created: Group = {
          key,
          rowId: c.rowId,
          rowKey: c.rowKey,
          versionId: c.versionId || null,
          rowName: c.rowName || displayNameFromRowKey(c.rowKey) || targetKey,
          month: c.month,
          anomalyType: c.anomalyType,
          roots: [],
          replies: [],
        };
        map.set(key, created);
        g = created;
      }
      if (c.parentCommentId) g.replies.push(c);
      else g.roots.push(c);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.rowName === b.rowName) return a.month - b.month;
      return a.rowName.localeCompare(b.rowName);
    });
  }, [items]);

  useEffect(() => {
    if (!pageData) return;
    if (page > pageData.totalPages) onPageChange(pageData.totalPages);
  }, [onPageChange, page, pageData]);

  const periodLabel =
    month == null
      ? `${fiscalYear}年度 全期間`
      : `${formatYyyyMm(fiscalYear, month, fyStartMonth)}時点`;

  if (cellQuery.isLoading) {
    return (
      <div className="rounded-md border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        残高調書セルのコメントを読み込み中です。
      </div>
    );
  }

  if (cellsGroup.length === 0) {
    if (pageData && pageData.total > 0) {
      return (
        <div className="rounded-md border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          ページを調整中です。
        </div>
      );
    }
    return (
      <div className="rounded-md border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        {periodLabel}に残高調書セルのコメントはありません。
      </div>
    );
  }

  const handleToggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-semibold text-[var(--color-text-primary)]">
          残高調書セル
        </span>
        <span>
          {periodLabel}で {pageData?.total ?? cellsGroup.length}{" "}
          件のセルにコメント
        </span>
        {pageData ? (
          <>
            <Badge variant="secondary" className="text-[10px]">
              未解決 {pageData.unresolvedTotal}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              全体 {pageData.total}
            </Badge>
          </>
        ) : null}
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-[var(--color-border)] bg-[var(--color-background)]">
              <th className="w-6 px-1 py-2"></th>
              <th className="w-24 px-2 py-2 text-left font-semibold text-[var(--color-text-primary)]">
                YYYY-MM
              </th>
              <th className="px-2 py-2 text-left font-semibold text-[var(--color-text-primary)]">
                勘定科目
              </th>
              <th className="w-16 px-2 py-2 text-left font-semibold text-[var(--color-text-primary)]">
                取引No
              </th>
              <th className="w-16 px-2 py-2 text-left font-semibold text-[var(--color-text-primary)]">
                摘要
              </th>
              <th className="w-20 px-2 py-2 text-center font-semibold text-[var(--color-text-primary)]">
                コメント
              </th>
              <th className="w-20 px-2 py-2 text-center font-semibold text-[var(--color-text-primary)]">
                返信
              </th>
              <th className="w-24 px-2 py-2 text-center font-semibold text-[var(--color-text-primary)]">
                ステータス
              </th>
            </tr>
          </thead>
          <tbody>
            {cellsGroup.map((g) => {
              const isExpanded = expanded.has(g.key);
              const allResolved =
                g.roots.length > 0 &&
                g.roots.every((r) => r.resolvedAt != null);
              const yyyymm = formatYyyyMm(fiscalYear, g.month, fyStartMonth);
              return (
                <CellMemoRow
                  key={g.key}
                  group={g}
                  yyyymm={yyyymm}
                  isExpanded={isExpanded}
                  isResolved={allResolved}
                  currentUserId={currentUserId}
                  onToggleExpand={() => handleToggleExpand(g.key)}
                  onAdd={(input) =>
                    addCell.mutate({
                      versionId: g.versionId,
                      rowId: g.rowId,
                      rowKey: g.rowKey,
                      ...input,
                    })
                  }
                  onDelete={(id) => deleteCell.mutate(id)}
                  onUpdate={(commentId, body, urls) =>
                    updateCell.mutate({ commentId, body, urls })
                  }
                  isUpdating={updateCell.isPending}
                  onResolveRoot={(rootId, resolved) =>
                    resolveCell.mutate({ commentId: rootId, resolved })
                  }
                  isAdding={addCell.isPending}
                  isResolving={resolveCell.isPending}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      {pageData ? (
        <MemoPagination
          page={page}
          limit={pageSize}
          total={pageData.total}
          totalPages={pageData.totalPages}
          unresolvedTotal={pageData.unresolvedTotal}
          onPageChange={onPageChange}
        />
      ) : null}
    </div>
  );
}

function CellMemoRow({
  group,
  yyyymm,
  isExpanded,
  isResolved,
  currentUserId,
  onToggleExpand,
  onAdd,
  onDelete,
  onUpdate,
  onResolveRoot,
  isAdding,
  isResolving,
  isUpdating,
}: {
  group: {
    key: string;
    rowId: string | null;
    rowName: string;
    month: number;
    anomalyType: "EXPECTED_VALUE_VIOLATION" | "AGING_3M" | null;
    roots: ChoshoRecentCellComment[];
    replies: ChoshoRecentCellComment[];
  };
  yyyymm: string;
  isExpanded: boolean;
  isResolved: boolean;
  currentUserId: string | null;
  onToggleExpand: () => void;
  onAdd: (input: {
    month: number;
    body: string;
    urls: string[];
    anomalyType: "EXPECTED_VALUE_VIOLATION" | "AGING_3M" | null;
    parentCommentId?: string;
  }) => void;
  onDelete: (commentId: string) => void;
  onUpdate: (commentId: string, body: string, urls: string[]) => void;
  onResolveRoot: (rootId: string, resolved: boolean) => void;
  isAdding: boolean;
  isResolving: boolean;
  isUpdating: boolean;
}) {
  const repliesByRoot = useMemo(() => {
    const m = new Map<string, ChoshoRecentCellComment[]>();
    for (const r of group.replies) {
      if (!r.parentCommentId) continue;
      const arr = m.get(r.parentCommentId);
      if (arr) arr.push(r);
      else m.set(r.parentCommentId, [r]);
    }
    return m;
  }, [group.replies]);

  const [composing, setComposing] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const rootCount = group.roots.length;
  const replyCount = group.replies.length;

  return (
    <>
      <tr
        className={cn(
          "border-b border-muted/50",
          !isResolved && "bg-blue-50/40 hover:bg-blue-50/70",
          isResolved && "hover:bg-muted/30",
        )}
      >
        <td className="px-1 py-1.5 text-center">
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-muted/60"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        </td>
        <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground tabular-nums">
          {yyyymm}
        </td>
        <td className="px-2 py-1.5 text-[var(--color-text-primary)]">
          {group.rowName}
        </td>
        <td className="px-2 py-1.5 text-muted-foreground">—</td>
        <td className="px-2 py-1.5 text-muted-foreground">—</td>
        <td className="px-2 py-1.5 text-center">
          <Badge
            variant={rootCount > 0 ? "secondary" : "outline"}
            className="text-[10px]"
          >
            {rootCount}
          </Badge>
        </td>
        <td className="px-2 py-1.5 text-center">
          <Badge
            variant={replyCount > 0 ? "secondary" : "outline"}
            className="text-[10px]"
          >
            {replyCount}
          </Badge>
        </td>
        <td className="px-2 py-1.5 text-center">
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 text-[10px] font-medium",
              isResolved
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-red-300 bg-red-50 text-red-700",
            )}
          >
            {isResolved ? "✓ 解決済" : "未解決"}
          </span>
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b border-muted/50">
          <td></td>
          <td colSpan={7} className="px-2 py-2">
            <div className="space-y-2 rounded bg-muted/20 p-2">
              {group.roots.length === 0 && !composing && (
                <p className="py-2 text-center text-[11px] text-muted-foreground">
                  まだコメントはありません
                </p>
              )}
              {group.roots.map((root) => {
                const replies = repliesByRoot.get(root.id) ?? [];
                return (
                  <div key={root.id} className="rounded border bg-card p-2">
                    <div className="flex items-start justify-between gap-2">
                      <CommentBubble
                        comment={root}
                        currentUserId={currentUserId}
                        onDelete={() => onDelete(root.id)}
                        onUpdate={(body, urls) => onUpdate(root.id, body, urls)}
                        isUpdating={isUpdating}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onResolveRoot(root.id, root.resolvedAt == null)
                        }
                        disabled={isResolving}
                        className={cn(
                          "shrink-0 rounded border px-1.5 py-0.5 text-[10px]",
                          root.resolvedAt
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100",
                        )}
                        title={
                          root.resolvedAt
                            ? "クリックで再 open"
                            : "クリックで解決済"
                        }
                      >
                        {root.resolvedAt ? "✓ 解決" : "未解決"}
                      </button>
                    </div>
                    {replies.length > 0 && (
                      <div className="mt-1.5 space-y-1.5 border-l-2 border-muted pl-2">
                        {replies.map((rep) => (
                          <CommentBubble
                            key={rep.id}
                            comment={rep}
                            currentUserId={currentUserId}
                            onDelete={() => onDelete(rep.id)}
                            onUpdate={(body, urls) =>
                              onUpdate(rep.id, body, urls)
                            }
                            isUpdating={isUpdating}
                          />
                        ))}
                      </div>
                    )}
                    <div className="mt-1.5">
                      {replyingTo === root.id ? (
                        <CommentComposer
                          placeholder="返信を入力…"
                          onSubmit={(body, urls) => {
                            onAdd({
                              month: group.month,
                              body,
                              urls,
                              anomalyType: group.anomalyType,
                              parentCommentId: root.id,
                            });
                            setReplyingTo(null);
                          }}
                          onCancel={() => setReplyingTo(null)}
                          isSubmitting={isAdding}
                          autoFocus
                          small
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setReplyingTo(root.id)}
                          className="inline-flex items-center gap-0.5 rounded text-[10px] text-muted-foreground hover:text-[var(--color-primary)]"
                        >
                          <Reply className="h-2.5 w-2.5" />
                          返信
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {composing ? (
                <CommentComposer
                  placeholder="新規コメントを入力…"
                  onSubmit={(body, urls) => {
                    onAdd({
                      month: group.month,
                      body,
                      urls,
                      anomalyType: group.anomalyType,
                    });
                    setComposing(false);
                  }}
                  onCancel={() => setComposing(false)}
                  isSubmitting={isAdding}
                  autoFocus
                />
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setComposing(true)}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  コメント追加
                </Button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** SevenBoard fiscalYear × selectedMonth → "YYYY-MM" */
function formatYyyyMm(
  fiscalYear: number | undefined,
  month: number,
  fyStartMonth: number,
): string {
  if (fiscalYear == null) return `?-${String(month).padStart(2, "0")}`;
  const year = month >= fyStartMonth ? fiscalYear : fiscalYear + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function displayNameFromRowKey(rowKey: string | null): string {
  if (!rowKey) return "";
  const tail = rowKey.split("/").filter(Boolean).at(-1) ?? rowKey;
  return tail.replace(/^\d+-/, "").replace(/_/g, " ");
}
