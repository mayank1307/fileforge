import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// HOME/USERPROFILE must point at a temp folder before any store or bridgeAuth.js is imported.
const home = mkdtempSync(join(tmpdir(), 'fileforge-mode-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
const dataDir = join(home, '.fileforge');

// Windows has no POSIX mode bits, so there we only check that the folder exists.
function assertPrivate(dir) {
  assert.ok(existsSync(dir), `${dir} exists`);
  if (process.platform !== 'win32') assert.equal(statSync(dir).mode & 0o777, 0o700, `${dir} is 0700`);
}

test('stores create ~/.fileforge/ with mode 0700', async () => {
  await import('./stores/noteStore.js');
  assertPrivate(dataDir);
});

test('utils create their subfolders with mode 0700', async () => {
  await import('./utils/exportUtils.js');
  assertPrivate(join(dataDir, 'exports'));
});

test('bridgeToken tightens a ~/.fileforge/ left at 0755 by an older version', async () => {
  const { chmodSync } = await import('fs');
  mkdirSync(dataDir, { recursive: true });
  if (process.platform !== 'win32') chmodSync(dataDir, 0o755);
  const { bridgeToken } = await import('./bridgeAuth.js');
  assert.equal(bridgeToken().length, 64);
  assertPrivate(dataDir);
});
