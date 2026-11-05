import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWatchTargets, tools } from './eye.js';

function makeRpc() {
  const calls = [];
  return { client: { send: async (method, params) => { calls.push({ method, params }); return { ok: true }; } }, calls };
}

async function startWatch(params) {
  const { client, calls } = makeRpc();
  const result = await tools[0].handler({ action: 'start_watch', ...params }, { rpcClient: client });
  return { result, calls };
}

test('resolveWatchTargets requires tabs or all: true', () => {
  assert.equal(resolveWatchTargets({}), null);
  assert.equal(resolveWatchTargets({ tabs: [] }), null);
  assert.equal(resolveWatchTargets({ all: 'true' }), null);
  assert.deepEqual(resolveWatchTargets({ tabs: [3, 4] }), { tabs: [3, 4] });
  assert.deepEqual(resolveWatchTargets({ all: true }), { all: true });
  assert.deepEqual(resolveWatchTargets({ tabs: [3], all: true }), { tabs: [3] });
});

test('start_watch with no targets does not reach the extension', async () => {
  const { result, calls } = await startWatch({});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'WATCH_TARGET_REQUIRED');
  assert.equal(calls.length, 0);
});

test('start_watch forwards only the explicit targets', async () => {
  const tabs = await startWatch({ tabs: [7] });
  assert.equal(tabs.result.ok, true);
  assert.deepEqual(tabs.calls, [{ method: 'eye.startWatch', params: { tabs: [7] } }]);

  const all = await startWatch({ all: true });
  assert.deepEqual(all.calls, [{ method: 'eye.startWatch', params: { all: true } }]);
});
