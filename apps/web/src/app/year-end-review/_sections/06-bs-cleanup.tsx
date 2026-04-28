"use client";

import { useEffect, useMemo, useState } from "react";
import { useMfBS } from "@/hooks/use-mf-data";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatYen } from "@/lib/format";

const STORAGE_KEY = "sevenboard:bs-cleanup-tasks";

interface Task {
  id: string;
  category: "AR" | "INVENTORY" | "FIXED_ASSET" | "TEMP_ACCOUNT" | "MISC";
  label: string;
  amount: number;
  hint: string;
  done: boolean;
  memo: string;
}

const CATEGORY_LABEL: Record<Task["category"], string> = {
  AR: "滞留売掛金",
  INVENTORY: "棚卸資産",
  FIXED_ASSET: "固定資産除却候補",
  TEMP_ACCOUNT: "仮勘定",
  MISC: "その他",
};

const CATEGORY_TONE: Record<Task["category"], string> = {
  AR: "border-l-rose-500",
  INVENTORY: "border-l-amber-500",
  FIXED_ASSET: "border-l-blue-500",
  TEMP_ACCOUNT: "border-l-violet-500",
  MISC: "border-l-emerald-500",
};

export function BsCleanupSection() {
  const bs = useMfBS();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // BS から候補抽出
  const generatedTasks = useMemo<Task[]>(() => {
    if (!bs.data) return [];
    type Row = { name?: string; amount?: number; rows?: Row[] };
    const findAll = (rows: Row[] | undefined, keys: string[], collected: Row[] = []): Row[] => {
      if (!rows) return collected;
      for (const r of rows) {
        if (r.name && keys.some((k) => r.name?.includes(k))) collected.push(r);
        if (r.rows) findAll(r.rows, keys, collected);
      }
      return collected;
    };
    const data = bs.data as { rows?: Row[] };
    const result: Task[] = [];

    const ar = findAll(data.rows, ["売掛金"]);
    ar.forEach((r) => {
      if ((r.amount ?? 0) > 0) {
        result.push({
          id: `ar-${r.name}`,
          category: "AR",
          label: r.name ?? "",
          amount: r.amount ?? 0,
          hint: "90日以上の滞留がないか確認、回収不能なら貸倒処理を検討",
          done: false,
          memo: "",
        });
      }
    });

    const inv = findAll(data.rows, ["商品", "製品", "原材料", "仕掛品", "棚卸"]);
    inv.forEach((r) => {
      if ((r.amount ?? 0) > 0) {
        result.push({
          id: `inv-${r.name}`,
          category: "INVENTORY",
          label: r.name ?? "",
          amount: r.amount ?? 0,
          hint: "陳腐化・破損品の評価損計上を検討、写真・評価基準を残す",
          done: false,
          memo: "",
        });
      }
    });

    const fa = findAll(data.rows, ["車両運搬具", "工具器具備品", "機械装置", "建物附属"]);
    fa.forEach((r) => {
      if ((r.amount ?? 0) > 0 && (r.amount ?? 0) < 100_000) {
        result.push({
          id: `fa-${r.name}`,
          category: "FIXED_ASSET",
          label: r.name ?? "",
          amount: r.amount ?? 0,
          hint: "簿価がほぼ無く未使用なら除却損計上の対象",
          done: false,
          memo: "",
        });
      }
    });

    const tmp = findAll(data.rows, ["仮払金", "仮受金", "立替金"]);
    tmp.forEach((r) => {
      if ((r.amount ?? 0) > 0) {
        result.push({
          id: `tmp-${r.name}`,
          category: "TEMP_ACCOUNT",
          label: r.name ?? "",
          amount: r.amount ?? 0,
          hint: "決算前に内容を確認し、適切な勘定科目に振替",
          done: false,
          memo: "",
        });
      }
    });

    return result;
  }, [bs.data]);

  // localStorage 復元 + generatedTasks マージ
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved: Record<string, { done: boolean; memo: string }> = raw
        ? JSON.parse(raw)
        : {};
      const merged = generatedTasks.map((t) => ({
        ...t,
        done: saved[t.id]?.done ?? false,
        memo: saved[t.id]?.memo ?? "",
      }));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- generatedTasks（MF由来）変更時に編集状態をマージ
      setTasks(merged);
    } catch {
       
      setTasks(generatedTasks);
    }
     
    setHydrated(true);
  }, [generatedTasks]);

  // localStorage 保存
  useEffect(() => {
    if (!hydrated) return;
    try {
      const map: Record<string, { done: boolean; memo: string }> = {};
      tasks.forEach((t) => {
        map[t.id] = { done: t.done, memo: t.memo };
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
      // ignore
    }
  }, [tasks, hydrated]);

  const grouped = useMemo(() => {
    const g: Record<Task["category"], Task[]> = {
      AR: [],
      INVENTORY: [],
      FIXED_ASSET: [],
      TEMP_ACCOUNT: [],
      MISC: [],
    };
    tasks.forEach((t) => g[t.category].push(t));
    return g;
  }, [tasks]);

  const toggle = (id: string) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const setMemo = (id: string, memo: string) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, memo } : t)));

  const totalCount = tasks.length;
  const doneCount = tasks.filter((t) => t.done).length;

  if (bs.isLoading) return <div className="text-sm text-muted-foreground">読込中...</div>;
  if (!bs.data) return <div className="text-sm text-muted-foreground">BSデータが取得できませんでした。</div>;

  if (totalCount === 0) {
    return (
      <div className="rounded-md border bg-emerald-50/30 p-4 text-sm text-muted-foreground">
        BSから自動抽出した整理候補はありません。
        手動で検討すべき項目（残高一致しない未払金等）はメモで管理してください。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        進捗: <span className="font-bold text-foreground">{doneCount}/{totalCount}</span>
      </div>

      {(["AR", "INVENTORY", "FIXED_ASSET", "TEMP_ACCOUNT", "MISC"] as const).map((cat) => {
        const items = grouped[cat];
        if (items.length === 0) return null;
        return (
          <div key={cat} className={cn("rounded-md border-l-4 bg-white shadow-sm", CATEGORY_TONE[cat])}>
            <div className="border-b px-3 py-2 text-xs font-bold">
              {CATEGORY_LABEL[cat]}（{items.length}件）
            </div>
            <ul className="divide-y">
              {items.map((t) => (
                <li key={t.id} className="px-3 py-2">
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => toggle(t.id)}
                      className="mt-0.5"
                      aria-label={t.done ? "未完了に戻す" : "完了"}
                    >
                      {t.done ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                      )}
                    </button>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "text-xs font-medium",
                            t.done && "text-muted-foreground line-through",
                          )}
                        >
                          {t.label}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">{formatYen(t.amount)}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{t.hint}</p>
                      <input
                        type="text"
                        value={t.memo}
                        onChange={(e) => setMemo(t.id, e.target.value)}
                        placeholder="メモ（対応者・期限など）"
                        className="mt-1 w-full rounded border px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <p className="text-xs text-muted-foreground">
        ※ 滞留判定は当期BSの勘定科目名のみで判定（90日超かは未判定）。
        正式版では補助元帳・取引先別残高から自動抽出予定。
        DB保存（顧問先間共有）も次期実装。
      </p>
    </div>
  );
}
