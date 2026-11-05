import test from 'node:test';
import assert from 'node:assert/strict';
import { captureOwnedTab, openInstrumentedTab, summarizeCapture } from './browserCaptureUtils.js';

function fakeRpcClient() {
  const calls = [];
  return {
    calls,
    async send(method, params) {
      calls.push({ method, params });
      if (method === 'browser.getRawContext') {
        return { ok: true, data: { tabs: [{ id: 88, isActive: true }], activeTabId: 88, windows: [] } };
      }
      if (method === 'browser.navigate') return { ok: true, data: { id: 123 } };
      if (method === 'devtools.getNetwork') return { ok: true, data: { requests: [] } };
      return { ok: true, data: {} };
    },
  };
}

test('opens an instrumented tab by attaching DevTools before navigation', async () => {
  const rpcClient = fakeRpcClient();
  const result = await openInstrumentedTab(rpcClient, 'https://example.com/', {
    settleMs: 0,
    networkIdleMs: 1,
    networkIdleTimeoutMs: 50,
  });

  assert.equal(result.tabId, '123');
  assert.deepEqual(rpcClient.calls.slice(0, 5).map((call) => call.method), [
    'browser.getRawContext',
    'browser.navigate',
    'devtools.startSession',
    'devtools.clearSession',
    'browser.navigate',
  ]);
  assert.equal(rpcClient.calls[5].method, 'browser.wait');
  assert.equal(rpcClient.calls[1].params.url, 'about:blank');
  assert.equal(rpcClient.calls[1].params.active, false);
  assert.equal(rpcClient.calls[4].params.url, 'https://example.com/');
  assert.equal(rpcClient.calls[4].params.active, false);
  const activateCall = rpcClient.calls.find((call) => call.method === 'browser.activateTab');
  assert.ok(activateCall);
  assert.equal(activateCall.params.tabId, '88');
});

test('openInstrumentedTab preserves explicit active=true during navigation', async () => {
  const rpcClient = fakeRpcClient();
  await openInstrumentedTab(rpcClient, 'https://example.org/', {
    active: true,
    settleMs: 0,
    networkIdleMs: 1,
    networkIdleTimeoutMs: 50,
  });

  assert.equal(rpcClient.calls[0].params.active, true);
  assert.equal(rpcClient.calls[3].params.active, true);
  assert.ok(!rpcClient.calls.some((call) => call.method === 'browser.activateTab'));
});

test('summarizes captured network, console, API, and JS errors', () => {
  const summary = summarizeCapture({
    url: 'https://example.com/',
    network: {
      requests: [
        { url: 'https://example.com/app.js', type: 'Script', encodedDataLength: 100 },
        { url: 'https://cdn.example.net/lib.js', type: 'Script', response: { status: 200, encodedDataLength: 200 } },
        { url: 'https://example.com/missing.js', type: 'Script', response: { status: 404 } },
      ],
    },
    consoleData: { entries: [{ level: 'warning' }, { level: 'log' }] },
    jsErrors: { errors: [{ text: 'boom' }] },
    apiResponses: { responses: [{ url: 'https://example.com/api', response: { status: 500 } }] },
  });

  assert.equal(summary.requests, 3);
  assert.equal(summary.failedRequests, 1);
  assert.equal(summary.thirdPartyScripts, 1);
  assert.equal(summary.totalTransferBytes, 300);
  assert.equal(summary.consoleIssues, 1);
  assert.equal(summary.jsErrors, 1);
  assert.equal(summary.apiFailures, 1);
});

test('captureOwnedTab shows the tab for the capture and puts the previous tab back', async () => {
  const calls = [];
  const rpcClient = {
    async send(method, params = {}) {
      calls.push([method, params.tabId]);
      if (method === 'browser.getRawContext') return { ok: true, data: { activeTabId: 7 } };
      if (method === 'visual.captureScreenshot') return { ok: false, error: { code: 'CAPTURE_FAILED' } };
      return { ok: true, data: {} };
    },
  };

  const response = await captureOwnedTab(rpcClient, 'visual.captureScreenshot', { tabId: 9 });

  assert.equal(response.ok, false);
  assert.deepEqual(calls.slice(1), [
    ['browser.activateTab', '9'],
    ['visual.captureScreenshot', 9],
    ['browser.activateTab', '7'],
  ]);
});
