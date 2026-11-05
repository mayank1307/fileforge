import test from 'node:test';
import assert from 'node:assert/strict';
import { tools } from './runtime.js';
import { EXPECTED_BUILD_ID } from '../extensionBuild.js';
import { SERVER_VERSION } from '../version.js';

async function status(data) {
  const rpcClient = { send: async () => ({ ok: true, data }) };
  return tools[0].handler({ action: 'status' }, { rpcClient });
}

test('status reports matching versions and builds', async () => {
  const result = await status({ version: SERVER_VERSION, buildId: EXPECTED_BUILD_ID, status: 'connected' });
  assert.equal(result.summary.versionsMatch, true);
  assert.equal(result.summary.buildsMatch, true);
  assert.deepEqual(result.warnings, []);
});

test('status warns when Chrome runs older extension code with the same version', async () => {
  const result = await status({ version: SERVER_VERSION, buildId: '000000000000', status: 'connected' });
  assert.equal(result.summary.versionsMatch, true);
  assert.equal(result.summary.buildsMatch, false);
  assert.match(result.warnings[0], /reload icon/);
});

test('status gives only the version warning when versions differ', async () => {
  const result = await status({ version: '0.0.1', buildId: '000000000000', status: 'connected' });
  assert.equal(result.summary.buildsMatch, false);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /does not match server/);
});

test('status explains an unpaired extension with PAIRING_REQUIRED', async () => {
  const rpcClient = { send: async () => { throw new Error('PAIRING_REQUIRED: Run fileforge-pair.'); } };
  const result = await tools[0].handler({ action: 'status' }, { rpcClient });
  assert.deepEqual(result.error, { code: 'PAIRING_REQUIRED', message: 'Run fileforge-pair.' });
});

test('status reports other bridge failures as BRIDGE_UNAVAILABLE', async () => {
  const rpcClient = { send: async () => { throw new Error('No extension connected.'); } };
  const result = await tools[0].handler({ action: 'status' }, { rpcClient });
  assert.equal(result.error.code, 'BRIDGE_UNAVAILABLE');
});
