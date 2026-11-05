import { BUILD_ID } from './buildInfo.js';

const WS_URL = 'ws://127.0.0.1:47821';
const RECONNECT_DELAY_MIN_MS = 3_000;
const RECONNECT_DELAY_MAX_MS = 60_000;
let _reconnectDelay = RECONNECT_DELAY_MIN_MS;
const HEARTBEAT_MS = 20_000;
const REQUEST_TIMEOUT_MS = 30_000;
// Servers acknowledge fileforge-hello. One that doesn't is treated as accepting us after this long.
const HELLO_ACK_FALLBACK_MS = 3_000;
// The server closes an unpaired connection with this code when it runs with FILEFORGE_REQUIRE_PAIRING=1.
const PAIRING_CLOSE_CODE = 4001;
export const TOKEN_KEY = 'fileforgeBridgeToken';
export const PAIRING_KEY = 'fileforgePairing';

let _ws = null;
let _heartbeat = null;
let _accepted = false;
let _ackFallback = null;
const _listeners = [];
const _connectListeners = [];
const _disconnectListeners = [];
const _pendingServerRequests = new Map();

function stopHeartbeat() {
  if (_heartbeat) clearInterval(_heartbeat);
  _heartbeat = null;
}

function startHeartbeat() {
  stopHeartbeat();
  _heartbeat = setInterval(() => {
    if (_ws?.readyState === WebSocket.OPEN) {
      _ws.send(JSON.stringify({ type: 'fileforge-heartbeat', ts: Date.now() }));
    }
  }, HEARTBEAT_MS);
}

function scheduleReconnect() {
  setTimeout(connect, _reconnectDelay);
  _reconnectDelay = Math.min(_reconnectDelay * 2, RECONNECT_DELAY_MAX_MS);
}

function resetBackoff() {
  _reconnectDelay = RECONNECT_DELAY_MIN_MS;
}

function setPairing(state) {
  chrome.storage.local.set({ [PAIRING_KEY]: { state, at: new Date().toISOString() } }).catch(() => {});
}

// Connected means the server accepted our hello, not only that the socket opened.
function markAccepted(pairing) {
  if (_accepted || _ws?.readyState !== WebSocket.OPEN) return;
  clearTimeout(_ackFallback);
  _accepted = true;
  // Reset here, not on open, so a server that keeps refusing us is retried with a growing delay.
  resetBackoff();
  if (pairing) setPairing(pairing);
  _connectListeners.forEach((fn) => fn());
  startHeartbeat();
}

function connect() {
  if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) return;

  try {
    _ws = new WebSocket(WS_URL);
  } catch (err) {
    console.warn('[fileforge] WebSocket connect failed:', err.message);
    scheduleReconnect();
    return;
  }

  _ws.addEventListener('open', async () => {
    console.log('[fileforge] connected to MCP server bridge');
    // The token is only checked when the server requires pairing; see SECURITY.md.
    const { [TOKEN_KEY]: token } = await chrome.storage.local.get(TOKEN_KEY).catch(() => ({}));
    if (_ws?.readyState !== WebSocket.OPEN) return;
    // Lets the server warn when this extension and the server are on different versions, or Chrome runs stale code.
    _ws.send(JSON.stringify({
      type: 'fileforge-hello',
      extensionVersion: chrome.runtime.getManifest().version,
      buildId: BUILD_ID,
      ...(token ? { token } : {}),
    }));
    _ackFallback = setTimeout(() => markAccepted(null), HELLO_ACK_FALLBACK_MS);
  });

  _ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'fileforge-hello-ack') {
        markAccepted(msg.pairing);
        return;
      }
      if (msg.type === 'fileforge-pairing-required') {
        clearTimeout(_ackFallback);
        setPairing('required');
        return;
      }
      if (msg.type === 'fileforge-extension-tool-response') {
        const pending = _pendingServerRequests.get(msg.requestId);
        if (!pending) return;
        clearTimeout(pending.timeout);
        _pendingServerRequests.delete(msg.requestId);
        pending.resolve(msg.response);
        return;
      }
      _listeners.forEach((fn) => fn(msg));
    } catch (_) {}
  });

  _ws.addEventListener('close', (event) => {
    clearTimeout(_ackFallback);
    stopHeartbeat();
    const wasAccepted = _accepted;
    _accepted = false;
    _ws = null;
    if (event.code === PAIRING_CLOSE_CODE) setPairing('required');
    if (wasAccepted || event.code === PAIRING_CLOSE_CODE) _disconnectListeners.forEach((fn) => fn());
    scheduleReconnect();
  });

  _ws.addEventListener('error', () => {
    // reconnect handled by 'close'
  });
}

export const mcpBridge = {
  connect,

  send(message) {
    // Not gated on the ack: with pairing off the server can send an RPC before it has read our hello.
    if (_ws?.readyState === WebSocket.OPEN) {
      _ws.send(JSON.stringify(message));
    } else {
      console.warn('[fileforge] cannot send — not connected to MCP server');
    }
  },

  requestServerTool(tool, params = {}) {
    return new Promise((resolve, reject) => {
      if (!_accepted || _ws?.readyState !== WebSocket.OPEN) {
        reject(new Error('MCP bridge is not connected.'));
        return;
      }

      const requestId = Math.random().toString(36).slice(2);
      const timeout = setTimeout(() => {
        _pendingServerRequests.delete(requestId);
        reject(new Error('Server tool request timed out (30s)'));
      }, REQUEST_TIMEOUT_MS);

      _pendingServerRequests.set(requestId, { resolve, reject, timeout });
      _ws.send(JSON.stringify({
        type: 'fileforge-extension-tool-call',
        requestId,
        tool,
        params,
      }));
    });
  },

  onMessage(fn) {
    _listeners.push(fn);
  },

  onConnect(fn) {
    _connectListeners.push(fn);
  },

  onDisconnect(fn) {
    _disconnectListeners.push(fn);
  },

  // Reconnect now, e.g. after the side panel saves a new bridge token.
  reconnect() {
    resetBackoff();
    if (_ws) _ws.close();
    else connect();
  },

  get connected() {
    return _accepted && _ws?.readyState === WebSocket.OPEN;
  },
};

connect();
