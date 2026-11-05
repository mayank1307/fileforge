import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import {
  cliCommand,
  findExtensionDir,
  isEphemeralInstall,
  jsonConfigPath,
  mergeServerEntry,
  shellQuote,
  writeClientConfig,
} from './setup.js';

const SCRIPT = fileURLToPath(new URL('./scripts/setup.js', import.meta.url));
const ENTRY = { command: '/usr/bin/node', args: ['/opt/fileforge/src/index.js'] };

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'fileforge-setup-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('finds the extension in this clone', () => {
  assert.ok(existsSync(join(findExtensionDir(), 'manifest.json')));
});

test('prefers the npm package layout, with extension/ beside src/', (t) => {
  const root = tempDir(t);
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'extension'));
  writeFileSync(join(root, 'extension', 'manifest.json'), '{}');
  assert.equal(findExtensionDir(join(root, 'src')), join(root, 'src', '..', 'extension'));
});

test('reports no extension folder rather than guessing', (t) => {
  const root = tempDir(t);
  mkdirSync(join(root, 'a', 'src'), { recursive: true });
  assert.equal(findExtensionDir(join(root, 'a', 'src')), null);
});

test('spots an npx cache install', () => {
  assert.equal(isEphemeralInstall('/Users/me/.npm/_npx/abc/node_modules/fileforge-mcp-server/src/index.js'), true);
  assert.equal(isEphemeralInstall('C:\\Users\\me\\npm-cache\\_npx\\abc\\index.js'), true);
  assert.equal(isEphemeralInstall('/usr/local/lib/node_modules/fileforge-mcp-server/src/index.js'), false);
});

test('config paths per client and OS', () => {
  const opts = (platform) => ({ platform, home: '/home/me', appData: '/appdata' });
  assert.equal(jsonConfigPath('cursor', opts('linux')), join('/home/me', '.cursor', 'mcp.json'));
  assert.equal(jsonConfigPath('claude-desktop', opts('darwin')), join('/home/me', 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
  assert.equal(jsonConfigPath('claude-desktop', opts('win32')), join('/appdata', 'Claude', 'claude_desktop_config.json'));
  assert.equal(jsonConfigPath('claude-desktop', opts('linux')), null);
});

test('CLI commands quote paths with spaces', () => {
  const posix = { node: '/usr/bin/node', entry: '/Users/My Name/index.js', platform: 'darwin' };
  assert.equal(cliCommand('claude-code', posix), `claude mcp add --scope user fileforge -- /usr/bin/node '/Users/My Name/index.js'`);
  assert.equal(cliCommand('codex', posix), `codex mcp add fileforge -- /usr/bin/node '/Users/My Name/index.js'`);
  assert.equal(shellQuote('C:\\Program Files\\node.exe', 'win32'), '"C:\\Program Files\\node.exe"');
  assert.equal(shellQuote(`it's`, 'linux'), `'it'\\''s'`);
});

test('merge adds to an empty or missing config', () => {
  for (const existing of [null, '', '  \n']) {
    const { status, text } = mergeServerEntry(existing, ENTRY);
    assert.equal(status, 'added');
    assert.deepEqual(JSON.parse(text), { mcpServers: { fileforge: ENTRY } });
  }
});

test('merge keeps other servers and other top-level settings', () => {
  const existing = JSON.stringify({ theme: 'dark', mcpServers: { other: { command: 'x' } } });
  const merged = JSON.parse(mergeServerEntry(existing, ENTRY).text);
  assert.equal(merged.theme, 'dark');
  assert.deepEqual(merged.mcpServers.other, { command: 'x' });
  assert.deepEqual(merged.mcpServers.fileforge, ENTRY);
});

test('merge updates stale paths but keeps env the user set', () => {
  const existing = JSON.stringify({ mcpServers: { fileforge: { command: 'old', args: ['old'], env: { FILEFORGE_REQUIRE_PAIRING: '1' } } } });
  const { status, text } = mergeServerEntry(existing, ENTRY);
  assert.equal(status, 'updated');
  assert.deepEqual(JSON.parse(text).mcpServers.fileforge, { ...ENTRY, env: { FILEFORGE_REQUIRE_PAIRING: '1' } });
});

test('merge reports unchanged when already set up', () => {
  const existing = JSON.stringify({ mcpServers: { fileforge: ENTRY } });
  assert.deepEqual(mergeServerEntry(existing, ENTRY), { status: 'unchanged', text: existing });
});

test('merge refuses files it cannot safely edit', () => {
  assert.throws(() => mergeServerEntry('{ // comment\n}', ENTRY), /not valid JSON/);
  assert.throws(() => mergeServerEntry('[]', ENTRY), /not a JSON object/);
  assert.throws(() => mergeServerEntry('{"mcpServers": []}', ENTRY), /"mcpServers"/);
});

test('write creates the file and its folder, with no backup', (t) => {
  const path = join(tempDir(t), 'new', 'mcp.json');
  const result = writeClientConfig(path, ENTRY);
  assert.equal(result.status, 'added');
  assert.equal(result.backup, null);
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')).mcpServers.fileforge, ENTRY);
});

test('write backs up the old file, and a second run changes nothing', (t) => {
  const path = join(tempDir(t), 'mcp.json');
  const original = JSON.stringify({ mcpServers: { other: { command: 'x' } } });
  writeFileSync(path, original);

  const first = writeClientConfig(path, ENTRY);
  assert.equal(first.status, 'added');
  assert.equal(readFileSync(first.backup, 'utf8'), original);

  const afterFirst = readFileSync(path, 'utf8');
  rmSync(first.backup);
  assert.equal(writeClientConfig(path, ENTRY).status, 'unchanged');
  assert.equal(readFileSync(path, 'utf8'), afterFirst);
  assert.equal(existsSync(first.backup), false);
});

test('write leaves an unparseable file untouched', (t) => {
  const path = join(tempDir(t), 'mcp.json');
  writeFileSync(path, 'not json');
  assert.throws(() => writeClientConfig(path, ENTRY), /not valid JSON/);
  assert.equal(readFileSync(path, 'utf8'), 'not json');
  assert.equal(existsSync(`${path}.bak`), false);
});

function runCli(home, args) {
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData') };
  return spawnSync(process.execPath, [SCRIPT, ...args], { env, encoding: 'utf8' });
}

test('CLI with no flags prints every step and writes nothing', (t) => {
  const home = tempDir(t);
  const output = execFileSync(process.execPath, [SCRIPT], { env: { ...process.env, HOME: home, USERPROFILE: home }, encoding: 'utf8' });
  assert.match(output, /chrome:\/\/extensions/);
  assert.match(output, /manifest|extension/);
  assert.match(output, /claude mcp add --scope user fileforge/);
  assert.match(output, /codex mcp add fileforge/);
  assert.match(output, /fileforge-verify/);
  assert.equal(existsSync(join(home, '.cursor')), false);
});

test('CLI --client cursor --write writes the config under HOME', (t) => {
  const home = tempDir(t);
  const result = runCli(home, ['--client', 'cursor', '--write']);
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(readFileSync(join(home, '.cursor', 'mcp.json'), 'utf8'));
  assert.equal(config.mcpServers.fileforge.command, process.execPath);
  assert.match(config.mcpServers.fileforge.args[0], /index\.js$/);
});

test('CLI rejects bad flag combinations', (t) => {
  const home = tempDir(t);
  assert.equal(runCli(home, ['--client', 'nope']).status, 1);
  assert.equal(runCli(home, ['--write']).status, 1);
  const cliClient = runCli(home, ['--client', 'claude-code', '--write']);
  assert.equal(cliClient.status, 1);
  assert.match(cliClient.stderr, /claude mcp add/);
});

test('CLI reports a broken config and leaves it alone', (t) => {
  const home = tempDir(t);
  mkdirSync(join(home, '.cursor'));
  const path = join(home, '.cursor', 'mcp.json');
  writeFileSync(path, '{ broken');
  const result = runCli(home, ['--client', 'cursor', '--write']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unchanged/);
  assert.equal(readFileSync(path, 'utf8'), '{ broken');
});
