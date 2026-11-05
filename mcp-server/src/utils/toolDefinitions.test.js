import test from 'node:test';
import assert from 'node:assert/strict';
import { registry } from '../registry.js';
import '../toolModules.js';

import { actionEntries } from './actionToolUtils.js';

// About 4 characters per token. Raise this deliberately: every character is sent to every client.
const TOOL_LIST_MAX_CHARS = 95000;
const tools = registry.listTools();

test('every parameter of every tool has a description', () => {
  const missing = tools.flatMap((tool) => Object.entries(tool.inputSchema.properties)
    .filter(([, schema]) => !schema.description)
    .map(([name, schema]) => `${tool.name}.${name} (${schema.type})`));
  assert.deepEqual(missing, []);
});

test('every tool declares all four MCP annotations', () => {
  for (const tool of tools) {
    for (const hint of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']) {
      assert.equal(typeof tool.annotations?.[hint], 'boolean', `${tool.name}.${hint}`);
    }
  }
});

test('read-only tools are not also marked destructive', () => {
  for (const tool of tools) {
    if (tool.annotations.readOnlyHint) assert.equal(tool.annotations.destructiveHint, false, tool.name);
  }
});

test('tools with permanent or page-changing actions are marked destructive', () => {
  const destructive = new Set(tools.filter((tool) => tool.annotations.destructiveHint).map((tool) => tool.name));
  for (const name of ['fileforge_browser_action', 'fileforge_page_interaction', 'fileforge_devtools_action', 'fileforge_workflow_action', 'fileforge_task_action', 'fileforge_eye_action']) {
    assert.ok(destructive.has(name), name);
  }
});

test('every tool description says something about when to use it or what it changes', () => {
  for (const tool of tools) {
    assert.ok(tool.description.length >= 150, `${tool.name} is too short`);
    assert.ok(tool.description.length <= 420, `${tool.name} is too long: ${tool.description.length}`);
  }
});

test('a description a module sets itself is not replaced by the shared one', () => {
  const eye = tools.find((tool) => tool.name === 'fileforge_eye_action');
  assert.match(eye.inputSchema.properties.tripwire.description, /Tripwire definition/);
});

test('every action of every tool is described in the tool list', () => {
  for (const tool of tools) {
    const catalog = tool.inputSchema.properties.action.description;
    for (const action of tool.inputSchema.properties.action.enum) {
      assert.match(catalog, new RegExp(`(^|\\. |[.!?] )${action}( \\([^)]*\\))?: \\S`), `${tool.name} ${action}`);
    }
  }
});

test('required parameters named in an action catalog exist on the tool', () => {
  for (const def of registry.listToolDefs()) {
    for (const { action, required } of actionEntries(def)) {
      for (const param of required) {
        assert.ok(def.inputSchema.properties[param], `${def.name} ${action} requires unknown ${param}`);
      }
    }
  }
});

test('the tool list stays within its size budget', () => {
  const size = JSON.stringify(tools).length;
  assert.ok(size <= TOOL_LIST_MAX_CHARS, `tool list is ${size} characters`);
});

test('hand-written tools list the parameters their handlers insist on', () => {
  const catalog = (name) => tools.find((tool) => tool.name === name).inputSchema.properties.action.description;
  assert.match(catalog('fileforge_page_interaction'), /fill \(selector, value\): /);
  assert.match(catalog('fileforge_browser_action'), /close_tab \(tabId\): /);
  assert.match(catalog('fileforge_scrape_action'), /crawl_site \(url\): /);
});

test('shared parameter wording does not leak across tools', () => {
  const describe = (tool, param) => tools.find((entry) => entry.name === tool).inputSchema.properties[param].description;
  assert.doesNotMatch(describe('fileforge_note_action', 'query'), /SQL/);
  assert.doesNotMatch(describe('fileforge_memory_action', 'query'), /SQL/);
  assert.match(describe('fileforge_export_action', 'query'), /SQL/);
  assert.doesNotMatch(describe('fileforge_note_action', 'title'), /report|audit/);
  assert.doesNotMatch(describe('fileforge_file_action', 'name'), /routine/);
  assert.match(describe('fileforge_eye_action', 'tabId'), /lock onto/);
});

test('generated parameter lists come from the code', () => {
  const properties = (tool) => tools.find((entry) => entry.name === tool).inputSchema.properties;
  assert.ok(properties('fileforge_scrape_action').preset.enum.includes('seo_audit'));
  assert.ok(properties('fileforge_scrape_action').sections.items.enum.includes('pageLinks'));
  assert.match(properties('fileforge_devtools_action').query.description, /jsErrors/);
  assert.match(properties('fileforge_audit_action').query.description, /roadmap/);
});

test('tool descriptions state prerequisites an agent cannot see in the schema', () => {
  const describe = (name) => tools.find((tool) => tool.name === name).description;
  assert.match(describe('fileforge_api_action'), /start_session/);
  assert.match(describe('fileforge_file_action'), /FILEFORGE_ALLOWED_READ_PATHS/);
  assert.match(describe('fileforge_file_action'), /FILEFORGE_ALLOWED_FETCH_HOSTS/);
  assert.match(describe('fileforge_task_action'), /delete removes a task/);
  for (const name of ['fileforge_browser_action', 'fileforge_page_interaction', 'fileforge_scrape_action', 'fileforge_devtools_action']) {
    assert.match(describe(name), /Needs the extension\./, name);
  }
  for (const name of ['fileforge_result_action', 'fileforge_sql_action']) {
    assert.match(describe(name), /without the extension/, name);
  }
});
