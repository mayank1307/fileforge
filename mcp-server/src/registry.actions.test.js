import test from 'node:test';
import assert from 'node:assert/strict';
import { registry } from './registry.js';
import './toolModules.js';

function stubRpc() {
  const calls = [];
  return { calls, rpcClient: { send: async (method) => { calls.push(method); return { ok: true, data: {} }; } } };
}

test('an unknown action is rejected and makes no RPC call', async () => {
  const { calls, rpcClient } = stubRpc();
  const result = await registry.call('fileforge_browser_action', { action: 'clos_everything', url: 'https://example.com' }, { rpcClient });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'UNKNOWN_ACTION');
  assert.ok(result.error.details.availableActions.includes('navigate'));
  assert.deepEqual(calls, []);
});

test('a missing action is rejected and makes no RPC call', async () => {
  const { calls, rpcClient } = stubRpc();
  const result = await registry.call('fileforge_browser_action', { url: 'https://example.com' }, { rpcClient });
  assert.equal(result.error.code, 'UNKNOWN_ACTION');
  assert.deepEqual(calls, []);
});

test('a partial match does not run a different action', async () => {
  const { calls, rpcClient } = stubRpc();
  const result = await registry.call('fileforge_browser_action', { action: 'do_not_navigate', url: 'https://example.com' }, { rpcClient });
  assert.equal(result.error.code, 'UNKNOWN_ACTION');
  assert.deepEqual(calls, []);
});

test('every tool rejects an unknown action before running anything', async () => {
  for (const { name } of registry.listTools()) {
    const { calls, rpcClient } = stubRpc();
    const result = await registry.call(name, { action: 'zzz_not_an_action' }, { rpcClient });
    assert.equal(result.ok, false, name);
    assert.equal(result.error.code, 'UNKNOWN_ACTION', name);
    assert.deepEqual(calls, [], name);
  }
});

test('a name differing only in case or punctuation matches, with a warning', async () => {
  const { calls, rpcClient } = stubRpc();
  const result = await registry.call('fileforge_page_interaction', { action: 'GET-TEXT' }, { rpcClient });
  assert.notEqual(result.error?.code, 'UNKNOWN_ACTION');
  assert.equal(result.meta.actionWarning, 'Unknown action "GET-TEXT"; matched "get_text".');
  assert.ok(calls.length > 0);
});

test('a legacy alias reaches the action it names', async () => {
  const { calls, rpcClient } = stubRpc();
  const result = await registry.call('fileforge_browser_action', { action: 'go_back' }, { rpcClient });
  assert.notEqual(result.error?.code, 'UNKNOWN_ACTION');
  assert.ok(!calls.includes('browser.navigate'), calls.join());
  assert.ok(calls.length > 0);
});

test('aliases on each aliased tool are not rejected', async () => {
  const cases = [
    ['fileforge_page_interaction', 'page.getText'],
    ['fileforge_scrape_action', 'scrape.page'],
    ['fileforge_devtools_action', 'devtools.getConsole'],
  ];
  for (const [tool, action] of cases) {
    const { rpcClient } = stubRpc();
    const result = await registry.call(tool, { action, url: 'https://example.com' }, { rpcClient });
    assert.notEqual(result.error?.code, 'UNKNOWN_ACTION', `${tool} ${action}`);
  }
});

test('responses do not repeat the action list, except when the action was unknown', async () => {
  const { rpcClient } = stubRpc();
  for (const [tool, action] of [['fileforge_task_action', 'list'], ['fileforge_note_action', 'list'], ['fileforge_page_interaction', 'get_text'], ['fileforge_qa_testing', 'check_console_clean']]) {
    const result = await registry.call(tool, { action }, { rpcClient });
    assert.equal(result.meta?.availableActions, undefined, `${tool} ${action}`);
  }
  const unknown = await registry.call('fileforge_task_action', { action: 'zzz' }, { rpcClient });
  assert.ok(unknown.error.details.availableActions.includes('list'));
});
