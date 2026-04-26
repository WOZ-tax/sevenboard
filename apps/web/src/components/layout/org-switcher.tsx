"use client";

import { useState, useRef, useEffect } from "react";
import { Building2, Check, ChevronDown } from "lucide-react";
import { useCurrentOrg, type Membership } from "@/contexts/current-org";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<Membership["role"], string> = {
  owner: "オーナー",
  admin: "管理者",
  member: "メンバー",
  viewer: "閲覧",
  advisor: "顧問",
};

const ROLE_BADGE: Record<Membership["role"], string> = {
  owner: "bg-purple-100 text-purple-700 border-purple-300",
  admin: "bg-blue-100 text-blue-700 border-blue-300",
  member: "bg-emerald-100 text-emerald-700 border-emerald-300",
  viewer: "bg-gray-100 text-gray-700 border-gray-300",
  advisor: "bg-amber-100 text-amber-800 border-amber-300",
};

export function OrgSwitcher() {
  const { memberships, currentOrg, currentOrgId, setCurrentOrgId, isLoading, hasMemberships } =
    useCurrentOrg();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  if (isLoading) {
    return (
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
    );
  }

  if (!hasMemberships) {
    return null;
  }

  // 1 件しかない場合でも顧問先切替の入口として常にドロップダウンを出す
  // （内部 owner は将来増える顧問先を見据えて常時切替 UI を期待する）

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-primary)]/5 px-2.5 py-1 text-xs hover:bg-[var(--color-primary)]/10",
          open && "ring-2 ring-[var(--color-primary)]/30",
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="組織を切替"
      >
        <Building2 className="h-3.5 w-3.5 text-[var(--color-primary)]" />
        <span className="font-medium text-[var(--color-text-primary)]">
          {currentOrg?.orgName ?? "—"}
        </span>
        {currentOrg?.orgCode && (
          <span className="text-[10px] text-muted-foreground">({currentOrg.orgCode})</span>
        )}
        {currentOrg && (
          <span
            className={cn(
              "rounded-full border px-1.5 py-0 text-[10px]",
              ROLE_BADGE[currentOrg.role],
            )}
          >
            {ROLE_LABEL[currentOrg.role]}
          </span>
        )}
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 min-w-[280px] max-w-[420px] overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
        >
          <div className="border-b border-[var(--color-border)] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            組織を切替（{memberships.length}件）
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {memberships.map((m) => {
              const active = m.orgId === currentOrgId;
              return (
                <li key={m.orgId}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setCurrentOrgId(m.orgId);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-muted/40",
                      active && "bg-[var(--color-primary)]/5",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-[var(--color-text-primary)]">
                          {m.orgName}
                        </span>
                        {m.orgCode && (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            ({m.orgCode})
                          </span>
                        )}
                      </div>
                      {m.industry && (
                        <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          {m.industry}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded-full border px-1.5 py-0 text-[9px]",
                          ROLE_BADGE[m.role],
                        )}
                      >
                        {ROLE_LABEL[m.role]}
                      </span>
                      {active && <Check className="h-3.5 w-3.5 text-[var(--color-primary)]" />}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
