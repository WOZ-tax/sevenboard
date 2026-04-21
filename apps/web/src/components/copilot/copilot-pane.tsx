"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Send, Eye, MessageSquare, Zap } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { ActionizeButton } from "@/components/ui/actionize-button";
import {
  EvidenceChips,
  AgentLabel,
} from "@/components/agent/evidence-chips";
import type { Confidence } from "@/lib/agent-voice";
import { useAuthStore } from "@/lib/auth";
import { usePeriodStore } from "@/lib/period-store";
import {
  AGENTS,
  resolveAgentByPath,
  type AgentKey,
} from "@/lib/agent-voice";
import {
  useCopilotStore,
  type CopilotMode,
  type CopilotToolCallView,
} from "@/lib/copilot-store";

const MODE_OPTIONS: { value: CopilotMode; label: string; icon: typeof Eye; hint: string }[] = [
  { value: "observe", label: "観察", icon: Eye, hint: "現状の要点を確認" },
  { value: "dialog", label: "対話", icon: MessageSquare, hint: "質問して深掘り" },
  { value: "execute", label: "実行", icon: Zap, hint: "Action案のドラフト" },
];

export function CopilotPane() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const orgId = user?.orgId || "";
  const { fiscalYear, month } = usePeriodStore();

  const open = useCopilotStore((s) => s.open);
  const setOpen = useCopilotStore((s) => s.setOpen);
  const mode = useCopilotStore((s) => s.mode);
  const setMode = useCopilotStore((s) => s.setMode);
  const agentKey = useCopilotStore((s) => s.agentKey);
  const setAgent = useCopilotStore((s) => s.setAgent);
  const messages = useCopilotStore((s) => s.messages);
  const appendMessage = useCopilotStore((s) => s.appendMessage);
  const pending = useCopilotStore((s) => s.pending);
  const setPending = useCopilotStore((s) => s.setPending);
  const seed = useCopilotStore((s) => s.seed);
  const consumeSeed = useCopilotStore((s) => s.consumeSeed);

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const match = resolveAgentByPath(pathname);
    setAgent(match?.key ?? "brief");
  }, [pathname, setAgent]);

  useEffect(() => {
    if (open && seed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Consume one-shot seed signal from external callers (CopilotOpenButton). The seed is a cross-component event, not owned state.
      setDraft(seed);
      consumeSeed();
    }
  }, [open, seed, consumeSeed]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, pending]);

  const activeAgent = agentKey ? AGENTS[agentKey] : AGENTS.brief;
  const ActiveIcon = activeAgent.icon;

  const chatMutation = useMutation({
    mutationFn: () =>
      api.copilot.chat(orgId, {
        agentKey: activeAgent.key,
        mode,
        pathname,
        fiscalYear,
        endMonth: month,
        messages: [
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user" as const, content: draft },
        ],
      }),
    onSuccess: (res) => {
      appendMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: res.reply,
        createdAt: new Date().toISOString(),
        agentKey: activeAgent.key,
        mode,
        toolCalls: res.toolCalls,
      });
      setPending(false);
    },
    onError: () => {
      appendMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: "[エラー] 応答を取得できませんでした。時間をおいて再試行してください。",
        createdAt: new Date().toISOString(),
        agentKey: activeAgent.key,
        mode,
      });
      setPending(false);
    },
  });

  const handleSend = () => {
    const text = draft.trim();
    if (!text || pending || !orgId) return;
    appendMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    });
    setDraft("");
    setPending(true);
    chatMutation.mutate();
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-[var(--color-border)] p-4">
          <div className="flex items-center gap-2">
            <ActiveIcon className="h-4 w-4 text-muted-foreground" />
            <SheetTitle className="text-sm">{activeAgent.roleName}</SheetTitle>
            <Badge
              variant="secondary"
              className="px-1.5 py-0 text-[10px] text-muted-foreground"
            >
              呼び出し型
            </Badge>
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            {activeAgent.summary}
          </SheetDescription>

          <div className="mt-2 flex gap-1">
            {MODE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = mode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors",
                    active
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)]"
                      : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/70",
                  )}
                  title={opt.hint}
                >
                  <Icon className="h-3 w-3" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </SheetHeader>

        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto p-4"
        >
          {messages.length === 0 ? (
            <EmptyHint mode={mode} />
          ) : (
            messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                fallbackAgentKey={activeAgent.key}
                pathname={pathname}
              />
            ))
          )}
          {pending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-info)]" />
              応答を生成中…
            </div>
          )}
        </div>

        <div className="border-t border-[var(--color-border)] p-3">
          <div className="flex gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={placeholderFor(mode, activeAgent.key)}
              rows={2}
              className="flex-1 resize-none rounded-md border border-[var(--color-border)] bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              disabled={pending}
            />
            <Button
              onClick={handleSend}
              disabled={!draft.trim() || pending || !orgId}
              size="icon"
              className="shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Cmd/Ctrl + Enter で送信。履歴は直近{" "}
            <span className="font-mono">6</span> 通のみ保持
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MessageBubble({
  message,
  fallbackAgentKey,
  pathname,
}: {
  message: {
    role: "user" | "assistant";
    content: string;
    createdAt: string;
    agentKey?: AgentKey;
    mode?: CopilotMode;
    toolCalls?: CopilotToolCallView[];
  };
  fallbackAgentKey: AgentKey;
  pathname: string;
}) {
  const isUser = message.role === "user";
  const attachedAgent = message.agentKey ?? fallbackAgentKey;
  const agent = AGENTS[attachedAgent];
  const AgentIcon = agent.icon;
  const extracted = !isUser ? extractEvidence(message.content) : null;
  const labelKind = !isUser ? labelForMode(message.mode) : null;

  return (
    <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      {!isUser && (
        <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <AgentIcon className="h-3 w-3" />
          <span className="font-medium text-[var(--color-text-primary)]">
            {agent.roleName}
          </span>
          {message.mode && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span>{modeLabel(message.mode)}</span>
            </>
          )}
          <span className="text-muted-foreground/40">·</span>
          <span>{formatRelative(message.createdAt)}</span>
          {labelKind && <AgentLabel kind={labelKind} className="ml-1" />}
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-md px-3 py-2 text-xs leading-relaxed",
          isUser
            ? "bg-[var(--color-primary)] text-white"
            : "border border-[var(--color-border)] bg-muted/40 text-[var(--color-text-primary)]",
        )}
      >
        {message.content}
      </div>
      {!isUser && extracted && (
        <EvidenceChips
          source={extracted.source}
          confidence={extracted.confidence}
          premise={extracted.premise}
          className="mt-0.5"
        />
      )}
      {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
        <ToolCallList calls={message.toolCalls} />
      )}
      {!isUser && isActionable(message.content) && (
        <div className="mt-1 max-w-[85%]">
          <ActionizeButton
            sourceScreen="MANUAL"
            sourceRef={{
              from: "copilot",
              agentKey: attachedAgent,
              mode: message.mode,
              pathname,
            }}
            defaultTitle={deriveActionTitle(message.content)}
            defaultDescription={message.content}
            defaultOwnerRole="ADVISOR"
            defaultSeverity="MEDIUM"
            size="sm"
          />
        </div>
      )}
    </div>
  );
}

function ToolCallList({ calls }: { calls: CopilotToolCallView[] }) {
  return (
    <ul className="mt-1 max-w-[85%] space-y-1">
      {calls.map((c, i) => (
        <li
          key={`${c.name}-${i}`}
          className={cn(
            "flex items-start gap-1.5 rounded-md border px-2 py-1 text-[11px]",
            c.ok
              ? "border-[var(--color-success)]/30 bg-[var(--color-success)]/5 text-[var(--color-text-primary)]"
              : "border-[var(--color-error)]/30 bg-[var(--color-error)]/5 text-[var(--color-error)]",
          )}
        >
          <span className="font-mono text-[10px] shrink-0">
            {c.ok ? "✓" : "✗"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{toolLabel(c)}</div>
            <div className="break-words text-muted-foreground">
              {c.summary}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function toolLabel(c: CopilotToolCallView): string {
  if (c.name === "propose_action") {
    const title =
      typeof c.input.title === "string" ? c.input.title : "(無題)";
    return `Action 登録: ${title}`;
  }
  if (c.name === "send_slack_digest") {
    const title = typeof c.input.title === "string" ? c.input.title : "(無題)";
    return `Slack 送信: ${title}`;
  }
  return `ツール実行: ${c.name}`;
}

function modeLabel(mode: CopilotMode): string {
  if (mode === "observe") return "観察";
  if (mode === "dialog") return "対話";
  return "実行";
}

function labelForMode(mode?: CopilotMode) {
  if (mode === "execute") return "ドラフト" as const;
  if (mode === "observe") return "推定" as const;
  return null;
}

/**
 * VOICE_GUIDELINES の「根拠/信頼度/前提」フォーマットを軽量regexで抽出。
 * ヒットしなければ null を返し、EvidenceChips は描画しない。
 */
function extractEvidence(text: string): {
  source: string | null;
  confidence: Confidence | null;
  premise: string | null;
} | null {
  const sourceMatch = text.match(/根拠\s*[:：]\s*([^\n]+)/);
  const confMatch = text.match(/信頼度\s*[:：]\s*([高中低])/);
  const premiseMatch = text.match(/前提\s*[:：]\s*([^\n]+)/);
  if (!sourceMatch && !confMatch && !premiseMatch) return null;
  const confMap: Record<string, Confidence> = {
    高: "HIGH",
    中: "MEDIUM",
    低: "LOW",
  };
  return {
    source: sourceMatch ? sourceMatch[1].trim().slice(0, 80) : null,
    confidence: confMatch ? confMap[confMatch[1]] : null,
    premise: premiseMatch ? premiseMatch[1].trim().slice(0, 80) : null,
  };
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const past = new Date(iso).getTime();
  const mins = Math.floor((now - past) / 60000);
  if (mins < 1) return "今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

/** [応答なし] や [エラー] の応答ではAction化を出さない */
function isActionable(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("[エラー]") || trimmed === "[応答なし]") return false;
  return true;
}

/** 最初の非空行・最大60字をタイトルに流用 */
function deriveActionTitle(text: string): string {
  const firstLine = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return "Copilotからの提案";
  const cleaned = firstLine.replace(/^[#\-*・■□◆●「」【】]+\s*/u, "").trim();
  if (cleaned.length <= 60) return cleaned;
  return cleaned.slice(0, 58) + "…";
}

function EmptyHint({ mode }: { mode: CopilotMode }) {
  const hint =
    mode === "observe"
      ? "例: 『今朝の注目点を3行で』『現在の資金リスクは？』"
      : mode === "dialog"
        ? "例: 『人件費急増の要因を詳しく』『A社依存の影響は？』"
        : "例: 『資金対策のAction案をドラフト』『顧問への報告文案を生成』";
  return (
    <div className="rounded-md border border-dashed border-[var(--color-border)] bg-muted/20 p-3 text-xs text-muted-foreground">
      <div className="mb-1 font-medium text-[var(--color-text-primary)]">
        質問を入力してください
      </div>
      <div>{hint}</div>
      <div className="mt-2 text-[10px]">
        出力は常にドラフトです。判断・承認は顧問の責務です。
      </div>
    </div>
  );
}

function placeholderFor(mode: CopilotMode, agent: AgentKey): string {
  const agentLabel = AGENTS[agent].roleName;
  if (mode === "observe") return `${agentLabel}に観察を依頼…`;
  if (mode === "dialog") return `${agentLabel}に質問…`;
  return `${agentLabel}にAction案の起案を依頼…`;
}
