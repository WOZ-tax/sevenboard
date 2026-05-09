"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type ChoshoCellComment,
  type ChoshoExpectedRuleValue,
  type ChoshoRowComment,
  type ChoshoVersionDetail,
} from "@/lib/api";

/**
 * 残高調書 saved version のコメント (行 + セル) を一括管理するフック。
 * Phase 1 Unit 2B-3。
 *
 * - 行コメント (1:N): version 単位で取得 → 各行で rowId フィルタ
 * - セルコメント (1:1): version 単位で取得 → 各セルで (rowId, month) lookup
 *
 * mutation の onSuccess で invalidate するクエリキーは UI と同じ shape を維持。
 */
export function useChoshoComments(args: {
  orgId: string;
  versionId: string | null;
}) {
  const { orgId, versionId } = args;
  const qc = useQueryClient();

  const enabled = !!orgId && !!versionId;
  const rowKey = ["chosho", "row-comments", orgId, versionId];
  const cellKey = ["chosho", "cell-comments", orgId, versionId];

  const rowComments = useQuery<ChoshoRowComment[]>({
    queryKey: rowKey,
    queryFn: () => api.chosho.listRowComments(orgId, versionId!),
    enabled,
    staleTime: 30_000,
  });

  const cellComments = useQuery<ChoshoCellComment[]>({
    queryKey: cellKey,
    queryFn: () => api.chosho.listCellComments(orgId, versionId!),
    enabled,
    staleTime: 30_000,
  });

  const addRowComment = useMutation({
    mutationFn: (input: { rowId: string; body: string; urls: string[] }) =>
      api.chosho.addRowComment(orgId, versionId!, input.rowId, {
        body: input.body,
        urls: input.urls,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: rowKey }),
  });

  const deleteRowComment = useMutation({
    mutationFn: (commentId: string) =>
      api.chosho.deleteRowComment(orgId, versionId!, commentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: rowKey }),
  });

  const upsertCellComment = useMutation({
    mutationFn: (input: {
      rowId: string;
      month: number;
      body: string;
      urls: string[];
      anomalyType: "EXPECTED_VALUE_VIOLATION" | "AGING_3M";
    }) =>
      api.chosho.upsertCellComment(orgId, versionId!, input.rowId, input.month, {
        body: input.body,
        urls: input.urls,
        anomalyType: input.anomalyType,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: cellKey }),
  });

  const deleteCellComment = useMutation({
    mutationFn: (input: { rowId: string; month: number }) =>
      api.chosho.deleteCellComment(orgId, versionId!, input.rowId, input.month),
    onSuccess: () => qc.invalidateQueries({ queryKey: cellKey }),
  });

  // 行ルール更新 (期待残高 / 滞留チェック)。成功で version cache を返り値で上書き。
  const versionKey = ["chosho", "version", orgId, versionId];
  const updateRowRule = useMutation({
    mutationFn: (input: {
      rowId: string;
      expectedRule: ChoshoExpectedRuleValue;
      expectedValue: number | null;
      agingCheckEnabled: boolean;
    }) =>
      api.chosho.updateRowRule(orgId, versionId!, input.rowId, {
        expectedRule: input.expectedRule,
        expectedValue: input.expectedValue,
        agingCheckEnabled: input.agingCheckEnabled,
      }),
    onSuccess: (saved: ChoshoVersionDetail) => {
      qc.setQueryData(versionKey, saved);
    },
  });

  return {
    rowComments,
    cellComments,
    addRowComment,
    deleteRowComment,
    upsertCellComment,
    deleteCellComment,
    updateRowRule,
  };
}
