"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  manualKeysFor,
  mergeSourceData,
  sanitizeOverrides,
  sourceScope,
  type SourceOverrides,
} from "@/lib/locaben/comparison";

const FEATURE = "locaben.source-overrides";
const stateKey = (orgId: string, scope: string) => [
  "yes",
  "feature",
  orgId,
  FEATURE,
  scope,
];
type Save = {
  orgId: string;
  scope: string;
  value: SourceOverrides;
  version: number;
};
type SaveStatus = "pending" | "saved" | "error";

/** Each period has independent MF data and explicit inputs, scoped by company and cutoff. */
export function useLocabenComparison(
  orgId: string,
  fiscalYear: number | undefined,
  month: number | undefined,
  availableYears: number[],
) {
  const qc = useQueryClient();
  const years = [0, 1, 2].map((offset) =>
    fiscalYear == null ? undefined : fiscalYear - offset,
  );
  const enabled = (year: number | undefined) =>
    !!orgId && year != null && availableYears.includes(year);
  const sources = useQueries({
    queries: years.map((year, index) => ({
      queryKey: [
        "locaben",
        "source-data",
        orgId,
        year ?? `unselected-${index}`,
        month,
      ],
      queryFn: () => api.locaben.getSourceData(orgId, year!, month),
      enabled: enabled(year),
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });
  const saved = useQueries({
    queries: years.map((year, index) => ({
      queryKey: stateKey(
        orgId,
        year == null ? `unselected-${index}` : sourceScope(year, month),
      ),
      queryFn: () =>
        api.yearEndState.getFeature<SourceOverrides>(
          orgId,
          FEATURE,
          sourceScope(year!, month),
        ),
      enabled: enabled(year),
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });
  const [drafts, setDrafts] = useState<Record<string, SourceOverrides>>({});
  const [statuses, setStatuses] = useState<Record<string, SaveStatus>>({});
  const draftsRef = useRef(drafts);
  const versions = useRef<Record<string, number>>({});
  const pending = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; body: Save }>(),
  );
  const keyFor = (body: Pick<Save, "orgId" | "scope">) =>
    `${body.orgId}|${body.scope}`;
  const mutation = useMutation({
    // Serialize writes so a slower earlier input cannot replace a later input.
    scope: { id: "locaben-source-overrides" },
    mutationFn: (body: Save) =>
      api.yearEndState.upsertFeature(
        body.orgId,
        FEATURE,
        body.scope,
        body.value,
      ),
    onSuccess: (_result, body) => {
      qc.setQueryData(stateKey(body.orgId, body.scope), {
        value: body.value,
        updatedAt: new Date().toISOString(),
      });
      const key = keyFor(body);
      if (versions.current[key] === body.version)
        setStatuses((prev) => ({ ...prev, [key]: "saved" }));
    },
    onError: (_error, body) => {
      const key = keyFor(body);
      if (versions.current[key] === body.version)
        setStatuses((prev) => ({ ...prev, [key]: "error" }));
    },
  });
  const mutateRef = useRef(mutation.mutate);
  useEffect(() => {
    mutateRef.current = mutation.mutate;
  }, [mutation.mutate]);
  useEffect(() => {
    const queue = pending.current;
    return () => {
      // Preserve the last edit when navigating; each write carries its original company/period.
      for (const { timer, body } of queue.values()) {
        clearTimeout(timer);
        mutateRef.current(body);
      }
      queue.clear();
    };
  }, []);

  const update = (index: number, value: SourceOverrides) => {
    const year = years[index];
    if (!enabled(year) || !saved[index].isSuccess) return;
    const scope = sourceScope(year!, month);
    const key = keyFor({ orgId, scope });
    draftsRef.current = { ...draftsRef.current, [key]: value };
    setDrafts(draftsRef.current);
    setStatuses((prev) => ({ ...prev, [key]: "pending" }));
    const version = (versions.current[key] ?? 0) + 1;
    versions.current[key] = version;
    const body: Save = { orgId, scope, value, version };
    const earlier = pending.current.get(key);
    if (earlier) clearTimeout(earlier.timer);
    const timer = setTimeout(() => {
      pending.current.delete(key);
      mutateRef.current(body);
    }, 600);
    pending.current.set(key, { timer, body });
  };

  return {
    periods: years.map((year, index) => {
      const key = keyFor({ orgId, scope: sourceScope(year ?? 0, month) });
      const overrides =
        drafts[key] ?? sanitizeOverrides(saved[index].data?.value);
      return {
        fiscalYear: year,
        label: year == null ? "期間未設定" : `${year}年度`,
        available: enabled(year),
        values: mergeSourceData(sources[index].data, overrides),
        overrides,
        manualKeys: manualKeysFor(overrides),
        mfData: sources[index].data,
        isLoading:
          enabled(year) && (sources[index].isLoading || saved[index].isLoading),
        isFetching: sources[index].isFetching || saved[index].isFetching,
        isError: sources[index].isError || saved[index].isError,
        isMfError: sources[index].isError,
        isSavedInputsError: saved[index].isError,
        canEdit: enabled(year) && saved[index].isSuccess,
        hasSavedInputs: saved[index].data != null || drafts[key] != null,
        saveStatus: statuses[key],
        // No stale successful polygon after a failed refresh.
        canCompare:
          enabled(year) && sources[index].isSuccess && saved[index].isSuccess,
      };
    }),
    update,
    refetchSaved: (index: number) => saved[index].refetch(),
    refetch: () =>
      Promise.allSettled(
        [...sources, ...saved]
          .filter((query) => query.isEnabled)
          .map((query) => query.refetch()),
      ),
  };
}
