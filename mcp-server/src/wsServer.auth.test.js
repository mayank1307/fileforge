import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WebSocket } from 'ws';

const home = mkdtempSync(join(tmpdir(), 'fileforge-bridge-'));
const port = 40000 + Math.floor(Math.random() * 20000);
// os.homedir() reads HOME on POSIX and USERPROFILE on Windows.
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.FILEFORGE_WS_PORT = String(port);

// bridgeAuth resolves ~/.fileforge at import, so it is imported only after HOME points at the temp dir.
let EXTENSION_ORIGIN;
let token;
let wsServer;

function connect(path, headers = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers });
    ws.on('open', () => resolve({ ws, status: 101 }));
    ws.on('unexpected-response', (_req, res) => resolve({ ws, status: res.statusCode }));
    ws.on('error', () => {});
  });
}

function nextMessage(ws) {
  return new Promise((resolve) => ws.once('message', (raw) => resolve(JSON.parse(raw))));
}

before(async () => {
  const { FILEFORGE_EXTENSION_ID } = await import('./bridgeAuth.js');
  EXTENSION_ORIGIN = `chrome-extension://${FILEFORGE_EXTENSION_ID}`;
  ({ wsServer } = await import('./wsServer.js'));
  await new Promise((resolve) => setTimeout(resolve, 200));
  token = readFileSync(join(home, '.fileforge', 'bridge-token'), 'utf8').trim();
});

// wsServer has no close(); exit once the suite is done so the open server doesn't hang the run.
after(() => {
  rmSync(home, { recursive: true, force: true });
  setTimeout(() => process.exit(0), 50).unref();
});

test('token file is created owner-only', () => {
  assert.equal(token.length, 64);
  // Windows has no POSIX mode bits; the file inherits the user profile's ACL there.
  if (process.platform !== 'win32') {
    assert.equal(statSync(join(home, '.fileforge', 'bridge-token')).mode & 0o777, 0o600);
  }
});

test('web page origin cannot connect as extension', async () => {
  const { status } = await connect('/', { Origin: 'https://evil.example' });
  assert.equal(status, 403);
});

test('web page origin cannot connect as peer, even with the token', async () => {
  const { status } = await connect('/?role=mcp-peer', { Origin: 'https://evil.example', 'x-fileforge-token': token });
  assert.equal(status, 403);
});

test('a different extension cannot connect as the extension', async () => {
  const { status } = await connect('/', { Origin: `chrome-extension://${'a'.repeat(32)}` });
  assert.equal(status, 403);
});

test('connection without any origin is not treated as the extension', async () => {
  const { status } = await connect('/');
  assert.equal(status, 403);
});

test('peer without a valid token is rejected', async () => {
  assert.equal((await connect('/?role=mcp-peer')).status, 403);
  assert.equal((await connect('/?role=mcp-peer', { 'x-fileforge-token': 'f'.repeat(64) })).status, 403);
});

test('extension and token-holding peer can talk through the bridge', async () => {
  const ext = await connect('/', { Origin: EXTENSION_ORIGIN });
  assert.equal(ext.status, 101);
  ext.ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.type === 'fileforge-mcp-rpc') ext.ws.send(JSON.stringify({ requestId: msg.requestId, ok: true, data: 'pong' }));
  });

  const peer = await connect('/?role=mcp-peer', { 'x-fileforge-token': token });
  assert.equal(peer.status, 101);
  const reply = nextMessage(peer.ws);
  peer.ws.send(JSON.stringify({
    type: 'fileforge-peer-rpc',
    requestId: 'p1',
    message: { type: 'fileforge-mcp-rpc', requestId: 'r1', method: 'runtime.ping' },
  }));
  const msg = await reply;
  assert.equal(msg.type, 'fileforge-peer-response');
  assert.equal(msg.response.data, 'pong');

  ext.ws.close();
  peer.ws.close();
});

test('extension client cannot use peer-only rpc', async () => {
  const ext = await connect('/', { Origin: EXTENSION_ORIGIN });
  let replied = false;
  ext.ws.on('message', (raw) => { if (JSON.parse(raw).type === 'fileforge-peer-response') replied = true; });
  ext.ws.send(JSON.stringify({ type: 'fileforge-peer-rpc', requestId: 'x', message: {} }));
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(replied, false);
  ext.ws.close();
});


test('extension reports its version with fileforge-hello', async () => {
  const ext = await connect('/', { Origin: EXTENSION_ORIGIN });
  assert.equal(wsServer.extensionVersion, undefined);
  ext.ws.send(JSON.stringify({ type: 'fileforge-hello', extensionVersion: '9.9.9' }));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(wsServer.extensionVersion, '9.9.9');
  ext.ws.close();
});

test('with pairing off, an extension needs no token and is told pairing is off', async () => {
  const ext = await connect('/', { Origin: EXTENSION_ORIGIN });
  const ack = nextMessage(ext.ws);
  ext.ws.send(JSON.stringify({ type: 'fileforge-hello', extensionVersion: '9.9.9' }));
  assert.deepEqual(await ack, { type: 'fileforge-hello-ack', pairing: 'off' });
  ext.ws.close();
});
