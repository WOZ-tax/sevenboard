"use client";

import { Users } from "lucide-react";
import { useKintoneProgress } from "@/hooks/use-kintone-progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * 現在の顧問先のkintone登録担当者3役を小さなバッジで表示。
 * ヘッダーに常駐させ、顧問が「誰に聞くか」を一瞬で把握できるようにする。
 */
export function AssigneesBadge() {
  const { data } = useKintoneProgress();

  if (!data) return null;
  const inCharge = data.inCharge?.[0] ?? null;
  const reviewer = data.reviewer?.[0] ?? null;
  const preparer = data.preparer?.[0] ?? null;

  if (!inCharge && !reviewer && !preparer) return null;

  const Chip = ({ role, name }: { role: string; name: string }) => (
    <Tooltip>
      <TooltipTrigger>
        <span className="inline-flex h-6 items-center gap-1 rounded-md border border-[var(--color-border)] bg-background px-1.5 text-[11px] text-[var(--color-text-secondary)] hover:bg-muted">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {role}
          </span>
          <span className="font-medium text-[var(--color-text-primary)]">{name}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="font-sans text-xs">
        {role === "主" && "主担当 (InCharge)"}
        {role === "R" && "レビュワー (Reviewer)"}
        {role === "記" && "記帳 (Preparer)"}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <div className="hidden items-center gap-1 md:flex">
      <Users className="h-3.5 w-3.5 text-muted-foreground" />
      {inCharge && <Chip role="主" name={inCharge} />}
      {reviewer && <Chip role="R" name={reviewer} />}
      {preparer && <Chip role="記" name={preparer} />}
    </div>
  );
}
