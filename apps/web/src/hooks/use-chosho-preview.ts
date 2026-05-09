"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type ChoshoPreviewResult } from "@/lib/api";

interface UseChoshoPreviewArgs {
  orgId: string;
  fiscalYear: number | undefined;
  month: number | undefined;
  enabled?: boolean;
}

/**
 * 残高調書プレビューの read-only フェッチ。
 * orgId / fiscalYear / month が未確定 (空 or undefined) の間は disabled。
 */
export function useChoshoPreview({
  orgId,
  fiscalYear,
  month,
  enabled,
}: UseChoshoPreviewArgs) {
  return useQuery<ChoshoPreviewResult>({
    queryKey: ["chosho", "preview", orgId, fiscalYear, month],
    queryFn: () => api.chosho.preview(orgId, fiscalYear!, month!),
    enabled:
      !!orgId &&
      fiscalYear != null &&
      month != null &&
      (enabled ?? true),
    staleTime: 5 * 60 * 1000,
  });
}
