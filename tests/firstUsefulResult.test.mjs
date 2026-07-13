import assert from 'node:assert/strict';
import test from 'node:test';

import { firstUsefulResult } from '../server/first-useful-result.mjs';

test('returns the first non-empty provider result without waiting for slower providers', async () => {
  let slowFinished = false;
  const slow = new Promise((resolve) => setTimeout(() => {
    slowFinished = true;
    resolve([{ title: 'slow' }]);
  }, 80));
  const fast = new Promise((resolve) => setTimeout(() => resolve([{ title: 'fast' }]), 5));

  const result = await firstUsefulResult([slow, fast]);
  assert.equal(result[0].title, 'fast');
  assert.equal(slowFinished, false);
});

test('returns an empty list when every successful provider is empty', async () => {
  const result = await firstUsefulResult([Promise.resolve([]), Promise.resolve([])]);
  assert.deepEqual(result, []);
});
