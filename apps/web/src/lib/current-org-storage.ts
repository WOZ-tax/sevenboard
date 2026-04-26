/**
 * factory-hybrid と整合する localStorage helpers。
 * 「このブラウザで前回選択した Organization」を保持し、login/logout や membership
 * 失効時の reconcile に使う。
 */

const STORAGE_KEY = 'sevenboard:current-org-id';

export function readCurrentOrgStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeCurrentOrgStorage(orgId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, orgId);
  } catch {
    // private browsing 等で失敗するのは無視
  }
}

export function clearCurrentOrgStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
