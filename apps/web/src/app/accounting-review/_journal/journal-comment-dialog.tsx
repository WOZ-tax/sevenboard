"use client";

/**
 * 仕訳レビュー: 1 仕訳に対するコメントスレッド Dialog。
 *
 * 行クリックで開く 1 ステップ完結 UI:
 *   - 既存 root + 返信を表示
 *   - 新規 root 入力 → 「保存」で フラグ自動 upsert (resolved=false) + addComment
 *   - 各コメントに削除ボタン (本人のみ + window.confirm)
 *   - フラグ解決トグル (root 入っている前提)
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Reply, Trash2, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, type JournalReviewCommentItem, type JournalReviewFlagItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import { UrlChipsEditor } from "../_chosho/comment-dialogs";

function navigableUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "#";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

interface JournalSummary {
  id: string;
  number: string | null;
  issueDate: string | null;
  description: string | null;
}

export function JournalCommentDialog({
  open,
  onOpenChange,
  orgId,
  fiscalYear,
  month,
  journal,
  flag,
  currentUserId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  fiscalYear: number | undefined;
  month: number | undefined;
  journal: JournalSummary | null;
  flag: JournalReviewFlagItem | null;
  currentUserId: string | null;
}) {
  const qc = useQueryClient();
  const journalId = journal?.id ?? null;
  const enabled = !!orgId && !!journalId;

  const flagsKey = ["journal-flags", orgId, fiscalYear, month];
  const commentsKey = ["journal-comments-dialog", orgId, journalId];
  const commentsQuery = useQuery<JournalReviewCommentItem[]>({
    queryKey: commentsKey,
    queryFn: () => api.journalReview.listComments(orgId, journalId ? [journalId] : []),
    enabled: enabled && open,
    staleTime: 10_000,
  });

  const upsertFlag = useMutation({
    mutationFn: (input: { resolved: boolean }) =>
      api.journalReview.upsertFlag(orgId, journalId!, {
        resolved: input.resolved,
        fiscalYear: fiscalYear ?? undefined,
        month: month ?? undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: flagsKey }),
    onError: () => toast.error("フラグ更新に失敗しました"),
  });

  const addComment = useMutation({
    mutationFn: (input: { body: string; urls: string[]; parentCommentId?: string }) =>
      api.journalReview.addComment(orgId, {
        journalId: journalId!,
        body: input.body,
        urls: input.urls,
        parentCommentId: input.parentCommentId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commentsKey });
      qc.invalidateQueries({ queryKey: ["journal-comments", orgId] });
      qc.invalidateQueries({ queryKey: flagsKey });
    },
    onError: () => toast.error("コメント追加に失敗しました"),
  });

  const deleteComment = useMutation({
    mutationFn: (commentId: string) => api.journalReview.deleteComment(orgId, commentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commentsKey });
      qc.invalidateQueries({ queryKey: ["journal-comments", orgId] });
    },
    onError: () => toast.error("コメント削除に失敗しました"),
  });

  const updateComment = useMutation({
    mutationFn: (input: { commentId: string; body: string; urls: string[] }) =>
      api.journalReview.updateComment(orgId, input.commentId, {
        body: input.body,
        urls: input.urls,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commentsKey });
      qc.invalidateQueries({ queryKey: ["journal-comments", orgId] });
    },
    onError: () => toast.error("コメント編集に失敗しました"),
  });

  // 入力 state
  const [body, setBody] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  const [replyTarget, setReplyTarget] = useState<string | null>(null);

  // open 切替時に reset
  useEffect(() => {
    if (open) {
      setBody("");
      setUrls([]);
      setReplyTarget(null);
    }
  }, [open, journalId]);

  const all = commentsQuery.data ?? [];
  const roots = useMemo(() => all.filter((c) => c.parentCommentId == null), [all]);
  const repliesByRoot = useMemo(() => {
    const m = new Map<string, JournalReviewCommentItem[]>();
    for (const c of all) {
      if (c.parentCommentId) {
        const arr = m.get(c.parentCommentId);
        if (arr) arr.push(c);
        else m.set(c.parentCommentId, [c]);
      }
    }
    return m;
  }, [all]);

  const isResolved = flag?.resolvedAt != null;

  const handleSubmit = async () => {
    const trimmed = body.trim();
    if (!trimmed || !journalId) return;
    // 1) フラグ未立て or 解決済 なら立て直す (=未解決に)
    if (!flag || flag.resolvedAt != null) {
      await upsertFlag.mutateAsync({ resolved: false });
    }
    // 2) コメント追加
    await addComment.mutateAsync({
      body: trimmed,
      urls,
      parentCommentId: replyTarget ?? undefined,
    });
    setBody("");
    setUrls([]);
    setReplyTarget(null);
  };

  const isSaving = upsertFlag.isPending || addComment.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {journal?.number ? `取引No ${journal.number}` : "取引"}{" "}
            <span className="text-muted-foreground">/ {journal?.issueDate ?? "—"}</span>
          </DialogTitle>
          <DialogDescription className="truncate text-[11px]">
            {journal?.description ?? "(摘要なし)"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1.5 text-[11px]">
          {flag ? (
            isResolved ? (
              <Badge variant="outline" className="border-emerald-300 text-emerald-700">✓ 解決済</Badge>
            ) : (
              <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">未解決</Badge>
            )
          ) : (
            <Badge variant="outline" className="text-muted-foreground">フラグなし — 保存で要確認に</Badge>
          )}
          {flag && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={() => upsertFlag.mutate({ resolved: !isResolved })}
              disabled={upsertFlag.isPending}
            >
              {upsertFlag.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {isResolved ? "未解決に戻す" : "解決済にする"}
            </Button>
          )}
        </div>

        {/* スレッド表示 */}
        <div className="max-h-[280px] space-y-2 overflow-y-auto">
          {commentsQuery.isLoading ? (
            <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              読み込み中
            </div>
          ) : roots.length === 0 ? (
            <p className="rounded border border-dashed bg-muted/20 px-2 py-3 text-center text-[11px] text-muted-foreground">
              まだコメントはありません。下に書いて保存してください。
            </p>
          ) : (
            roots.map((root) => (
              <CommentRoot
                key={root.id}
                root={root}
                replies={repliesByRoot.get(root.id) ?? []}
                currentUserId={currentUserId}
                onDelete={(id) => {
                  if (typeof window !== "undefined" && window.confirm("本当に削除しますか?")) {
                    deleteComment.mutate(id);
                  }
                }}
                onUpdate={(commentId, b, u) => updateComment.mutate({ commentId, body: b, urls: u })}
                isUpdating={updateComment.isPending}
                onStartReply={() => setReplyTarget(root.id)}
                replyActive={replyTarget === root.id}
              />
            ))
          )}
        </div>

        {/* 入力 */}
        <div className="space-y-2 border-t pt-2">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {replyTarget ? "↳ 返信中" : "新規コメント"}
            </span>
            {replyTarget && (
              <button
                type="button"
                onClick={() => setReplyTarget(null)}
                className="text-[10px] hover:text-foreground"
              >
                root に切替
              </button>
            )}
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="気になった点・対応方針を記録…"
            rows={3}
            className="w-full rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
          <UrlChipsEditor urls={urls} onChange={setUrls} />
        </div>

        <DialogFooter className="gap-1.5">
          <DialogClose render={<Button variant="ghost" size="sm" className="h-7 text-xs">閉じる</Button>} />
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleSubmit}
            disabled={isSaving || !body.trim()}
          >
            {isSaving ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Plus className="mr-1.5 h-3 w-3" />}
            {flag && !isResolved ? "コメント保存" : "フラグ立てて保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommentRoot({
  root,
  replies,
  currentUserId,
  onDelete,
  onUpdate,
  isUpdating,
  onStartReply,
  replyActive,
}: {
  root: JournalReviewCommentItem;
  replies: JournalReviewCommentItem[];
  currentUserId: string | null;
  onDelete: (commentId: string) => void;
  onUpdate: (commentId: string, body: string, urls: string[]) => void;
  isUpdating: boolean;
  onStartReply: () => void;
  replyActive: boolean;
}) {
  return (
    <div className="rounded border bg-card p-2">
      <CommentBubble
        comment={root}
        currentUserId={currentUserId}
        onDelete={onDelete}
        onUpdate={onUpdate}
        isUpdating={isUpdating}
      />
      {replies.length > 0 && (
        <div className="mt-1.5 space-y-1.5 border-l-2 border-muted/60 pl-2">
          {replies.map((rep) => (
            <CommentBubble
              key={rep.id}
              comment={rep}
              currentUserId={currentUserId}
              onDelete={onDelete}
              onUpdate={onUpdate}
              isUpdating={isUpdating}
            />
          ))}
        </div>
      )}
      <div className="mt-1 flex justify-end">
        <button
          type="button"
          onClick={onStartReply}
          className={cn(
            "inline-flex items-center gap-0.5 text-[10px]",
            replyActive ? "text-[var(--color-primary)]" : "text-muted-foreground hover:text-[var(--color-primary)]",
          )}
        >
          <Reply className="h-2.5 w-2.5" />
          返信
        </button>
      </div>
    </div>
  );
}

function CommentBubble({
  comment,
  currentUserId,
  onDelete,
  onUpdate,
  isUpdating,
}: {
  comment: JournalReviewCommentItem;
  currentUserId: string | null;
  onDelete: (commentId: string) => void;
  onUpdate?: (commentId: string, body: string, urls: string[]) => void;
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
  };
  const saveEdit = () => {
    const trimmed = draftBody.trim();
    if (!trimmed || !onUpdate) return;
    onUpdate(comment.id, trimmed, draftUrls);
    setEditing(false);
  };
  return (
    <div>
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
            <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={cancelEdit} disabled={isUpdating}>
              キャンセル
            </Button>
            <Button type="button" size="sm" className="h-6 px-2 text-[10px]" onClick={saveEdit} disabled={isUpdating || !draftBody.trim()}>
              {isUpdating ? <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" /> : null}
              保存
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="whitespace-pre-wrap break-words text-xs">{comment.body}</div>
          {comment.urls.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {comment.urls.map((u) => (
                <a
                  key={u}
                  href={navigableUrl(u)}
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
                onClick={() => onDelete(comment.id)}
                className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-red-600"
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
