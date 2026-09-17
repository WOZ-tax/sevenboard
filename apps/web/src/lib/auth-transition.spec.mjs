import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeAuthChange } from './auth-transition.ts';

test('login cannot overtake a slow logout cookie response', async () => {
  const order = [];
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const logout = serializeAuthChange(async () => { order.push('logout-start'); await blocked; order.push('logout-end'); });
  const login = serializeAuthChange(async () => { order.push('login'); });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(order, ['logout-start']);
  release();
  await Promise.all([logout, login]);
  assert.deepEqual(order, ['logout-start', 'logout-end', 'login']);
});

test('a failed logout does not prevent a subsequent login', async () => {
  await assert.rejects(serializeAuthChange(async () => { throw new Error('offline'); }));
  assert.equal(await serializeAuthChange(async () => 'logged-in'), 'logged-in');
});
