import {test} from 'node:test';
import assert from 'node:assert/strict';
import {apiRequestHeaders} from './request-headers.ts';

test('feature-state lowercase header stays a single JSON media type', () => {
  const headers = apiRequestHeaders({'content-type':'application/json'}, 'test-csrf');
  const request = new Request('https://example.invalid/state', {method:'PUT',headers,body:JSON.stringify({value:{profit:'0'}})});
  assert.equal(request.headers.get('content-type'), 'application/json');
  assert.equal(request.headers.get('x-csrf-token'), 'test-csrf');
});

test('Headers and tuple inputs preserve custom fields and explicit media types', () => {
  assert.equal(apiRequestHeaders(new Headers({'x-test':'ok'})).get('x-test'),'ok');
  assert.equal(apiRequestHeaders([['content-type','text/plain']]).get('content-type'),'text/plain');
  assert.equal(apiRequestHeaders().get('content-type'),'application/json');
});
