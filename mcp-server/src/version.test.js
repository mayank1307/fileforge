import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { SERVER_VERSION, extensionVersionWarning } from './version.js';

test('server version comes from package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(SERVER_VERSION, pkg.version);
});

test('extension manifest and server share one version', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../extension/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.version, SERVER_VERSION);
});

test('server.json matches package.json for the MCP Registry', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const server = JSON.parse(readFileSync(new URL('../server.json', import.meta.url), 'utf8'));
  assert.equal(server.name, pkg.mcpName);
  assert.equal(server.version, pkg.version);
  assert.equal(server.packages[0].identifier, pkg.name);
  assert.equal(server.packages[0].version, pkg.version);
  assert.ok(server.description.length <= 100, 'the registry caps description at 100 characters');
});

test('no warning when extension and server versions match', () => {
  assert.equal(extensionVersionWarning('0.2.0', '0.2.0'), null);
});

test('warns on a version mismatch, naming both versions', () => {
  const warning = extensionVersionWarning('0.1.1', '0.2.0');
  assert.match(warning, /0\.1\.1/);
  assert.match(warning, /0\.2\.0/);
  assert.match(warning, /chrome:\/\/extensions/);
});

test('warns when the extension reports no version', () => {
  assert.match(extensionVersionWarning(undefined, '0.2.0'), /did not report a version/);
});
