import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WebSocket } from 'ws';

const home = mkdtempSync(join(tmpdir(), 'fileforge-pairing-'));
const port = 40000 + Math.floor(Math.random() * 20000);
// os.homedir() reads HOME on POSIX and USERPROFILE on Windows.
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.FILEFORGE_WS_PORT = String(port);
// wsServer reads this at import, so pairing gets its own test file: each file runs in its own process.
process.env.FILEFORGE_REQUIRE_PAIRING = '1';

let EXTENSION_ORIGIN;
let PAIRING_CLOSE_CODE;
let token;

// Starts recording messages before the socket opens, so a reply can't arrive unseen.
function connect(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers });
    const messages = [];
    const closed = new Promise((done) => ws.on('close', (code) => done(code)));
    ws.on('message', (raw) => messages.push(JSON.parse(raw)));
    ws.on('open', () => resolve({ ws, messages, closed }));
    ws.on('error', reject);
  });
}

const connectExtension = () => connect('/', { Origin: EXTENSION_ORIGIN });
const connectPeer = () => connect('/?role=mcp-peer', { 'x-fileforge-token': token });

function send(client, message) {
  client.ws.send(JSON.stringify(message));
}

async function waitForMessage(client, type) {
  for (let i = 0; i < 100; i += 1) {
    const found = client.messages.find((msg) => msg.type === type);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`no ${type} message; got ${JSON.stringify(client.messages)}`);
}

// Sends an RPC through the owner as a peer and returns the reply.
async function askThroughPeer(requestId) {
  const peer = await connectPeer();
  send(peer, {
    type: 'fileforge-peer-rpc',
    requestId,
    message: { type: 'fileforge-mcp-rpc', requestId: `${requestId}-rpc`, method: 'runtime.ping' },
  });
  const reply = await waitForMessage(peer, 'fileforge-peer-response');
  peer.ws.close();
  return reply;
}

before(async () => {
  const { FILEFORGE_EXTENSION_ID } = await import('./bridgeAuth.js');
  EXTENSION_ORIGIN = `chrome-extension://${FILEFORGE_EXTENSION_ID}`;
  ({ PAIRING_CLOSE_CODE } = await import('./wsServer.js'));
  await new Promise((resolve) => setTimeout(resolve, 200));
  token = readFileSync(join(home, '.fileforge', 'bridge-token'), 'utf8').trim();
});

// wsServer has no close(); exit once the suite is done so the open server doesn't hang the run.
after(() => {
  rmSync(home, { recursive: true, force: true });
  setTimeout(() => process.exit(0), 50).unref();
});

// Runs first: every rejection below switches "no extension" errors to the pairing explanation.
test('before any rejection, a missing extension gets the usual error', async () => {
  const reply = await askThroughPeer('p-none');
  assert.match(reply.error, /^No extension connected/);
});

test('an extension that presents the token is acknowledged and receives RPCs', async () => {
  const ext = await connectExtension();
  send(ext, { type: 'fileforge-hello', extensionVersion: '9.9.9', token });
  const ack = await waitForMessage(ext, 'fileforge-hello-ack');
  assert.equal(ack.pairing, 'paired');

  ext.ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.type === 'fileforge-mcp-rpc') ext.ws.send(JSON.stringify({ requestId: msg.requestId, ok: true, data: 'pong' }));
  });
  const reply = await askThroughPeer('p-paired');
  assert.equal(reply.response.data, 'pong');

  ext.ws.close();
  await ext.closed;
});

for (const [name, hello] of [
  ['no token', {}],
  ['a wrong token', { token: 'f'.repeat(64) }],
  ['a token of the wrong length', { token: 'abc' }],
  ['a token that is not a string', { token: { length: 64 } }],
]) {
  test(`an extension with ${name} is told to pair and closed with 4001`, async () => {
    const ext = await connectExtension();
    send(ext, { type: 'fileforge-hello', ...hello });
    assert.equal(await ext.closed, PAIRING_CLOSE_CODE);
    assert.ok(ext.messages.some((msg) => msg.type === 'fileforge-pairing-required'));
    assert.ok(!ext.messages.some((msg) => msg.type === 'fileforge-hello-ack'));
  });
}

test('a rejected extension gets no RPCs, and peers are told why', async () => {
  const ext = await connectExtension();
  send(ext, { type: 'fileforge-hello' });
  await ext.closed;

  const reply = await askThroughPeer('p-rejected');
  assert.match(reply.error, /^PAIRING_REQUIRED: /);
  assert.ok(!ext.messages.some((msg) => msg.type === 'fileforge-mcp-rpc'));
});

test('an extension is not given RPCs before its hello', async () => {
  const ext = await connectExtension();
  const reply = await askThroughPeer('p-early');
  assert.match(reply.error, /^PAIRING_REQUIRED: /);
  assert.ok(!ext.messages.some((msg) => msg.type === 'fileforge-mcp-rpc'));
  ext.ws.close();
  await ext.closed;
});

test('an unpaired connection is ignored until it says hello', async () => {
  const ext = await connectExtension();
  send(ext, { type: 'fileforge-heartbeat', ts: 1 });
  send(ext, { type: 'fileforge-extension-tool-call', requestId: 'x', tool: 'fileforge_runtime_ping' });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.deepEqual(ext.messages, []);
  ext.ws.close();
  await ext.closed;
});

test('an extension that never says hello is closed with 4001', async () => {
  const ext = await connectExtension();
  assert.equal(await ext.closed, PAIRING_CLOSE_CODE);
});

test('a peer needs no hello', async () => {
  const peer = await connectPeer();
  send(peer, { type: 'fileforge-heartbeat', ts: 1 });
  await waitForMessage(peer, 'fileforge-heartbeat-ack');
  peer.ws.close();
  await peer.closed;
});
