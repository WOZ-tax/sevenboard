// Requests from a previous login must not update the next user's screen or auth state.
let controller = new AbortController();

export function resetSessionRequests(): void {
  controller.abort();
  controller = new AbortController();
}

export function sessionSignal(signal?: AbortSignal | null): AbortSignal {
  return signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
}

export async function fetchInSession(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const signal = sessionSignal(init?.signal);
  const response = await fetch(input, { ...init, signal });
  signal.throwIfAborted();
  return response;
}
