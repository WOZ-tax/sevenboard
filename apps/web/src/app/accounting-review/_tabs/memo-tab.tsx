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

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Reply,
  Trash2,
  Link as LinkIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  type ChoshoRecentCellComment,
  type JournalReviewCommentItem,
  type JournalReviewFlagItem,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/lib/auth";
import { useFyElapsed } from "@/hooks/use-fy-elapsed";

interface Props {
  orgId: string;
  fiscalYear: number | undefined;
  month: number | undefined;
}

interface MfJournalRefItem {
  id: string;
  number: string | null;
  issueDate: string | null;
  description: string | null;
  debits: { accountName: string; subAccountName?: string; amount: number }[];
  credits: { accountName: string; subAccountName?: string; amount: number }[];
  totalAmount: number;
}

export function MemoTab({ orgId, fiscalYear, month }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusJournal = searchParams.get("focusJournal");
  const composeOnLoad = searchParams.get("compose") === "1";
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);

  // 期間フィルタ: 「全期間 (会計年度全体)」or 「特定月度」
  // - グローバル期間セレクターで月が選ばれていれば初期値はその月
  // - "all" を選ぶと fiscalYear 内の全月分のメモを表示
  const [filterMonth, setFilterMonth] = useState<number | "all">(
    month != null ? month : "all",
  );
  // グローバル期間セレクターの月が変わったら追従 (ユーザーが all を明示選択した場合は維持)
  const [userOverride, setUserOverride] = useState(false);
  useEffect(() => {
    if (!userOverride && month != null) setFilterMonth(month);
  }, [month, userOverride]);
  const handleSetFilterMonth = (next: number | "all") => {
    setFilterMonth(next);
    setUserOverride(true);
  };

  const monthFilterValue = filterMonth === "all" ? undefined : filterMonth;
  const { fyStartMonth } = useFyElapsed();
  const monthsInFy = useMemo(() => {
    // 期首から12ヶ月分のカレンダー月を順に並べる (例: fyStart=4 → [4..12, 1..3])
    const out: number[] = [];
    for (let i = 0; i < 12; i++) out.push(((fyStartMonth - 1 + i) % 12) + 1);
    return out;
  }, [fyStartMonth]);

  // フラグ立った journal 一覧 (フィルタ反映)
  const flagsQuery = useQuery({
    queryKey: ["journal-flags", orgId, fiscalYear, monthFilterValue ?? "all"],
    queryFn: () => api.journalReview.listFlags(orgId, fiscalYear!, monthFilterValue),
    enabled: !!orgId && fiscalYear != null,
    staleTime: 30_000,
  });
  const flags = flagsQuery.data ?? [];

  // フラグ立った journal の MF 詳細を取得 (取引No / 日付 / 科目 / 摘要 用)
  // 全期間フィルタ時は会計年度内の各月を順に取得する。
  const journalsQuery = useQuery({
    queryKey: ["mf-journals-for-memo", orgId, fiscalYear, monthFilterValue ?? "all", monthsInFy.join(",")],
    queryFn: () =>
      fetchJournalsForFilter(orgId, fiscalYear!, monthFilterValue, fyStartMonth, monthsInFy),
    enabled: !!orgId && fiscalYear != null,
    staleTime: 60 * 1000,
  });
  const journalsById = useMemo(() => {
    const m = new Map<string, MfJournalRefItem>();
    for (const j of journalsQuery.data ?? []) m.set(j.id, j);
    return m;
  }, [journalsQuery.data]);

  // 期間内のフラグ立った journal_id 配列を作って、その分のコメントだけ引く
  const flaggedJournalIds = flags.map((f) => f.journalId);
  const commentsQuery = useQuery({
    queryKey: ["journal-comments", orgId, flaggedJournalIds.sort().join(",")],
    queryFn: () => api.journalReview.listComments(orgId, flaggedJournalIds),
    enabled: !!orgId && flaggedJournalIds.length > 0,
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

  // mutations
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["journal-comments", orgId] });
  };
  const addComment = useMutation({
    mutationFn: (input: { journalId: string; body: string; urls: string[]; parentCommentId?: string }) =>
      api.journalReview.addComment(orgId, input),
    onSuccess: () => invalidate(),
    onError: () => toast.error("コメント追加に失敗しました"),
  });
  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => api.journalReview.deleteComment(orgId, commentId),
    onSuccess: () => invalidate(),
    onError: () => toast.error("コメント削除に失敗しました"),
  });
  const deleteComment = (commentId: string) => deleteCommentMutation.mutate(commentId);
  const upsertFlag = useMutation({
    mutationFn: (input: { journalId: string; resolved: boolean }) =>
      api.journalReview.upsertFlag(orgId, input.journalId, {
        resolved: input.resolved,
        fiscalYear: fiscalYear ?? undefined,
        month: month ?? undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["journal-flags", orgId, fiscalYear, month] }),
  });

  // 行展開状態 + compose mode (新規 root コメント編集)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [composing, setComposing] = useState<Set<string>>(new Set());

  // URL ?focusJournal=&compose=1 で来たら自動展開 + 新規入力モード
  useEffect(() => {
    if (focusJournal) {
      setExpanded((prev) => new Set(prev).add(focusJournal));
      if (composeOnLoad) {
        setComposing((prev) => new Set(prev).add(focusJournal));
      }
      // クリアして履歴を汚さない
      const params = new URLSearchParams(searchParams.toString());
      params.delete("focusJournal");
      params.delete("compose");
      router.replace(`/accounting-review?${params.toString()}`, { scroll: false });
    }
  }, [focusJournal, composeOnLoad, router, searchParams]);

  if (!orgId || fiscalYear == null) {
    return (
      <div className="rounded-md border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        顧問先と会計年度を選択してください
      </div>
    );
  }

  if (flagsQuery.isLoading || journalsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        読み込み中…
      </div>
    );
  }

  if (flags.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        この期間にフラグ立った仕訳はありません。仕訳レビュータブで気になる仕訳をクリックしてフラグを立ててください。
      </div>
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
        <div>
          <span className="font-semibold text-[var(--color-text-primary)]">レビューメモ</span>
          <span className="ml-2">
            {fiscalYear}年度 ／ {filterMonth === "all" ? "全期間" : `${filterMonth}月度`} ／ フラグ {flags.length} 件
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">未解決 {flags.filter((f) => f.resolvedAt == null).length}</Badge>
          <Badge variant="outline" className="text-[10px]">解決済 {flags.filter((f) => f.resolvedAt != null).length}</Badge>
        </div>
      </div>

      {/* 月別フィルタ */}
      <div className="flex flex-wrap items-center gap-1 rounded-md border bg-card p-2 text-xs">
        <span className="mr-1 text-muted-foreground">期間</span>
        <Button
          type="button"
          variant={filterMonth === "all" ? "default" : "outline"}
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={() => handleSetFilterMonth("all")}
        >
          全期間
        </Button>
        {monthsInFy.map((m) => (
          <Button
            key={m}
            type="button"
            variant={filterMonth === m ? "default" : "outline"}
            size="sm"
            className="h-6 px-2 text-[11px] tabular-nums"
            onClick={() => handleSetFilterMonth(m)}
          >
            {m}月
          </Button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-[var(--color-border)] bg-[var(--color-background)]">
              <th className="w-6 px-1 py-2"></th>
              <th className="w-24 px-2 py-2 text-left font-semibold text-[var(--color-text-primary)]">取引No</th>
              <th className="w-24 px-2 py-2 text-left font-semibold text-[var(--color-text-primary)]">取引日</th>
              <th className="px-2 py-2 text-left font-semibold text-[var(--color-text-primary)]">科目</th>
              <th className="px-2 py-2 text-left font-semibold text-[var(--color-text-primary)]">摘要</th>
              <th className="w-20 px-2 py-2 text-center font-semibold text-[var(--color-text-primary)]">コメント</th>
              <th className="w-20 px-2 py-2 text-center font-semibold text-[var(--color-text-primary)]">返信</th>
              <th className="w-24 px-2 py-2 text-center font-semibold text-[var(--color-text-primary)]">ステータス</th>
            </tr>
          </thead>
          <tbody>
            {flags.map((flag) => {
              const j = journalsById.get(flag.journalId) ?? null;
              const all = commentsByJournal.get(flag.journalId) ?? [];
              const roots = all.filter((c) => c.parentCommentId == null);
              const replies = all.filter((c) => c.parentCommentId != null);
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
                  onToggleExpand={() => handleToggleExpand(flag.journalId)}
                  onStartCompose={() => handleStartCompose(flag.journalId)}
                  onEndCompose={() => handleEndCompose(flag.journalId)}
                  onAdd={(input) => addComment.mutate(input)}
                  onDelete={(id) => deleteComment(id)}
                  onToggleResolve={() =>
                    upsertFlag.mutate({ journalId: flag.journalId, resolved: !isResolved })
                  }
                  isAdding={addComment.isPending}
                  isResolving={upsertFlag.isPending}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <ChoshoCellMemoSection
        orgId={orgId}
        fiscalYear={fiscalYear}
        month={monthFilterValue}
        currentUserId={currentUserId}
      />

      <p className="text-[10px] italic text-muted-foreground">
        ▶ をクリックでスレッド展開。「コメント追加」で root、各 root の「返信」で reply。
        URL は貼ると chip 化。削除は本人のみ + 確認ポップアップあり。
      </p>
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
  onToggleResolve,
  isAdding,
  isResolving,
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
  onAdd: (input: { journalId: string; body: string; urls: string[]; parentCommentId?: string }) => void;
  onDelete: (commentId: string) => void;
  onToggleResolve: () => void;
  isAdding: boolean;
  isResolving: boolean;
}) {
  return (
    <>
      <tr className={cn("border-b border-muted/50", !isResolved && "bg-red-50/40 hover:bg-red-50/70", isResolved && "hover:bg-muted/30")}>
        <td className="px-1 py-1.5 text-center">
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-muted/60"
            aria-label={isExpanded ? "折りたたむ" : "展開"}
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        </td>
        <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground tabular-nums">
          {journal?.number ?? journal?.id ?? flag.journalId}
        </td>
        <td className="px-2 py-1.5 text-muted-foreground tabular-nums">
          {journal?.issueDate ?? "—"}
        </td>
        <td className="px-2 py-1.5">
          {journal ? <ShortAccountSummary journal={journal} /> : <span className="text-muted-foreground">—</span>}
        </td>
        <td className="max-w-[280px] truncate px-2 py-1.5 text-muted-foreground" title={journal?.description ?? ""}>
          {journal?.description ?? "—"}
        </td>
        <td className="px-2 py-1.5 text-center">
          <Badge variant={rootCount > 0 ? "secondary" : "outline"} className="text-[10px]">
            {rootCount}
          </Badge>
        </td>
        <td className="px-2 py-1.5 text-center">
          <Badge variant={replyCount > 0 ? "secondary" : "outline"} className="text-[10px]">
            {replyCount}
          </Badge>
        </td>
        <td className="px-2 py-1.5 text-center">
          <Button
            type="button"
            size="sm"
            variant={isResolved ? "outline" : "default"}
            className={cn(
              "h-6 px-2 text-[10px]",
              isResolved && "border-emerald-300 text-emerald-700",
              !isResolved && "bg-red-600 hover:bg-red-700",
            )}
            onClick={onToggleResolve}
            disabled={isResolving}
          >
            {isResolving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {isResolved ? "✓ 解決済" : "未解決"}
          </Button>
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b border-muted/50">
          <td></td>
          <td colSpan={7} className="px-2 py-2">
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
}: {
  journalId: string;
  roots: JournalReviewCommentItem[];
  replies: JournalReviewCommentItem[];
  currentUserId: string | null;
  isAdding: boolean;
  isComposing: boolean;
  onStartCompose: () => void;
  onEndCompose: () => void;
  onAdd: (input: { journalId: string; body: string; urls: string[]; parentCommentId?: string }) => void;
  onDelete: (commentId: string) => void;
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
          isAdding={isAdding}
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
  isAdding,
}: {
  journalId: string;
  root: JournalReviewCommentItem;
  replies: JournalReviewCommentItem[];
  currentUserId: string | null;
  onAdd: (input: { journalId: string; body: string; urls: string[]; parentCommentId?: string }) => void;
  onDelete: (commentId: string) => void;
  isAdding: boolean;
}) {
  const [replying, setReplying] = useState(false);
  return (
    <div className="rounded border bg-card p-2 text-xs">
      <CommentBubble
        comment={root}
        currentUserId={currentUserId}
        onDelete={() => onDelete(root.id)}
      />
      {replies.length > 0 && (
        <div className="mt-1.5 space-y-1.5 border-l-2 border-muted pl-2">
          {replies.map((rep) => (
            <CommentBubble
              key={rep.id}
              comment={rep}
              currentUserId={currentUserId}
              onDelete={() => onDelete(rep.id)}
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
}: {
  comment: { id: string; body: string; urls: string[]; authorId: string | null; authorName: string | null; createdAt: string };
  currentUserId: string | null;
  onDelete: () => void;
}) {
  const isMine = !!currentUserId && comment.authorId === currentUserId;
  return (
    <div>
      <div className="mb-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="font-semibold text-[var(--color-text-primary)]">
          {comment.authorName ?? "(不明なユーザー)"}
        </span>
        <span>·</span>
        <span>{new Date(comment.createdAt).toLocaleString("ja-JP")}</span>
      </div>
      <div className="whitespace-pre-wrap break-words text-xs">{comment.body}</div>
      {comment.urls.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {comment.urls.map((u) => (
            <a
              key={u}
              href={u}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-0.5 truncate rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-[var(--color-primary)] hover:underline"
            >
              <LinkIcon className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{u}</span>
            </a>
          ))}
        </div>
      )}
      {isMine && (
        <div className="mt-0.5 flex justify-end">
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
    </div>
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
            <span key={u} className="inline-flex max-w-full items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <LinkIcon className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{u}</span>
              <button type="button" onClick={() => setUrls(urls.filter((x) => x !== u))} className="ml-0.5 hover:text-foreground">
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
        <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px]" onClick={onCancel}>
          キャンセル
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-6 text-[10px]"
          onClick={handleSubmit}
          disabled={isSubmitting || !body.trim()}
        >
          {isSubmitting && <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />}
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
      <span className="ml-2 tabular-nums text-muted-foreground">¥{Math.round(journal.totalAmount).toLocaleString()}</span>
    </span>
  );
}

// ============================================================
// chosho セルコメントセクション (Phase 2-3)
// 期間内最新 saved version のセルコメントを journal と並列で表示
// ============================================================

function ChoshoCellMemoSection({
  orgId,
  fiscalYear,
  month,
  currentUserId,
}: {
  orgId: string;
  fiscalYear: number | undefined;
  /** undefined = 会計年度全期間、 number = 該当月のみ */
  month: number | undefined;
  currentUserId: string | null;
}) {
  const qc = useQueryClient();
  const queryKey = ["chosho-recent-cell-comments", orgId, fiscalYear, month ?? "all"];
  const cellQuery = useQuery({
    queryKey,
    queryFn: () => api.chosho.listRecentCellComments(orgId, fiscalYear!, month),
    enabled: !!orgId && fiscalYear != null,
    staleTime: 30_000,
  });
  const items = cellQuery.data ?? [];

  const addCell = useMutation({
    mutationFn: (input: {
      versionId: string;
      rowId: string;
      month: number;
      body: string;
      urls: string[];
      anomalyType: "EXPECTED_VALUE_VIOLATION" | "AGING_3M" | null;
      parentCommentId?: string;
    }) =>
      api.chosho.addCellComment(orgId, input.versionId, input.rowId, {
        month: input.month,
        body: input.body,
        urls: input.urls,
        anomalyType: input.anomalyType,
        parentCommentId: input.parentCommentId,
      }),
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

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // (rowId, month) 単位でグルーピング (1セル = 1グループ)
  const cellsGroup = useMemo(() => {
    type Group = {
      key: string;
      rowId: string;
      versionId: string;
      rowName: string;
      month: number;
      anomalyType: "EXPECTED_VALUE_VIOLATION" | "AGING_3M" | null;
      roots: ChoshoRecentCellComment[];
      replies: ChoshoRecentCellComment[];
    };
    const map = new Map<string, Group>();
    for (const c of items) {
      const key = `${c.rowId}:${c.month}`;
      let g: Group | undefined = map.get(key);
      if (!g) {
        const created: Group = {
          key,
          rowId: c.rowId,
          versionId: c.versionId,
          rowName: c.rowName,
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

  if (cellQuery.isLoading) return null;
  if (cellsGroup.length === 0) return null; // セルコメントが無い期間は section 自体非表示

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
        <span className="font-semibold text-[var(--color-text-primary)]">残高調書セル</span>
        <span>{fiscalYear}年{month}月度時点で {cellsGroup.length} 件のセルにコメント</span>
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-[var(--color-border)] bg-[var(--color-background)]">
              <th className="w-6 px-1 py-2"></th>
              <th className="w-24 px-2 py-2 text-left font-semibold text-[var(--color-text-primary)]">YYYY-MM</th>
              <th className="px-2 py-2 text-left font-semibold text-[var(--color-text-primary)]">勘定科目</th>
              <th className="w-16 px-2 py-2 text-left font-semibold text-[var(--color-text-primary)]">取引No</th>
              <th className="w-16 px-2 py-2 text-left font-semibold text-[var(--color-text-primary)]">摘要</th>
              <th className="w-20 px-2 py-2 text-center font-semibold text-[var(--color-text-primary)]">コメント</th>
              <th className="w-20 px-2 py-2 text-center font-semibold text-[var(--color-text-primary)]">返信</th>
              <th className="w-24 px-2 py-2 text-center font-semibold text-[var(--color-text-primary)]">ステータス</th>
            </tr>
          </thead>
          <tbody>
            {cellsGroup.map((g) => {
              const isExpanded = expanded.has(g.key);
              const allResolved =
                g.roots.length > 0 && g.roots.every((r) => r.resolvedAt != null);
              // YYYY-MM ラベル: fiscalYear と month から calendar year を導出するのが理想だが、
              // ここでは selectedMonth (=memoタブの month) と一致するため fiscalYear ベースで近似
              const yyyymm = formatYyyyMm(fiscalYear, g.month);
              return (
                <CellMemoRow
                  key={g.key}
                  group={g}
                  yyyymm={yyyymm}
                  isExpanded={isExpanded}
                  isResolved={allResolved}
                  currentUserId={currentUserId}
                  onToggleExpand={() => handleToggleExpand(g.key)}
                  onAdd={(input) => addCell.mutate({ versionId: g.versionId, rowId: g.rowId, ...input })}
                  onDelete={(id) => deleteCell.mutate(id)}
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
  onResolveRoot,
  isAdding,
  isResolving,
}: {
  group: {
    key: string;
    rowId: string;
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
  onResolveRoot: (rootId: string, resolved: boolean) => void;
  isAdding: boolean;
  isResolving: boolean;
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
      <tr className={cn("border-b border-muted/50", !isResolved && "bg-red-50/40 hover:bg-red-50/70", isResolved && "hover:bg-muted/30")}>
        <td className="px-1 py-1.5 text-center">
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-muted/60"
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        </td>
        <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground tabular-nums">{yyyymm}</td>
        <td className="px-2 py-1.5 text-[var(--color-text-primary)]">{group.rowName}</td>
        <td className="px-2 py-1.5 text-muted-foreground">—</td>
        <td className="px-2 py-1.5 text-muted-foreground">—</td>
        <td className="px-2 py-1.5 text-center">
          <Badge variant={rootCount > 0 ? "secondary" : "outline"} className="text-[10px]">{rootCount}</Badge>
        </td>
        <td className="px-2 py-1.5 text-center">
          <Badge variant={replyCount > 0 ? "secondary" : "outline"} className="text-[10px]">{replyCount}</Badge>
        </td>
        <td className="px-2 py-1.5 text-center">
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 text-[10px] font-medium",
              isResolved ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-red-300 bg-red-50 text-red-700",
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
                <p className="py-2 text-center text-[11px] text-muted-foreground">まだコメントはありません</p>
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
                      />
                      <button
                        type="button"
                        onClick={() => onResolveRoot(root.id, root.resolvedAt == null)}
                        disabled={isResolving}
                        className={cn(
                          "shrink-0 rounded border px-1.5 py-0.5 text-[10px]",
                          root.resolvedAt
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100",
                        )}
                        title={root.resolvedAt ? "クリックで再 open" : "クリックで解決済"}
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

/** SevenBoard fiscalYear × selectedMonth → "YYYY-MM" を近似 (期跨ぎは fiscalYear+1 補正) */
function formatYyyyMm(fiscalYear: number | undefined, month: number): string {
  if (fiscalYear == null) return `?-${String(month).padStart(2, "0")}`;
  // 期首4月以降 → 同年、期首より前 → 翌年。fyStartMonth を持たない場合は同年で近似
  return `${fiscalYear}-${String(month).padStart(2, "0")}`;
}

// ============================================================
// MF 仕訳取得 (memo タブ専用、journal-tab と同じ shape)
// ============================================================

/**
 * memo タブのフィルタ ("全期間" or 特定月) に応じて journals を取る。
 * 全期間時: 会計年度の各月を順に並列取得して合算 (期首4月なら 4-3 月)。
 */
async function fetchJournalsForFilter(
  orgId: string,
  fiscalYear: number,
  selectedMonth: number | undefined,
  fyStartMonth: number,
  monthsInFy: number[],
): Promise<MfJournalRefItem[]> {
  if (selectedMonth != null) {
    const year = selectedMonth >= fyStartMonth ? fiscalYear : fiscalYear + 1;
    const range = monthRange(year, selectedMonth);
    const data = await api.mf.getJournals(orgId, { startDate: range.start, endDate: range.end });
    return (data?.journals ?? [])
      .map(normalizeForMemo)
      .filter((j): j is MfJournalRefItem => j != null);
  }
  // 全期間: 各月を並列に取得して合算
  const all: MfJournalRefItem[] = [];
  await Promise.all(
    monthsInFy.map(async (m) => {
      const year = m >= fyStartMonth ? fiscalYear : fiscalYear + 1;
      const range = monthRange(year, m);
      try {
        const data = await api.mf.getJournals(orgId, { startDate: range.start, endDate: range.end });
        for (const j of data?.journals ?? []) {
          const norm = normalizeForMemo(j);
          if (norm) all.push(norm);
        }
      } catch {
        // 一部月の MF 取得失敗は他月に伝播させない (memo タブの目的は overlay 表示なので best-effort)
      }
    }),
  );
  return all;
}

function monthRange(year: number, month: number): { start: string; end: string } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: fmt(start), end: fmt(end) };
}

function normalizeForMemo(j: unknown): MfJournalRefItem | null {
  const obj = j as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id : null;
  if (!id) return null;
  const numberRaw = obj.number;
  const number =
    typeof numberRaw === "number" && Number.isFinite(numberRaw)
      ? String(numberRaw)
      : typeof numberRaw === "string" && numberRaw
        ? numberRaw
        : null;
  const branches = Array.isArray(obj.branches) ? (obj.branches as Record<string, unknown>[]) : [];
  const debits: MfJournalRefItem["debits"] = [];
  const credits: MfJournalRefItem["credits"] = [];
  let total = 0;
  let firstRemark: string | null = null;
  for (const b of branches) {
    if (firstRemark == null && typeof b.remark === "string" && b.remark) {
      firstRemark = b.remark;
    }
    const d = b.debitor as Record<string, unknown> | undefined;
    if (d) {
      const amount = Number(d.value ?? d.amount ?? 0);
      debits.push({
        accountName: typeof d.account_name === "string" ? d.account_name : "—",
        subAccountName: typeof d.sub_account_name === "string" ? d.sub_account_name : undefined,
        amount,
      });
      total += amount;
    }
    const c = b.creditor as Record<string, unknown> | undefined;
    if (c) {
      credits.push({
        accountName: typeof c.account_name === "string" ? c.account_name : "—",
        subAccountName: typeof c.sub_account_name === "string" ? c.sub_account_name : undefined,
        amount: Number(c.value ?? c.amount ?? 0),
      });
    }
  }
  return {
    id,
    number,
    issueDate:
      (typeof obj.transaction_date === "string" ? obj.transaction_date : null) ??
      (typeof obj.date === "string" ? obj.date : null) ??
      null,
    description:
      firstRemark ??
      (typeof obj.memo === "string" ? obj.memo : null) ??
      (typeof obj.description === "string" ? obj.description : null) ??
      null,
    debits,
    credits,
    totalAmount: total,
  };
}
