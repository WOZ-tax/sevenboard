"use client";

import { useEffect, useState, useCallback } from "react";
import { useCurrentOrg } from "@/contexts/current-org";
import type { IndustryCode } from "@/lib/industry-knowledge";

/**
 * 顧問先(org)ごとの業種コードを localStorage で管理。
 * 後で org テーブルに industry_code 列を追加してDB移行する想定。
 *
 * 戻り値: [code, setCode]
 *   - code: 設定済みなら IndustryCode、未設定なら "other"
 */
export function useIndustryCode(): [IndustryCode, (next: IndustryCode) => void] {
  const orgId = useCurrentOrg().currentOrgId ?? "";
  const storageKey = orgId ? `sevenboard:industry:${orgId}` : null;
  const [code, setCodeState] = useState<IndustryCode>("other");

  useEffect(() => {
    if (!storageKey) return;
    if (typeof window === "undefined") return;
    try {
      const v = localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 復元
      if (v) setCodeState(v as IndustryCode);
       
      else setCodeState("other");
    } catch {
      // ignore
    }
  }, [storageKey]);

  const setCode = useCallback(
    (next: IndustryCode) => {
      setCodeState(next);
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

  return [code, setCode];
}
