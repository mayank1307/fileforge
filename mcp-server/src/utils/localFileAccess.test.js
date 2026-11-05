import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// The native call matches the code under test: on Windows it also expands short names such as RUNNER~1.
const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'fileforge-read-')));
const home = join(base, 'home');
const dataDir = join(home, '.fileforge');
const exportsDir = join(dataDir, 'exports');
const allowedDir = join(base, 'allowed');
const outsideDir = join(base, 'outside');
for (const dir of [exportsDir, allowedDir, join(base, 'allowed-evil'), outsideDir, join(home, '.ssh')]) mkdirSync(dir, { recursive: true });
process.env.HOME = home;
process.env.USERPROFILE = home;

const write = (path) => {
  writeFileSync(path, 'a,b\n1,2\n');
  return path;
};
const ownFile = write(join(exportsDir, 'out.csv'));
const allowedFile = write(join(allowedDir, 'data.csv'));
const outsideFile = write(join(outsideDir, 'data.csv'));
const siblingFile = write(join(base, 'allowed-evil', 'data.csv'));
const sshKey = write(join(home, '.ssh', 'id_rsa'));
const bridgeToken = write(join(dataDir, 'bridge-token'));
const secrets = write(join(dataDir, 'secrets.json'));

const { resolveReadablePath, ALLOWED_READ_PATHS_ENV } = await import('./localFileAccess.js');
const { registry } = await import('../registry.js');
await import('../tools/files.js');

const denied = { code: 'LOCAL_PATH_NOT_ALLOWED' };
function withAllowed(value, fn) {
  const previous = process.env[ALLOWED_READ_PATHS_ENV];
  if (value === undefined) delete process.env[ALLOWED_READ_PATHS_ENV];
  else process.env[ALLOWED_READ_PATHS_ENV] = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env[ALLOWED_READ_PATHS_ENV];
    else process.env[ALLOWED_READ_PATHS_ENV] = previous;
  }
}

test('by default only FileForge output folders are readable', () => {
  withAllowed(undefined, () => {
    assert.equal(resolveReadablePath(ownFile), ownFile);
    for (const path of [allowedFile, outsideFile, sshKey, bridgeToken, secrets]) {
      assert.throws(() => resolveReadablePath(path), denied, path);
    }
  });
});

test('listed folders are readable, and only those', () => {
  withAllowed(`${allowedDir}${delimiter}${join(base, 'nope')}`, () => {
    assert.equal(resolveReadablePath(allowedFile), allowedFile);
    assert.equal(resolveReadablePath(pathToFileURL(allowedFile).href), allowedFile);
    assert.throws(() => resolveReadablePath(outsideFile), denied);
  });
});

test('a folder whose name starts with an allowed name is not allowed', () => {
  withAllowed(allowedDir, () => assert.throws(() => resolveReadablePath(siblingFile), denied));
});

test('.. and file URLs cannot leave an allowed folder', () => {
  withAllowed(allowedDir, () => {
    assert.throws(() => resolveReadablePath(join(allowedDir, '..', 'outside', 'data.csv')), denied);
    assert.throws(() => resolveReadablePath(`${allowedDir}/../outside/data.csv`), denied);
    assert.throws(() => resolveReadablePath(pathToFileURL(outsideFile).href), denied);
  });
});

test('a symlink cannot point out of an allowed folder', (t) => {
  const link = join(allowedDir, 'link.csv');
  try {
    symlinkSync(outsideFile, link);
  } catch {
    t.skip('symlinks need extra permissions here');
    return;
  }
  withAllowed(allowedDir, () => assert.throws(() => resolveReadablePath(link), denied));
});

test('allowing a parent folder does not expose the token or secrets', () => {
  withAllowed(home, () => {
    assert.equal(resolveReadablePath(sshKey), sshKey);
    assert.throws(() => resolveReadablePath(bridgeToken), denied);
    assert.throws(() => resolveReadablePath(secrets), denied);
    assert.equal(resolveReadablePath(ownFile), ownFile);
  });
});

test('a relative entry in the setting is ignored', () => {
  withAllowed('.', () => assert.throws(() => resolveReadablePath(join(process.cwd(), 'package.json')), denied));
});

test('a missing path outside gets the same error as an existing one, so the disk cannot be probed', () => {
  withAllowed(undefined, () => {
    assert.throws(() => resolveReadablePath(join(outsideDir, 'missing.csv')), denied);
    assert.throws(() => resolveReadablePath(join(exportsDir, 'missing.csv')), { code: 'ENOENT' });
  });
});

test('folders and other non-files are refused', () => {
  withAllowed(allowedDir, () => assert.throws(() => resolveReadablePath(allowedDir), denied));
});

test('every local read action refuses a disallowed path', async () => {
  for (const action of ['extract_text', 'fetch_resource', 'parse_resource', 'convert']) {
    const result = await registry.call('fileforge_file_action', { action, url: sshKey, to: 'json' }, {});
    assert.equal(result.ok, false, action);
    assert.equal(result.error.code, 'LOCAL_PATH_NOT_ALLOWED', action);
  }
});

test('an allowed local read still works through the tool', async () => {
  const result = await registry.call('fileforge_file_action', { action: 'extract_text', url: ownFile }, {});
  assert.equal(result.ok, true);
  assert.match(result.data.text, /a,b/);
});
