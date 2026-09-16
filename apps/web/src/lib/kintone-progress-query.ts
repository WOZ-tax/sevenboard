/** Authorization/input errors cannot recover by repeating the same request. */
export function retryKintoneProgress(
  failureCount: number,
  error: unknown,
): boolean {
  const status = (error as { statusCode?: number } | null)?.statusCode;
  if (
    status != null &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  )
    return false;
  return failureCount < 1;
}

export function kintoneProgressKey(orgId: string, fiscalYear?: number) {
  return ["kintone", "progress", orgId, fiscalYear ?? null] as const;
}
