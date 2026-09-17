// Cookies are shared across tabs. Finish logout before another tab can log in.
let pending: Promise<unknown> = Promise.resolve();

export function serializeAuthChange<T>(action: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return await navigator.locks.request('sevenboard-auth-session', action);
    }
    return action();
  };
  const result = pending.then(run, run);
  pending = result.catch(() => {});
  return result;
}
