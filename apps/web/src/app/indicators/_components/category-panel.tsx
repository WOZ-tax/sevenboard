import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { Judgment } from "./derive-overview";
import { CategoryGauge } from "./category-gauge";

/**
 * カテゴリ（安全性 / 収益性 / 効率性）の 1 カラム。
 * 上に スピードメーターのゲージカード、直下にそのカテゴリの指標カードを縦積みする。
 * ヒーローのカテゴリチップからのスクロール先アンカー（id）を保持する。
 */
export function CategoryPanel({
  id,
  title,
  icon,
  iconClassName,
  score,
  judgment,
  note,
  children,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  iconClassName?: string;
  /** ゲージの針が指すスコア（categoryScore）。 */
  score: number;
  /** 中央 pill に出すカテゴリの最悪判定。 */
  judgment: Judgment;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-4 flex-col gap-4">
      <CategoryGauge
        title={title}
        icon={icon}
        iconClassName={iconClassName}
        score={score}
        judgment={judgment}
      />
      {note}
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
