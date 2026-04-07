"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

interface QueryErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function QueryErrorState({
  message = "データの取得に失敗しました",
  onRetry,
}: QueryErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-red-200 bg-red-50/50 py-10 text-center">
      <AlertCircle className="mb-3 h-8 w-8 text-red-400" />
      <p className="text-sm font-medium text-[var(--color-text-primary)]">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-[var(--color-text-primary)] hover:bg-muted"
        >
          <RefreshCw className="h-3 w-3" />
          再試行
        </button>
      )}
    </div>
  );
}
