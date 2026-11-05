import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// workflow.js imports a store, so HOME has to point somewhere temporary before it loads.
const home = mkdtempSync(join(tmpdir(), 'fileforge-workflow-'));
const savedEnv = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
let runAssertion;

before(async () => {
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  ({ runAssertion } = await import('./workflow.js'));
});

after(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(home, { recursive: true, force: true });
});

const rpcWithActiveUrl = (url) => ({ send: async () => ({ ok: true, data: { id: 1, url } }) });

test('url_contains redacts actual on a sensitive tab but still matches the real URL', async () => {
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc&state=secret-state';
  const result = await runAssertion(rpcWithActiveUrl(url), { type: 'url_contains', value: 'accounts.google.com' }, {});
  assert.equal(result.ok, true);
  assert.equal(result.actual, 'redacted');
});

test('url_contains reports actual on a non-sensitive tab', async () => {
  const url = 'https://example.com/docs';
  const result = await runAssertion(rpcWithActiveUrl(url), { type: 'url_contains', value: '/missing' }, {});
  assert.equal(result.ok, false);
  assert.equal(result.actual, url);
});
