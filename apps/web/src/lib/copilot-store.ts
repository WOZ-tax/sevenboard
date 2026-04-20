import { create } from "zustand";
import type { AgentKey } from "@/lib/agent-voice";

export type CopilotMode = "observe" | "dialog" | "execute";

export interface CopilotToolCallView {
  name: string;
  input: Record<string, unknown>;
  ok: boolean;
  summary: string;
}

export interface CopilotMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** assistant生成時点のエージェント (meta表示用) */
  agentKey?: AgentKey;
  /** assistant生成時点のモード (ラベル付与用) */
  mode?: CopilotMode;
  /** execute モードで LLM が実行したツール結果 */
  toolCalls?: CopilotToolCallView[];
}

interface OpenWithOptions {
  mode?: CopilotMode;
  agentKey?: AgentKey;
  /** 入力欄に初期注入する文字列 */
  seed?: string;
}

interface CopilotState {
  open: boolean;
  mode: CopilotMode;
  /** ルート由来で自動設定される担当エージェント */
  agentKey: AgentKey | null;
  messages: CopilotMessage[];
  pending: boolean;
  /** ペイン側がdraftに吸い取って即クリアする一時シード */
  seed: string | null;
  setOpen: (open: boolean) => void;
  setMode: (mode: CopilotMode) => void;
  setAgent: (agentKey: AgentKey | null) => void;
  appendMessage: (msg: CopilotMessage) => void;
  setPending: (pending: boolean) => void;
  reset: () => void;
  openWith: (options?: OpenWithOptions) => void;
  consumeSeed: () => string | null;
}

const MAX_HISTORY = 6;

export const useCopilotStore = create<CopilotState>((set, get) => ({
  open: false,
  mode: "observe",
  agentKey: null,
  messages: [],
  pending: false,
  seed: null,
  setOpen: (open) => set({ open }),
  setMode: (mode) => set({ mode }),
  setAgent: (agentKey) => set({ agentKey }),
  appendMessage: (msg) =>
    set((state) => {
      const next = [...state.messages, msg];
      return {
        messages: next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next,
      };
    }),
  setPending: (pending) => set({ pending }),
  reset: () => set({ messages: [], pending: false }),
  openWith: (options) =>
    set({
      open: true,
      mode: options?.mode ?? get().mode,
      agentKey: options?.agentKey ?? get().agentKey,
      seed: options?.seed ?? null,
    }),
  consumeSeed: () => {
    const { seed } = get();
    if (seed) set({ seed: null });
    return seed;
  },
}));
