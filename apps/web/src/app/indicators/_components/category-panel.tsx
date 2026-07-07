import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { JudgmentTone } from "./derive-overview";
import { TONE_LABEL, TONE_SOLID_BG, TONE_TEXT } from "./tone-styles";

/**
 * カテゴリ（安全性 / 収益性 / 効率性）を 1 枠にまとめるパネル。
 * ヘッダー行にアイコン + タイトル + カテゴリ状態ドット、内部は密度あるグリッド。
 */
export function CategoryPanel({
  id,
  title,
  icon: Icon,
  iconClassName,
  tone,
  note,
  children,
  className,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  iconClassName?: string;
  tone: JudgmentTone | null;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4",
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <Icon className={cn("h-5 w-5", iconClassName)} />
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
        {tone && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", TONE_SOLID_BG[tone])} />
            <span className={cn("text-xs font-medium", TONE_TEXT[tone])}>{TONE_LABEL[tone]}</span>
          </span>
        )}
      </div>
      {note}
      {children}
    </section>
  );
}
