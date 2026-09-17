import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readApiJson } from './api-response.ts';

test('missing nullable records and no-content responses resolve as null', async () => {
  for (const response of [new Response(''), new Response('  '), new Response(null, { status: 204 })]) {
    assert.equal(await readApiJson(response), null);
  }
});

test('JSON values preserve zero, false, arrays and explicit null', async () => {
  for (const value of [0, false, [], null, { value: { profit: '0' } }]) {
    assert.deepEqual(await readApiJson(new Response(JSON.stringify(value))), value);
  }
});

test('nonempty malformed responses still fail instead of looking like missing data', async () => {
  await assert.rejects(readApiJson(new Response('<html>gateway failure</html>')), SyntaxError);
});
