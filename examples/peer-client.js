// Minimal peer client: talks to the running FileForge bridge the same way a second
// MCP server instance does. Run from the repo root, after npm install in mcp-server/:
//   node examples/peer-client.js
import { createRequire } from 'module';
import { peerHeaders } from '../mcp-server/src/bridgeAuth.js';

// ws is installed in mcp-server/node_modules, which Node does not search from this folder.
const WebSocket = createRequire(new URL('../mcp-server/package.json', import.meta.url))('ws');

// Not imported from wsServer.js: importing it starts a bridge of its own.
const WS_PORT = Number(process.env.FILEFORGE_WS_PORT ?? 47821);
const ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}/?role=mcp-peer`, { headers: peerHeaders() });

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'fileforge-peer-rpc',
    requestId: 'example-1',
    message: { type: 'fileforge-mcp-rpc', requestId: 'example-rpc-1', method: 'browser.getActiveTab', params: {} },
  }));
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw);
  if (msg.type !== 'fileforge-peer-response') return;
  console.log(JSON.stringify(msg.error ?? msg.response, null, 2));
  ws.close();
});

ws.on('unexpected-response', (_req, res) => {
  console.error(`Bridge refused the connection (HTTP ${res.statusCode}). Is the token in ~/.fileforge/bridge-token current?`);
  process.exit(1);
});

ws.on('error', (err) => {
  console.error(`Could not reach the bridge: ${err.message}. Is the FileForge MCP server running?`);
  process.exit(1);
});
