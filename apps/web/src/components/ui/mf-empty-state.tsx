"use client";

import Link from "next/link";
import { Link2Off } from "lucide-react";

interface MfEmptyStateProps {
  title?: string;
  description?: string;
}

export function MfEmptyState({
  title = "MFクラウド会計が未接続です",
  description = "設定画面からMoneyForwardクラウド会計を接続すると、実績データが表示されます。",
}: MfEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] bg-muted/20 py-12 text-center">
      <Link2Off className="mb-3 h-10 w-10 text-muted-foreground/50" />
      <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
        {title}
      </h3>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        {description}
      </p>
      <Link
        href="/settings"
        className="mt-4 inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium text-[var(--color-text-primary)] hover:bg-muted"
      >
        設定画面へ
      </Link>
    </div>
  );
}
