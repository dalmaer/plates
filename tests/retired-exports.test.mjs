import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';

test('the unused Loop status module is absent from package sources', async () => {
  await assert.rejects(access(new URL('../lib/loop-run-status.mjs', import.meta.url)), { code: 'ENOENT' });
});

for (const [path, retired, retained] of [
  ['lib/adopt.mjs', ['detectRunner'], 'detectRunners'],
  ['lib/work-items.mjs', ['NEEDS_WHY', 'ACTION_VERBS'], 'kindOf'],
  ['lib/web/media-client.mjs', ['comparableCaptureInputs'], 'startMediaClient'],
  ['practices/phases/files/scripts/roadmap.mjs', ['UNBOUNDED_MEASURE'], 'citedTests'],
  ['scripts/roadmap.mjs', ['UNBOUNDED_MEASURE'], 'citedTests'],
]) {
  test(`${path} keeps the active API without retired exports`, async () => {
    const api = await import(new URL(`../${path}`, import.meta.url));
    assert.equal(typeof api[retained], 'function', `${retained} remains usable`);
    for (const name of retired) assert.equal(Object.hasOwn(api, name), false, `${name} has no callers`);
  });
}
