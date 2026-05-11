"use client";

/**
 * 残高調書のコメント編集 Dialog。
 *
 * RowCommentDialog : 1 行に紐づくコメント一覧 + 追加 + 削除 (1:N)
 * CellCommentDialog: 1 (row, month) に紐づくコメント (1:1) の upsert + 削除
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, X, Link as LinkIcon } from "lucide-react";
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
import type { ChoshoCellComment, ChoshoRowComment } from "@/lib/api";
import { cn } from "@/lib/utils";

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

function navigableUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "#";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

// ============================================================
// 共通: URL chips エディタ
// ============================================================

export function UrlChipsEditor({
  urls,
  onChange,
}: {
  urls: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const tryAdd = () => {
    const v = draft.trim();
    if (!v) return;
    if (urls.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...urls, v]);
    setDraft("");
  };
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold text-muted-foreground">
        参考URL (任意・最大10件)
      </label>
      <div className="flex flex-wrap gap-1">
        {urls.map((u) => (
          <span
            key={u}
            title={u}
            className="inline-flex min-w-0 max-w-full items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
          >
            <LinkIcon className="h-2.5 w-2.5 shrink-0" />
            <span className="min-w-0 truncate">{shortenUrlForDisplay(u)}</span>
            <button
              type="button"
              onClick={() => onChange(urls.filter((x) => x !== u))}
              className="ml-0.5 hover:text-foreground"
              aria-label="削除"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              tryAdd();
            }
          }}
          placeholder="https://..."
          className="flex-1 rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          onClick={tryAdd}
          disabled={!draft.trim() || urls.length >= 10}
        >
          追加
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// 行コメント Dialog
// ============================================================

export function RowCommentDialog({
  open,
  onOpenChange,
  rowName,
  rowId,
  comments,
  onAdd,
  onDelete,
  isAdding,
  currentUserId,
  editable = true,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rowName: string;
  rowId: string;
  comments: ChoshoRowComment[];
  onAdd: (input: { rowId: string; body: string; urls: string[] }) => void;
  onDelete: (commentId: string) => void;
  isAdding: boolean;
  currentUserId: string | null;
  /** false = 閲覧のみ (APPROVED 時)。追加 form と削除ボタンを非表示 */
  editable?: boolean;
}) {
  const [body, setBody] = useState("");
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      setBody("");
      setUrls([]);
    }
  }, [open]);

  const handleSubmit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    onAdd({ rowId, body: trimmed, urls });
    setBody("");
    setUrls([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">{rowName}</DialogTitle>
          <DialogDescription className="text-[11px]">
            この科目に対するコメント (複数可)
          </DialogDescription>
        </DialogHeader>

        {/* 既存コメント一覧 */}
        <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
          {comments.length === 0 ? (
            <p className="py-4 text-center text-[11px] text-muted-foreground">
              まだコメントはありません
            </p>
          ) : (
            comments.map((c) => (
              <CommentItem
                key={c.id}
                body={c.body}
                urls={c.urls}
                createdAt={c.createdAt}
                authorName={c.authorName}
                isMine={
                  editable && !!currentUserId && c.authorId === currentUserId
                }
                onDelete={() => onDelete(c.id)}
              />
            ))
          )}
        </div>

        {/* 追加フォーム (DRAFT のみ) */}
        {editable && (
          <div className="space-y-2 border-t pt-3">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="コメントを入力…"
              rows={3}
              className="w-full rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
            <UrlChipsEditor urls={urls} onChange={setUrls} />
          </div>
        )}
        {!editable && (
          <p className="border-t pt-2 text-[10px] italic text-muted-foreground">
            この調書は承認済のため、コメントは追加・削除できません
          </p>
        )}

        <DialogFooter className="gap-1.5">
          <DialogClose
            render={
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                閉じる
              </Button>
            }
          />
          {editable && (
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSubmit}
              disabled={isAdding || !body.trim()}
            >
              {isAdding ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-3 w-3" />
              )}
              追加
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// セルコメント Dialog (1:1 upsert)
// ============================================================

export function CellCommentDialog({
  open,
  onOpenChange,
  rowName,
  rowId,
  month,
  anomalyType,
  anomalyMessage,
  existing,
  onUpsert,
  onDelete,
  isSaving,
  isDeleting,
  editable = true,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rowName: string;
  rowId: string;
  month: number;
  /** null = 異常検知なし (任意セル) */
  anomalyType: "EXPECTED_VALUE_VIOLATION" | "AGING_3M" | null;
  anomalyMessage: string | null;
  existing: ChoshoCellComment | null;
  onUpsert: (input: {
    rowId: string;
    month: number;
    body: string;
    urls: string[];
    anomalyType: "EXPECTED_VALUE_VIOLATION" | "AGING_3M" | null;
  }) => void;
  onDelete: (input: { rowId: string; month: number }) => void;
  isSaving: boolean;
  isDeleting: boolean;
  /** false = 閲覧のみ (APPROVED 時) */
  editable?: boolean;
}) {
  const [body, setBody] = useState("");
  const [urls, setUrls] = useState<string[]>([]);

  // open するたび existing を反映
  useEffect(() => {
    if (open) {
      setBody(existing?.body ?? "");
      setUrls(existing?.urls ?? []);
    }
  }, [open, existing]);

  const handleSubmit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    onUpsert({ rowId, month, body: trimmed, urls, anomalyType });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {rowName} <span className="text-muted-foreground">/ {month}月</span>
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            {anomalyType
              ? "この異常への対応・根拠を記録します"
              : "このセルへのレビューメモを残します"}
          </DialogDescription>
        </DialogHeader>

        {anomalyType ? (
          <div className="rounded bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
            <span className="mr-1.5 font-semibold">
              {anomalyType === "EXPECTED_VALUE_VIOLATION"
                ? "期待残高ズレ"
                : "3ヶ月以上滞留"}
            </span>
            {anomalyMessage ?? ""}
          </div>
        ) : (
          <div className="rounded bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
            異常検知なし — 任意セルへのレビューメモです
          </div>
        )}

        {editable ? (
          <div className="space-y-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="この異常への対応・根拠を記録…"
              rows={4}
              className="w-full rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
            <UrlChipsEditor urls={urls} onChange={setUrls} />
          </div>
        ) : existing ? (
          <div className="space-y-2">
            {existing.authorName && (
              <div className="text-[10px] text-muted-foreground">
                <span className="font-semibold text-[var(--color-text-primary)]">
                  {existing.authorName}
                </span>
                <span className="mx-1">·</span>
                <span>
                  {new Date(existing.createdAt).toLocaleString("ja-JP")}
                </span>
              </div>
            )}
            <div className="whitespace-pre-wrap rounded border bg-card p-2 text-xs">
              {existing.body}
            </div>
            {existing.urls.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {existing.urls.map((u) => (
                  <a
                    key={u}
                    href={navigableUrl(u)}
                    target="_blank"
                    rel="noreferrer"
                    title={u}
                    className="inline-flex min-w-0 max-w-full items-center gap-0.5 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-[var(--color-primary)] hover:underline"
                  >
                    <LinkIcon className="h-2.5 w-2.5 shrink-0" />
                    <span className="min-w-0 truncate">
                      {shortenUrlForDisplay(u)}
                    </span>
                  </a>
                ))}
              </div>
            )}
            <p className="text-[10px] italic text-muted-foreground">
              この調書は承認済のため、コメントは編集・削除できません
            </p>
          </div>
        ) : (
          <p className="text-[11px] italic text-muted-foreground">
            この異常にコメントは付いていません (承認済のため新規追加不可)
          </p>
        )}

        <DialogFooter className="gap-1.5">
          {editable && existing && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs text-red-600 hover:text-red-700"
              onClick={() => {
                if (
                  typeof window !== "undefined" &&
                  window.confirm("本当に削除しますか?")
                ) {
                  onDelete({ rowId, month });
                }
              }}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-3 w-3" />
              )}
              削除
            </Button>
          )}
          <DialogClose
            render={
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                閉じる
              </Button>
            }
          />
          {editable && (
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSubmit}
              disabled={isSaving || !body.trim()}
            >
              {isSaving ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : null}
              {existing ? "更新" : "保存"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 1 コメント表示
// ============================================================

function CommentItem({
  body,
  urls,
  createdAt,
  authorName,
  isMine,
  onDelete,
}: {
  body: string;
  urls: string[];
  createdAt: string;
  authorName?: string | null;
  isMine: boolean;
  onDelete: () => void;
}) {
  const date = useMemo(
    () => new Date(createdAt).toLocaleString("ja-JP"),
    [createdAt],
  );
  return (
    <div className="rounded border bg-card p-2 text-xs">
      <div className="mb-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="font-semibold text-[var(--color-text-primary)]">
          {authorName ?? "(不明なユーザー)"}
        </span>
        <span>·</span>
        <span>{date}</span>
      </div>
      <div className="whitespace-pre-wrap break-words">{body}</div>
      {urls.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {urls.map((u) => (
            <a
              key={u}
              href={navigableUrl(u)}
              target="_blank"
              rel="noreferrer"
              title={u}
              className="inline-flex min-w-0 max-w-full items-center gap-0.5 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-[var(--color-primary)] hover:underline"
            >
              <LinkIcon className="h-2.5 w-2.5 shrink-0" />
              <span className="min-w-0 truncate">
                {shortenUrlForDisplay(u)}
              </span>
            </a>
          ))}
        </div>
      )}
      {isMine && (
        <div className="mt-1.5 flex justify-end">
          <button
            type="button"
            onClick={() => {
              if (
                typeof window !== "undefined" &&
                window.confirm("本当に削除しますか?")
              ) {
                onDelete();
              }
            }}
            className="text-[10px] text-muted-foreground hover:text-red-600"
          >
            削除
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 行コメント数バッジ
// ============================================================

export function RowCommentCountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Badge
      variant="secondary"
      className={cn("h-4 min-w-[16px] justify-center px-1 text-[10px]")}
    >
      {count}
    </Badge>
  );
}
