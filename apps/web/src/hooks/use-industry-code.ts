"use client";

import { useEffect, useState, useCallback } from "react";
import { useCurrentOrg } from "@/contexts/current-org";
import type { IndustryCode } from "@/lib/industry-knowledge";
import { getIndustryOptions } from "@/lib/industry-knowledge";
import { useFeatureState, useFeatureStateMutation } from "@/hooks/use-year-end-state";
import { toast } from "sonner";

/**
 * 顧問先(org)ごとの業種コードを共有保存する。旧ブラウザ設定は初期値に利用。
 *
 * 戻り値: [code, setCode]
 *   - code: 設定済みなら IndustryCode、未設定なら "other"
 */
export function useIndustryCode(): [IndustryCode, (next: IndustryCode) => void] {
  const { currentOrgId, currentOrg } = useCurrentOrg();
  const orgId = currentOrgId ?? "";
  const saved = useFeatureState<{ code: IndustryCode }>("industry.knowledge");
  const mutation = useFeatureStateMutation<{ code: IndustryCode }>("industry.knowledge");
  const options = getIndustryOptions();
  const defaultCode = options.find(o => o.label === currentOrg?.industry)?.value ?? "other";
  const storageKey = orgId ? `sevenboard:industry:${orgId}` : null;
  const [legacy, setLegacy] = useState<{ key: string | null; code: IndustryCode }>({ key: null, code: "other" });
  const code = legacy.key === storageKey ? legacy.code : "other";

  useEffect(() => {
    if (!storageKey) return;
    if (typeof window === "undefined") return;
    try {
      const v = localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 復元
      setLegacy({ key: storageKey, code: options.some(o => o.value === v) ? v as IndustryCode : "other" });
    } catch {
      // ignore
    }
  }, [storageKey]);

  const setCode = useCallback(
    (next: IndustryCode) => {
      setLegacy({ key: storageKey, code: next });
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, next);
        } catch {
          // ignore
        }
      }
    },
    [storageKey],
  );

  const sharedCode = saved.data?.value?.code;
  const effectiveCode = options.some(o => o.value === sharedCode) ? sharedCode! : code !== 'other' ? code : defaultCode;
  return [effectiveCode, (next) => {
    if (!saved.isSuccess) { toast.error('保存済みの業種設定を読み込んでから再度お試しください。'); return; }
    mutation.mutate({ code: next }, { onSuccess: () => setCode(next), onError: () => toast.error('業種設定を保存できませんでした。') });
  }];
}
