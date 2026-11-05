import { WebSocket, WebSocketServer } from 'ws';
import { PAIRING_HELP, PAIRING_REQUIRED_CODE, bridgeToken, classifyConnection, pairingRequired, peerHeaders, tokenMatches } from './bridgeAuth.js';
import { extensionVersionWarning } from './version.js';
import { extensionBuildWarning } from './extensionBuild.js';

export const WS_PORT = Number(process.env.FILEFORGE_WS_PORT ?? 47821);
const WS_HOST = '127.0.0.1';
const PEER_URL = `ws://${WS_HOST}:${WS_PORT}/?role=mcp-peer`;
const EXTENSION_TIMEOUT_MS = 30_000;
const PEER_CONNECT_TIMEOUT_MS = 5_000;
// Extensions older than 0.2.0 never send fileforge-hello; give a new one this long before warning.
const HELLO_TIMEOUT_MS = 5_000;
// With pairing on, an extension connection is closed with this code when it doesn't present the token.
export const PAIRING_CLOSE_CODE = 4001;
// How long after rejecting an unpaired extension "no extension connected" errors explain pairing instead.
const PAIRING_HINT_MS = 10 * 60_000;
const REQUIRE_PAIRING = pairingRequired();

const _extensionClients = new Set();
const _pending = new Map();
const _peerPending = new Map();

// Track insertion order so the most-recently-connected client is preferred.
let _latestExtensionClient = null;
let _mode = 'starting';
let _wss = null;
let _peer = null;
let _peerConnectPromise = null;
let _retryTimer = null;
let _startupResolve = null;
let _startupPromise = new Promise((resolve) => {
  _startupResolve = resolve;
});
let _extensionRequestHandler = null;
let _lastPairingRejection = 0;

function ready(ws) {
  return ws?.readyState === WebSocket.OPEN;
}

function clearRetry() {
  if (_retryTimer) clearTimeout(_retryTimer);
  _retryTimer = null;
}

function scheduleOwnerRetry(retryMs = 3000) {
  if (_retryTimer) return;
  _retryTimer = setTimeout(() => {
    _retryTimer = null;
    startWss(retryMs);
  }, retryMs);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resetStartupWait() {
  _startupPromise = new Promise((resolve) => {
    _startupResolve = resolve;
  });
}

function markStartupReady() {
  _startupResolve?.();
}

function rejectPeerPending(error) {
  for (const [requestId, pending] of _peerPending) {
    clearTimeout(pending.timeout);
    pending.reject(error);
    _peerPending.delete(requestId);
  }
}

function sendToExtension(message) {
  return new Promise((resolve, reject) => {
    const client = ready(_latestExtensionClient)
      ? _latestExtensionClient
      : [..._extensionClients].find((c) => ready(c));

    if (!client) {
      if (Date.now() - _lastPairingRejection < PAIRING_HINT_MS) return reject(new Error(`${PAIRING_REQUIRED_CODE}: ${PAIRING_HELP}`));
      return reject(new Error('No extension connected. Open Chrome with the FileForge extension loaded.'));
    }

    const timeout = setTimeout(() => {
      _pending.delete(message.requestId);
      reject(new Error('Extension response timeout (30s)'));
    }, EXTENSION_TIMEOUT_MS);

    _pending.set(message.requestId, (response) => {
      clearTimeout(timeout);
      resolve(response);
    });

    client.send(JSON.stringify(message));
  });
}

function attachExtensionClient(ws) {
  _extensionClients.add(ws);
  _latestExtensionClient = ws;
  console.error(`[fileforge] extension connected (${_extensionClients.size} client(s))`);

  const helloTimer = setTimeout(() => {
    if (ready(ws) && ws.fileforgeVersion === undefined) console.error(`[fileforge] ⚠️  ${extensionVersionWarning(undefined)}`);
  }, HELLO_TIMEOUT_MS);
  helloTimer.unref?.();

  ws.on('close', () => {
    clearTimeout(helloTimer);
    _extensionClients.delete(ws);
    if (_latestExtensionClient === ws) _latestExtensionClient = [..._extensionClients].at(-1) ?? null;
    console.error(`[fileforge] extension disconnected (${_extensionClients.size} client(s))`);
  });
}

function rejectUnpaired(ws, reason) {
  _lastPairingRejection = Date.now();
  console.error(`[fileforge] ⚠️  extension not paired (${reason}). ${PAIRING_HELP}`);
  if (ready(ws)) ws.send(JSON.stringify({ type: 'fileforge-pairing-required', message: PAIRING_HELP }));
  ws.close(PAIRING_CLOSE_CODE, 'pairing required');
}

function attachHandlers(wss) {
  wss.on('connection', (ws, request) => {
    const isPeer = request.fileforgeRole === 'peer';

    // With pairing on, an extension only counts once its fileforge-hello carries the bridge token.
    let pairingTimer = null;
    if (!isPeer && !REQUIRE_PAIRING) attachExtensionClient(ws);
    if (!isPeer && REQUIRE_PAIRING) {
      pairingTimer = setTimeout(() => rejectUnpaired(ws, 'no fileforge-hello'), HELLO_TIMEOUT_MS);
      pairingTimer.unref?.();
      ws.on('close', () => clearTimeout(pairingTimer));
    }

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw);

        // An unpaired extension connection may only say hello: no tool calls, no RPC responses.
        if (!isPeer && !_extensionClients.has(ws) && msg.type !== 'fileforge-hello') return;

        if (msg.type === 'fileforge-peer-rpc') {
          if (!isPeer) return;
          try {
            const response = await sendToExtension(msg.message);
            ws.send(JSON.stringify({ type: 'fileforge-peer-response', requestId: msg.requestId, response }));
          } catch (err) {
            ws.send(JSON.stringify({
              type: 'fileforge-peer-response',
              requestId: msg.requestId,
              error: err.message,
            }));
          }
          return;
        }

        if (msg.type === 'fileforge-extension-tool-call') {
          if (isPeer) return;
          if (!_extensionRequestHandler) {
            ws.send(JSON.stringify({
              type: 'fileforge-extension-tool-response',
              requestId: msg.requestId,
              response: {
                ok: false,
                error: { code: 'NO_EXTENSION_REQUEST_HANDLER', message: 'No extension request handler registered.' },
              },
            }));
            return;
          }

          try {
            const response = await _extensionRequestHandler({
              tool: msg.tool,
              params: msg.params ?? {},
              requestId: msg.requestId,
            });
            ws.send(JSON.stringify({
              type: 'fileforge-extension-tool-response',
              requestId: msg.requestId,
              response,
            }));
          } catch (err) {
            ws.send(JSON.stringify({
              type: 'fileforge-extension-tool-response',
              requestId: msg.requestId,
              response: {
                ok: false,
                error: { code: 'EXTENSION_REQUEST_FAILED', message: err?.message ?? String(err) },
                meta: { tool: msg.tool },
              },
            }));
          }
          return;
        }

        if (msg.type === 'fileforge-hello') {
          if (isPeer) return;
          if (REQUIRE_PAIRING && !_extensionClients.has(ws)) {
            clearTimeout(pairingTimer);
            if (!tokenMatches(msg.token)) return rejectUnpaired(ws, msg.token ? 'wrong token' : 'no token');
            attachExtensionClient(ws);
          }
          ws.send(JSON.stringify({ type: 'fileforge-hello-ack', pairing: REQUIRE_PAIRING ? 'paired' : 'off' }));
          ws.fileforgeVersion = msg.extensionVersion ?? null;
          ws.fileforgeBuild = msg.buildId ?? null;
          const warning = extensionVersionWarning(ws.fileforgeVersion) ?? extensionBuildWarning(ws.fileforgeBuild);
          if (warning) console.error(`[fileforge] ⚠️  ${warning}`);
          else console.error(`[fileforge] extension ${ws.fileforgeVersion} matches server version`);
          return;
        }

        // Echo heartbeats back so the extension knows the server is alive.
        if (msg.type === 'fileforge-heartbeat') {
          ws.send(JSON.stringify({ type: 'fileforge-heartbeat-ack', ts: Date.now() }));
          return;
        }

        const resolve = !isPeer && _pending.get(msg.requestId);
        if (resolve) {
          _pending.delete(msg.requestId);
          resolve(msg);
        }
      } catch (_) {}
    });
  });
}

// Reject web pages (and anything else that is neither the extension nor a token-holding peer)
// at the handshake: any site open in Chrome can reach ws://127.0.0.1.
function verifyClient(info, done) {
  const result = classifyConnection(info.req);
  if (!result.role) {
    console.error(`[fileforge] rejected bridge connection: ${result.reason}`);
    return done(false, 403, 'Forbidden');
  }
  info.req.fileforgeRole = result.role;
  done(true);
}

function startWss(retryMs = 3000) {
  if (_wss) return;

  bridgeToken();
  const wss = new WebSocketServer({ port: WS_PORT, host: WS_HOST, verifyClient });
  _wss = wss;
  attachHandlers(wss);

  wss.on('listening', () => {
    _mode = 'owner';
    markStartupReady();
    clearRetry();
    console.error(`[fileforge] extension bridge listening on ws://${WS_HOST}:${WS_PORT}`);
  });

  wss.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      _mode = 'peer';
      markStartupReady();
      _wss = null;
      wss.close();
      console.error(`[fileforge] extension bridge already owned on port ${WS_PORT}; forwarding through it`);
      ensurePeerConnection().catch((peerErr) => {
        console.error('[fileforge] peer bridge connection failed:', peerErr.message);
        scheduleOwnerRetry(retryMs);
      });
    } else {
      console.error('[fileforge] WS server error:', err.message);
    }
  });

  wss.on('close', () => {
    if (_wss === wss) _wss = null;
    if (_mode === 'owner') {
      _mode = 'starting';
      resetStartupWait();
      scheduleOwnerRetry(retryMs);
    }
  });
}

async function ensurePeerConnection() {
  if (ready(_peer)) return _peer;
  if (_peerConnectPromise) return _peerConnectPromise;

  _peerConnectPromise = new Promise((resolve, reject) => {
    const ws = new WebSocket(PEER_URL, { headers: peerHeaders() });
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`Timed out connecting to existing bridge on ${PEER_URL}`));
    }, PEER_CONNECT_TIMEOUT_MS);

    ws.on('open', () => {
      clearTimeout(timeout);
      _peer = ws;
      _mode = 'peer';
      resolve(ws);
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type !== 'fileforge-peer-response') return;

        const pending = _peerPending.get(msg.requestId);
        if (!pending) return;

        _peerPending.delete(msg.requestId);
        clearTimeout(pending.timeout);
        if (msg.error) {
          pending.reject(new Error(msg.error));
        } else {
          pending.resolve(msg.response);
        }
      } catch (_) {}
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on('close', () => {
      if (_peer === ws) _peer = null;
      rejectPeerPending(new Error('Bridge owner connection closed'));
      if (_mode === 'peer') {
        _mode = 'starting';
        resetStartupWait();
        scheduleOwnerRetry();
      }
    });
  }).finally(() => {
    _peerConnectPromise = null;
  });

  return _peerConnectPromise;
}

async function sendViaPeer(message) {
  const peer = await ensurePeerConnection();
  const peerRequestId = Math.random().toString(36).slice(2);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      _peerPending.delete(peerRequestId);
      reject(new Error('Bridge owner response timeout (30s)'));
    }, EXTENSION_TIMEOUT_MS);

    _peerPending.set(peerRequestId, { resolve, reject, timeout });
    peer.send(JSON.stringify({ type: 'fileforge-peer-rpc', requestId: peerRequestId, message }));
  });
}

startWss();

export const wsServer = {
  port: WS_PORT,

  async send(message) {
    if (_mode === 'starting') {
      await Promise.race([_startupPromise, wait(250)]);
    }
    if (_mode === 'owner') return sendToExtension(message);
    return sendViaPeer(message);
  },

  get connectedCount() {
    return _extensionClients.size;
  },

  // Version the most recent extension reported in fileforge-hello (undefined until it does; owner mode only).
  get extensionVersion() {
    return _latestExtensionClient?.fileforgeVersion;
  },

  get mode() {
    return _mode;
  },

  setExtensionRequestHandler(handler) {
    _extensionRequestHandler = handler;
  },
};
