"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMfBS } from "@/hooks/use-mf-data";
import { useIndustryCode } from "@/hooks/use-industry-code";
import { getIndustryKnowledge } from "@/lib/industry-knowledge";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatYen } from "@/lib/format";
import { usePeriodStore } from "@/lib/period-store";
import {
  useBsCleanupCreate,
  useBsCleanupTasks,
  useBsCleanupUpdate,
} from "@/hooks/use-year-end-state";

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

interface DbTask {
  id: string;
  templateKey?: string | null;
  category: string;
  label: string;
  amount: string | number;
  hint: string;
  done: boolean;
  memo: string;
}

export function BsCleanupSection() {
  const bs = useMfBS();
  const [industryCode] = useIndustryCode();
  const industry = useMemo(() => getIndustryKnowledge(industryCode), [industryCode]);
  const fiscalYear = usePeriodStore((s) => s.fiscalYear);
  const dbQuery = useBsCleanupTasks(fiscalYear);
  const createMutation = useBsCleanupCreate();
  const updateMutation = useBsCleanupUpdate();
  const pendingCreatesRef = useRef<Set<string>>(new Set());

  // 旧 LocalStorage クリーンアップ
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem("sevenboard:bs-cleanup-tasks");
    } catch {
      // ignore
    }
  }, []);

  // BS から候補抽出 (FinancialStatementRow[] = {category, current, prior, ...} を扱う)
  const generatedTasks = useMemo<Task[]>(() => {
    if (!bs.data) return [];
    const all = [...bs.data.assets, ...bs.data.liabilitiesEquity];
    const findAll = (keys: string[]) =>
      all.filter((r) => keys.some((k) => r.category.includes(k)));
    const result: Task[] = [];
    const hints = industry.bsCleanupHints;

    findAll(["売掛金"]).forEach((r) => {
      if ((r.current ?? 0) > 0) {
        const generic = "90日以上の滞留がないか確認、回収不能なら貸倒処理を検討";
        result.push({
          id: `ar-${r.category}`,
          category: "AR",
          label: r.category,
          amount: r.current ?? 0,
          hint: hints.ar ? `${generic}\n[${industry.label}] ${hints.ar}` : generic,
          done: false,
          memo: "",
        });
      }
    });

    findAll(["商品", "製品", "原材料", "仕掛品", "棚卸"]).forEach((r) => {
      if ((r.current ?? 0) > 0) {
        const generic = "陳腐化・破損品の評価損計上を検討、写真・評価基準を残す";
        result.push({
          id: `inv-${r.category}`,
          category: "INVENTORY",
          label: r.category,
          amount: r.current ?? 0,
          hint: hints.inventory ? `${generic}\n[${industry.label}] ${hints.inventory}` : generic,
          done: false,
          memo: "",
        });
      }
    });

    findAll(["車両運搬具", "工具器具備品", "機械装置", "建物附属"]).forEach((r) => {
      if ((r.current ?? 0) > 0 && (r.current ?? 0) < 100_000) {
        const generic = "簿価がほぼ無く未使用なら除却損計上の対象";
        result.push({
          id: `fa-${r.category}`,
          category: "FIXED_ASSET",
          label: r.category,
          amount: r.current ?? 0,
          hint: hints.fixedAsset ? `${generic}\n[${industry.label}] ${hints.fixedAsset}` : generic,
          done: false,
          memo: "",
        });
      }
    });

    findAll(["仮払金", "仮受金", "立替金"]).forEach((r) => {
      if ((r.current ?? 0) > 0) {
        const generic = "決算前に内容を確認し、適切な勘定科目に振替";
        result.push({
          id: `tmp-${r.category}`,
          category: "TEMP_ACCOUNT",
          label: r.category,
          amount: r.current ?? 0,
          hint: hints.tempAccount ? `${generic}\n[${industry.label}] ${hints.tempAccount}` : generic,
          done: false,
          memo: "",
        });
      }
    });

    return result;
  }, [bs.data, industry]);

  // DB の Task 一覧と generated Task を merge
  // templateKey で identifying (= generated tasks の id)。
  const tasks = useMemo<(Task & { dbId?: string })[]>(() => {
    const dbTasks = (dbQuery.data ?? []) as DbTask[];
    const byTpl = new Map<string, DbTask>();
    for (const d of dbTasks) {
      if (d.templateKey) byTpl.set(d.templateKey, d);
    }
    return generatedTasks.map((t) => {
      const db = byTpl.get(t.id);
      return {
        ...t,
        done: db ? db.done : false,
        memo: db ? db.memo : "",
        dbId: db?.id,
      };
    });
  }, [generatedTasks, dbQuery.data]);

  const grouped = useMemo(() => {
    const g: Record<Task["category"], (Task & { dbId?: string })[]> = {
      AR: [],
      INVENTORY: [],
      FIXED_ASSET: [],
      TEMP_ACCOUNT: [],
      MISC: [],
    };
    tasks.forEach((t) => g[t.category].push(t));
    return g;
  }, [tasks]);

  const upsertTaskState = (
    t: Task & { dbId?: string },
    patch: { done?: boolean; memo?: string },
  ) => {
    if (!fiscalYear) return;
    if (t.dbId) {
      updateMutation.mutate({
        id: t.dbId,
        fiscalYear,
        patch,
      });
    } else {
      // 重複 create 防止
      if (pendingCreatesRef.current.has(t.id)) return;
      pendingCreatesRef.current.add(t.id);
      createMutation.mutate(
        {
          fiscalYear,
          templateKey: t.id,
          category: t.category,
          label: t.label,
          amount: t.amount,
          hint: t.hint,
          done: patch.done ?? false,
          memo: patch.memo ?? "",
        },
        {
          onSettled: () => pendingCreatesRef.current.delete(t.id),
        },
      );
    }
  };

  const toggle = (t: Task & { dbId?: string }) =>
    upsertTaskState(t, { done: !t.done });
  const setMemo = (t: Task & { dbId?: string }, memo: string) =>
    upsertTaskState(t, { memo });

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
                      onClick={() => toggle(t)}
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
                      <p className="mt-0.5 whitespace-pre-line text-[11px] text-muted-foreground">{t.hint}</p>
                      <input
                        type="text"
                        defaultValue={t.memo}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v !== t.memo) setMemo(t, v);
                        }}
                        placeholder="メモ（対応者・期限など、入力後 blur で保存）"
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
