import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  EXPECTED_BUILD_ID,
  computeExtensionBuildId,
  extensionBuildWarning,
  readExpectedBuildId,
  renderBuildInfo,
} from './extensionBuild.js';

test('extension/background/buildInfo.js matches the extension files', () => {
  assert.equal(
    EXPECTED_BUILD_ID,
    computeExtensionBuildId(),
    'buildInfo.js is out of date. Run: cd mcp-server && npm run build:id'
  );
});

function fakeExtension(files) {
  const dir = mkdtempSync(join(tmpdir(), 'fileforge-build-'));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

test('build ID ignores buildInfo.js, dotfiles and line endings', () => {
  const base = computeExtensionBuildId(fakeExtension({ 'a.js': 'one\ntwo\n' }));
  assert.equal(computeExtensionBuildId(fakeExtension({ 'a.js': 'one\r\ntwo\r\n' })), base);
  assert.equal(
    computeExtensionBuildId(fakeExtension({ 'a.js': 'one\ntwo\n', 'background/buildInfo.js': 'x', '.DS_Store': 'x' })),
    base
  );
  assert.notEqual(computeExtensionBuildId(fakeExtension({ 'a.js': 'one\nthree\n' })), base);
});

test('readExpectedBuildId reads the generated file and returns null without one', () => {
  const dir = fakeExtension({ 'background/buildInfo.js': renderBuildInfo('abc123def456') });
  assert.equal(readExpectedBuildId(join(dir, 'background', 'buildInfo.js')), 'abc123def456');
  assert.equal(readExpectedBuildId(join(dir, 'missing.js')), null);
});

test('extensionBuildWarning flags a stale or missing build ID only', () => {
  assert.equal(extensionBuildWarning('abc', 'abc'), null);
  assert.equal(extensionBuildWarning('old', null), null);
  assert.match(extensionBuildWarning('old', 'abc'), /reload icon/);
  assert.match(extensionBuildWarning(undefined, 'abc'), /older FileForge extension code/);
});
