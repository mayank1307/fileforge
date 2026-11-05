import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import './toolModules.js';
import { registry } from './registry.js';

// Tool tests stub rpcClient, so nothing else checks that a method the server calls exists in the extension.
const SRC = fileURLToPath(new URL('.', import.meta.url));
const EXTENSION = fileURLToPath(new URL('../../extension/', import.meta.url));

function jsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return jsFiles(path);
    return name.endsWith('.js') && !name.endsWith('.test.js') ? [path] : [];
  });
}

function extensionMethods() {
  const router = readFileSync(join(EXTENSION, 'background/mcpRpcRouter.js'), 'utf8');
  const block = /const modules = \{(.*?)\n\};/s.exec(router)[1];
  const methods = new Set();
  for (const [, group, moduleName] of block.matchAll(/^\s*(\w+):\s*(\w+),?$/gm)) {
    const source = readFileSync(join(EXTENSION, 'background/modules', `${moduleName}.js`), 'utf8');
    const body = source.slice(source.indexOf(`export const ${moduleName}`));
    for (const [, method] of body.matchAll(/^ {2}(?:async )?(\w+)\s*\(/gm)) methods.add(`${group}.${method}`);
  }
  for (const [, alias, target] of router.matchAll(/\['(\w+\.\w+)', '(\w+\.\w+)'\]/g)) {
    if (methods.has(target)) methods.add(alias);
  }
  return methods;
}

function serverCalls() {
  const calls = [];
  for (const file of jsFiles(SRC)) {
    const source = readFileSync(file, 'utf8');
    for (const [, method] of source.matchAll(/\.send\(\s*'(\w+\.\w+)'/g)) calls.push({ method, from: file.slice(SRC.length) });
  }
  return calls;
}

// Normalizes a dotted catalog method or a server action name so camelCase
// and snake_case forms compare equal (getLayeredSnapshot === get_layered_snapshot).
function normalizeActionKey(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// The side panel's Tools catalog (extension/popup/popup.js) lists a method name
// per entry under a category whose `mcpTool` is the server tool that backs it.
// Each category contributes one mcpTool followed by its dotted `group.method`
// entries; param objects use undotted names, so the dot requirement skips them.
function catalogEntries() {
  const popup = readFileSync(join(EXTENSION, 'popup/popup.js'), 'utf8');
  const block = /const TOOL_CATEGORIES = \[([\s\S]*?)\n\];/.exec(popup)[1];
  const entries = [];
  for (const chunk of block.split(/mcpTool:\s*'/).slice(1)) {
    const tool = /^([^']+)'/.exec(chunk)[1];
    for (const [, name] of chunk.matchAll(/name:\s*'(\w+\.\w+)'/g)) entries.push({ tool, name });
  }
  return entries;
}

// action enum the aggregate tool advertises (switch tools and makeActionTool alike).
function serverActions(toolName) {
  const def = registry.listToolDefs().find((tool) => tool.name === toolName);
  return def?.inputSchema?.properties?.action?.enum ?? [];
}

test('the contract test can see the extension and the server', () => {
  const methods = extensionMethods();
  assert.ok(methods.has('browser.navigate'));
  assert.ok(methods.has('scrape.page'));
  assert.ok(serverCalls().length > 50);
  assert.ok(catalogEntries().length > 30);
  assert.ok(serverActions('fileforge_task_action').includes('add'));
});

test('every RPC the server sends exists in the extension', () => {
  const methods = extensionMethods();
  const missing = serverCalls().filter(({ method }) => !methods.has(method));
  assert.deepEqual(missing, []);
});

test('every side-panel catalog entry resolves to an extension RPC or a server action', () => {
  const methods = extensionMethods();
  const unresolved = [];
  for (const { tool, name } of catalogEntries()) {
    if (methods.has(name)) continue; // a real extension RPC method (or legacy alias)
    const action = normalizeActionKey(name.split('.').slice(1).join('.'));
    if (serverActions(tool).some((candidate) => normalizeActionKey(candidate) === action)) continue;
    unresolved.push(`${name} (no extension RPC and no action of ${tool})`);
  }
  assert.deepEqual(unresolved, []);
});
