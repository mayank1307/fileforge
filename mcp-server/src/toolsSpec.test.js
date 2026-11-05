import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Set an isolated home before dynamically importing stores and bridge auth.
const previousHome = process.env.HOME;
const previousProfile = process.env.USERPROFILE;
const temporaryHome = mkdtempSync(join(tmpdir(), 'fileforge-spec-'));
process.env.HOME = temporaryHome;
process.env.USERPROFILE = temporaryHome;
const { buildToolsSpec, renderToolsSpec, TOOLS_SPEC_URL } = await import('./toolsSpec.js');
const { registry } = await import('./registry.js');

test('spec includes every registered tool and canonical action without inventing output schemas', () => {
  try {
    const spec = buildToolsSpec();
    assert.equal(spec.counts.tools, registry.listTools().length);
    for (const definition of registry.listToolDefs()) {
      const tool = spec.tools.find((entry) => entry.name === definition.name);
      assert.deepEqual(tool.inputSchema, definition.inputSchema);
      assert.deepEqual(tool.actions.map((entry) => entry.name), definition.inputSchema.properties.action.enum);
      for (const action of tool.actions) {
        assert.equal(action.output.schema, null);
        assert.equal(action.requestTemplate.params.arguments.action, action.name);
        assert.equal(action.requestTemplate.params.name, tool.name);
      }
    }
    assert.equal(spec.counts.actions, spec.tools.flatMap((tool) => tool.actions).length);
    const notes = spec.tools.find((tool) => tool.slug === 'note');
    const create = notes.actions.find((action) => action.name === 'create');
    const list = notes.actions.find((action) => action.name === 'list');
    assert.deepEqual(create.input.schema.required, ['action', 'title', 'body']);
    assert.equal(create.input.schema.properties.limit, undefined);
    assert.equal(list.input.schema.properties.body, undefined);
    assert.equal(list.input.schema.properties.limit.default, 20);
    const a11y = spec.tools.find((tool) => tool.slug === 'a11y').actions[0];
    assert.equal(a11y.input.schemaScope, 'tool');
    assert.deepEqual(a11y.permissions, ['allowBrowser']);
    assert.equal(readFileSync(TOOLS_SPEC_URL, 'utf8').replace(/\r\n/g, '\n'), renderToolsSpec(), 'Run npm run docs:tools to refresh docs/tools-spec.json');
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousProfile;
    rmSync(temporaryHome, { recursive: true, force: true });
  }
});
