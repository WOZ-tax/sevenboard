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
      anomalyType: "EXPECTED_VALUE_VIOLATION" | "AGING_3M" | null;
    }) =>
      api.chosho.upsertCellComment(
        orgId,
        versionId!,
        input.rowId,
        input.month,
        {
          body: input.body,
          urls: input.urls,
          anomalyType: input.anomalyType,
        },
      ),
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

/**
 * preview/saved 共通の cell コメント (rowKey ベース)。
 * preview モード (versionId なし) でも `(org, fy, month, rowKey)` で書き読みできる。
 *
 * - list: 期間内 (org, fy, month) 全 rowKey のコメントを 1 リクエストで取得
 * - upsert: 既存あれば削除して追加 (1:1 互換)、 新規なら直接追加
 * - delete: commentId 指定で削除 (本人のみ、 返信もカスケード)
 */
export function useChoshoPreviewCellComments(args: {
  orgId: string;
  fiscalYear: number | undefined;
  month: number | undefined;
  enabled?: boolean;
}) {
  const { orgId, fiscalYear, month } = args;
  const qc = useQueryClient();

  const enabled =
    !!orgId && fiscalYear != null && month != null && (args.enabled ?? true);
  const cellKey = ["chosho", "preview-cell-comments", orgId, fiscalYear, month];

  const cellComments = useQuery<ChoshoCellComment[]>({
    queryKey: cellKey,
    queryFn: () =>
      api.chosho.listPreviewCellComments(orgId, fiscalYear!, month!),
    enabled,
    staleTime: 30_000,
  });

  const addCellComment = useMutation({
    mutationFn: (input: {
      rowKey: string;
      body: string;
      urls: string[];
      anomalyType: "EXPECTED_VALUE_VIOLATION" | "AGING_3M" | null;
      parentCommentId?: string;
    }) =>
      api.chosho.addPreviewCellComment(orgId, {
        fiscalYear: fiscalYear!,
        month: month!,
        rowKey: input.rowKey,
        body: input.body,
        urls: input.urls,
        anomalyType: input.anomalyType,
        parentCommentId: input.parentCommentId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: cellKey }),
  });

  const deleteCellCommentById = useMutation({
    mutationFn: (commentId: string) =>
      api.chosho.deleteCellCommentById(orgId, commentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: cellKey }),
  });

  return {
    cellComments,
    addCellComment,
    deleteCellCommentById,
  };
}
