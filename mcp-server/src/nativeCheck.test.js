import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNativeModules, nativeModuleHelp } from './nativeCheck.js';

const opts = { nodeVersion: 'v22.0.0', serverDir: '/srv/fileforge/mcp-server/' };

test('explains an ABI mismatch with the rebuild command', () => {
  const err = Object.assign(new Error(
    "The module 'better_sqlite3.node' was compiled against a different Node.js version using NODE_MODULE_VERSION 115. This version of Node.js requires NODE_MODULE_VERSION 127.",
  ), { code: 'ERR_DLOPEN_FAILED' });
  const help = nativeModuleHelp(err, opts);
  assert.match(help, /npm rebuild better-sqlite3/);
  assert.match(help, /v22\.0\.0/);
  assert.match(help, /\/srv\/fileforge\/mcp-server\//);
});

test('matches on the error code alone', () => {
  assert.ok(nativeModuleHelp({ code: 'ERR_DLOPEN_FAILED', message: 'dlopen failed' }, opts));
});

test('leaves unrelated errors alone', () => {
  assert.equal(nativeModuleHelp(new Error('SQLITE_CANTOPEN'), opts), null);
  assert.equal(nativeModuleHelp(undefined, opts), null);
});

test('passes when better-sqlite3 loads', () => {
  assert.doesNotThrow(() => checkNativeModules());
});
