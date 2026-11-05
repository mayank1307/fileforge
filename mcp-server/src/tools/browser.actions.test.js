import test from 'node:test';
import assert from 'node:assert/strict';
import { tools } from './browser.js';

function makeRpc(returnValue = { ok: true, data: {} }) {
  const calls = [];
  return {
    calls,
    client: {
      send: async (method, params) => {
        calls.push({ method, params });
        return typeof returnValue === 'function' ? returnValue(method, params) : returnValue;
      },
    },
  };
}

test('wait forwards network idle and settle params to browser.wait RPC', async () => {
  const tool = tools[0];
  const { calls, client } = makeRpc({ ok: true, data: { tabId: 123, status: 'complete' } });

  const result = await tool.handler({
    action: 'wait',
    tabId: '123',
    until: 'idle',
    timeoutMs: 9000,
    idleMs: 750,
    networkIdleMs: 400,
    networkIdleTimeoutMs: 5000,
    settleMs: 250,
  }, { rpcClient: client });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'browser.wait');
  assert.deepEqual(calls[0].params, {
    tabId: '123',
    until: 'idle',
    urlIncludes: undefined,
    timeoutMs: 9000,
    idleMs: 750,
    networkIdleMs: 400,
    networkIdleTimeoutMs: 5000,
    settleMs: 250,
  });
});
