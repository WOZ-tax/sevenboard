"use client";

import { Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_URL_DISPLAY_LIMIT = 44;

export function navigableUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "#";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

export function shortenUrlForDisplay(
  rawUrl: string,
  limit = DEFAULT_URL_DISPLAY_LIMIT,
): string {
  const trimmed = rawUrl.trim();
  const fallback = shortenMiddle(trimmed || rawUrl, limit);
  try {
    const parsed = new URL(navigableUrl(trimmed));
    const host = parsed.hostname.replace(/^www\./, "");
    const rest = `${parsed.pathname === "/" ? "" : parsed.pathname}${parsed.search}${parsed.hash}`;
    return shortenMiddle(`${host}${rest}` || host, limit);
  } catch {
    return fallback;
  }
}

function shortenMiddle(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const head = Math.max(14, Math.floor(limit * 0.58));
  const tail = Math.max(8, limit - head - 3);
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export function CommentUrlLink({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  return (
    <a
      href={navigableUrl(url)}
      target="_blank"
      rel="noreferrer"
      title={url}
      aria-label={`URLを開く: ${url}`}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "inline-grid min-w-0 max-w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-0.5 overflow-hidden rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-[var(--color-primary)] align-middle hover:underline",
        className,
      )}
    >
      <LinkIcon className="h-2.5 w-2.5 shrink-0" />
      <span className="min-w-0 truncate">{shortenUrlForDisplay(url)}</span>
    </a>
  );
}

const URL_TOKEN_PATTERN =
  /((?:https?:\/\/|www\.)[^\s<>"']+|[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(?:[/?#][^\s<>"']*)?)/gi;

export function LinkedCommentText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const parts = splitTextWithUrls(text);
  return (
    <div className={cn("whitespace-pre-wrap break-words", className)}>
      {parts.map((part, index) =>
        part.kind === "url" ? (
          <a
            key={`${part.value}-${index}`}
            href={navigableUrl(part.value)}
            target="_blank"
            rel="noreferrer"
            title={part.value}
            onClick={(event) => event.stopPropagation()}
            className="inline max-w-full break-all text-[var(--color-primary)] underline underline-offset-2 hover:opacity-80"
          >
            {shortenUrlForDisplay(part.value, 52)}
          </a>
        ) : (
          <span key={`${index}-${part.value.slice(0, 8)}`}>
            {part.value}
          </span>
        ),
      )}
    </div>
  );
}

function splitTextWithUrls(
  text: string,
): Array<{ kind: "text" | "url"; value: string }> {
  const parts: Array<{ kind: "text" | "url"; value: string }> = [];
  let lastIndex = 0;
  for (const match of text.matchAll(URL_TOKEN_PATTERN)) {
    const raw = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ kind: "text", value: text.slice(lastIndex, index) });
    }
    const { url, trailing } = splitTrailingPunctuation(raw);
    parts.push({ kind: "url", value: url });
    if (trailing) {
      parts.push({ kind: "text", value: trailing });
    }
    lastIndex = index + raw.length;
  }
  if (lastIndex < text.length) {
    parts.push({ kind: "text", value: text.slice(lastIndex) });
  }
  return parts.length > 0 ? parts : [{ kind: "text", value: text }];
}

function splitTrailingPunctuation(rawUrl: string): {
  url: string;
  trailing: string;
} {
  const match = rawUrl.match(/[.,;:!?。、，．）)\]}】」』]+$/);
  if (!match || match.index == null || match.index === 0) {
    return { url: rawUrl, trailing: "" };
  }
  return {
    url: rawUrl.slice(0, match.index),
    trailing: rawUrl.slice(match.index),
  };
}
