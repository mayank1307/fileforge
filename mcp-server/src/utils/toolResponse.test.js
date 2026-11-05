import test from 'node:test';
import assert from 'node:assert/strict';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { registry } from '../registry.js';
import '../toolModules.js';
import { normalizeToolResponse, toMcpToolResult, TOOL_OUTPUT_SCHEMA } from './toolResponse.js';

const validate = new AjvJsonSchemaValidator().getValidator(TOOL_OUTPUT_SCHEMA);

test('every tool declares the shared output schema, with every field described', () => {
  for (const tool of registry.listTools()) assert.deepEqual(tool.outputSchema, TOOL_OUTPUT_SCHEMA, tool.name);
  for (const [name, field] of Object.entries(TOOL_OUTPUT_SCHEMA.properties)) assert.ok(field.description, name);
});

test('responses with no ok still satisfy the schema', () => {
  const cases = [
    [{ data: { a: 1 } }, true],
    [{ error: { code: 'X', message: 'm' } }, false],
    [[1, 2], true],
    ['text', true],
    [null, true],
    [undefined, true],
  ];
  for (const [input, ok] of cases) {
    const response = normalizeToolResponse(input);
    assert.equal(response.ok, ok);
    assert.equal(validate(response).valid, true, JSON.stringify(input));
  }
});

test('an existing ok is kept, and a failed check stays failed', () => {
  const response = normalizeToolResponse({ ok: false, data: { issues: [1] } });
  assert.equal(response.ok, false);
  assert.deepEqual(response.data, { issues: [1] });
});

test('the MCP result carries the same response as text and as structured content', () => {
  const response = { ok: true, data: { a: 1 }, extra: 'query module' };
  const result = toMcpToolResult(response);
  assert.deepEqual(JSON.parse(result.content[0].text), response);
  assert.deepEqual(result.structuredContent, response);
  assert.equal(validate(result.structuredContent).valid, true);
});

test('real error and warning responses satisfy the schema', async () => {
  const rpcClient = { send: async () => ({ ok: true, data: {} }) };
  for (const params of [{ action: 'zzz' }, {}, { action: 'GET-TEXT' }]) {
    const response = normalizeToolResponse(await registry.call('fileforge_page_interaction', params, { rpcClient }));
    assert.equal(validate(JSON.parse(JSON.stringify(response))).valid, true, JSON.stringify(params));
  }
  const unknownTool = normalizeToolResponse(await registry.call('no_such_tool', {}, { rpcClient }));
  assert.equal(validate(unknownTool).valid, true);
});

test('a failed reply inside data fails the response and lifts the error', () => {
  const error = { code: 'NOT_FOUND', message: 'No such element' };
  const response = normalizeToolResponse({ ok: true, data: { ok: false, error }, meta: { tool: 't' } });
  assert.equal(response.ok, false);
  assert.deepEqual(response.error, error);
  assert.deepEqual(response.data, { ok: false, error });
  assert.deepEqual(response.meta, { tool: 't' });
});

test('a check that did not pass fails without inventing an error', () => {
  const response = normalizeToolResponse({ ok: true, data: { ok: false, issues: [1] } });
  assert.equal(response.ok, false);
  assert.equal('error' in response, false);
});

test('a successful reply and an existing error are left alone', () => {
  const success = { ok: true, data: { ok: true, text: 'hi' } };
  assert.equal(normalizeToolResponse(success), success);
  const noOk = { ok: true, data: { text: 'hi' } };
  assert.equal(normalizeToolResponse(noOk), noOk);
  const own = { code: 'OWN', message: 'm' };
  assert.equal(normalizeToolResponse({ ok: true, error: own, data: { ok: false, error: { code: 'INNER' } } }).error, own);
});

test('extension failures reach the top level through the registry', async () => {
  const failure = { ok: false, error: { code: 'EXT_FAIL', message: 'Selector not found' } };
  const rpcClient = { send: async () => failure };
  const cases = [
    ['fileforge_page_interaction', { action: 'click', selector: '#a' }],
    ['fileforge_page_interaction', { action: 'get_text' }],
    ['fileforge_browser_action', { action: 'navigate', url: 'https://example.com/' }],
    ['fileforge_devtools_action', { action: 'evaluate', expression: '1' }],
    ['fileforge_qa_testing', { action: 'check_forms' }],
    ['fileforge_api_action', { action: 'discover' }],
    ['fileforge_api_action', { action: 'export_curl' }],
  ];
  for (const [tool, params] of cases) {
    const response = await registry.call(tool, params, { rpcClient });
    assert.equal(response.ok, false, `${tool} ${params.action}`);
    assert.equal(response.error.code, 'EXT_FAIL', `${tool} ${params.action}`);
    assert.equal(validate(JSON.parse(JSON.stringify(response))).valid, true);
  }
});
