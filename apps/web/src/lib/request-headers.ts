/** Normalize names before adding defaults so JSON media types never get joined. */
export function apiRequestHeaders(init?: HeadersInit, csrfToken?: string | null): Headers {
  const headers = new Headers(init);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (csrfToken) headers.set('x-csrf-token', csrfToken);
  return headers;
}
