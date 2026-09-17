import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchInSession, resetSessionRequests, sessionSignal } from './session-requests.ts';

test('switching accounts aborts old requests and gives the new account a fresh signal', () => {
  const oldSignal = sessionSignal();
  resetSessionRequests();
  assert.equal(oldSignal.aborted, true);
  assert.equal(sessionSignal().aborted, false);
});

test('late responses from an old login cannot reach response handlers', async (t) => {
  let finish;
  t.mock.method(globalThis, 'fetch', () => new Promise(resolve => { finish = resolve; }));
  const request = fetchInSession('https://example.invalid/companies');
  resetSessionRequests();
  finish(new Response(JSON.stringify([{ name: 'Previous company' }])));
  await assert.rejects(request, { name: 'AbortError' });
});

test('a request keeps its caller cancellation as well as the session cancellation', () => {
  const caller = new AbortController();
  const combined = sessionSignal(caller.signal);
  caller.abort();
  assert.equal(combined.aborted, true);
  assert.equal(sessionSignal().aborted, false);
});
