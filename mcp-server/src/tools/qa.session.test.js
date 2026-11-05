import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registry } from '../registry.js';
import './qa.js';
import './devtools.js';

// Mirrors the extension: getConsole and getNetwork succeed either way and report the session through sessionActive.
function stubRpc({ sessionActive, entries = [], requests = [] }) {
  const calls = [];
  return {
    calls,
    rpcClient: {
      send: async (method) => {
        calls.push(method);
        if (method === 'devtools.getConsole') return { ok: true, data: { tabId: 1, sessionActive, entries } };
        if (method === 'devtools.getNetwork') return { ok: true, data: { tabId: 1, requests } };
        if (method === 'devtools.startSession') return { ok: true, data: { tabId: 1, status: 'attached' } };
        return { ok: true, data: {} };
      },
    },
  };
}

for (const action of ['check_console_clean', 'check_network_clean']) {
  test(`${action} fails without a session instead of passing on no data`, async () => {
    const { rpcClient } = stubRpc({ sessionActive: false });
    const result = await registry.call('fileforge_qa_testing', { action }, { rpcClient });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'SESSION_NOT_STARTED');
    assert.equal(result.meta.action, action);
  });

  test(`${action} passes on a running session with no issues`, async () => {
    const { rpcClient } = stubRpc({ sessionActive: true });
    const result = await registry.call('fileforge_qa_testing', { action }, { rpcClient });
    assert.equal(result.ok, true);
    assert.deepEqual(result.data.issues, []);
  });
}

test('check_console_clean fails on a console error in a running session', async () => {
  const { rpcClient } = stubRpc({ sessionActive: true, entries: [{ level: 'error', message: 'boom', timestamp: 1 }] });
  const result = await registry.call('fileforge_qa_testing', { action: 'check_console_clean' }, { rpcClient });
  assert.equal(result.ok, false);
  assert.equal(result.data.issues.length, 1);
});

test('check_network_clean fails on a failed request in a running session', async () => {
  const requests = [{ url: 'https://example.com/a', method: 'GET', type: 'Fetch', response: { status: 500 } }];
  const { rpcClient } = stubRpc({ sessionActive: true, requests });
  const result = await registry.call('fileforge_qa_testing', { action: 'check_network_clean' }, { rpcClient });
  assert.equal(result.ok, false);
  assert.equal(result.data.issues.length, 1);
});

test('query_devtools reports no session, and autoStartSession starts one', async () => {
  const { calls, rpcClient } = stubRpc({ sessionActive: false });
  const refused = await registry.call('fileforge_devtools_action', { action: 'query_devtools', query: { console: true } }, { rpcClient });
  assert.equal(refused.error.code, 'SESSION_NOT_STARTED');
  assert.ok(!calls.includes('devtools.startSession'));
  await registry.call('fileforge_devtools_action', { action: 'query_devtools', query: { console: true }, autoStartSession: true, captureForMs: 0 }, { rpcClient });
  assert.ok(calls.includes('devtools.startSession'));
});

test('the session status action reports no session', async () => {
  const { rpcClient } = stubRpc({ sessionActive: false });
  const result = await registry.call('fileforge_devtools_action', { action: 'session', operation: 'status' }, { rpcClient });
  assert.equal(result.data.active, false);
});

test('the extension reports whether a session exists', () => {
  const source = readFileSync(new URL('../../../extension/background/modules/devtoolsModule.js', import.meta.url), 'utf8');
  assert.match(source, /sessionActive: Boolean\(session\)/);
});

test('check_network_clean fails on a request that never completed', async () => {
  const requests = [{ url: 'https://example.com/a', method: 'GET', type: 'Fetch', failed: { errorText: 'net::ERR_FAILED' } }];
  const { rpcClient } = stubRpc({ sessionActive: true, requests });
  const result = await registry.call('fileforge_qa_testing', { action: 'check_network_clean' }, { rpcClient });
  assert.equal(result.ok, false);
  assert.equal(result.data.issues[0].type, 'reliability.failed-request');
});

test('a successful request does not count as an issue', async () => {
  const requests = [{ url: 'https://example.com/a', method: 'GET', type: 'Fetch', response: { status: 200 } }];
  const { rpcClient } = stubRpc({ sessionActive: true, requests });
  const result = await registry.call('fileforge_qa_testing', { action: 'check_network_clean' }, { rpcClient });
  assert.equal(result.ok, true);
});

test('a failed request keeps its error text and severity through query_devtools', async () => {
  const requests = [{ url: 'https://example.com/app.js', method: 'GET', type: 'Script', failed: { errorText: 'net::ERR_FAILED' } }];
  const { rpcClient } = stubRpc({ sessionActive: true, requests });
  const result = await registry.call('fileforge_qa_testing', { action: 'check_network_clean' }, { rpcClient });
  const [issue] = result.data.issues;
  assert.equal(issue.evidence[0].text, 'net::ERR_FAILED');
  assert.notEqual(issue.severity, 'low');
});

// A page load through the same stub, with the requests and layout results a test wants.
function pageRpc({ requests = [], overflow = [] }) {
  const { rpcClient: base } = stubRpc({ sessionActive: true, requests });
  return {
    send: async (method, params) => {
      if (method === 'responsive.scanLayout') return { ok: true, data: { overflow, overlaps: [] } };
      if (method === 'browser.navigate') return { ok: true, data: { id: 1 } };
      return base.send(method, params);
    },
  };
}

for (const action of ['run_smoke_test', 'check_page_boot']) {
  test(`${action} passes on a clean page`, async () => {
    const result = await registry.call('fileforge_qa_testing', { action, url: 'https://example.com/', store: false }, { rpcClient: pageRpc({}) });
    assert.equal(result.ok, true);
    assert.equal(result.data.summary.clean, true);
  });

  test(`${action} lists a layout signal without failing`, async () => {
    const overflow = [{ tag: 'div', right: 2000, viewportWidth: 1440 }];
    const result = await registry.call('fileforge_qa_testing', { action, url: 'https://example.com/', store: false }, { rpcClient: pageRpc({ overflow }) });
    assert.equal(result.ok, true);
    assert.equal(result.data.summary.clean, false);
    assert.equal(result.data.issues[0].type, 'visual.horizontal-overflow');
  });

  test(`${action} fails when the page itself returns an error`, async () => {
    const requests = [{ url: 'https://example.com/', method: 'GET', type: 'Document', response: { status: 500 } }];
    const result = await registry.call('fileforge_qa_testing', { action, url: 'https://example.com/', store: false }, { rpcClient: pageRpc({ requests }) });
    assert.equal(result.ok, false);
    assert.equal(result.data.ok, false);
  });
}
