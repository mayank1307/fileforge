#!/usr/bin/env node
// Must stay the first import: it exits with a fix if better-sqlite3 was built for another Node.
import './startupCheck.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { toMcpToolResult } from './utils/toolResponse.js';
import { registry } from './registry.js';
import { rpcClient } from './rpcClient.js';
import { wsServer, WS_PORT } from './wsServer.js';
import { capabilityCatalog } from './planner/capabilityCatalog.js';
import { runQueue } from './queue/runQueue.js';
import { cronScheduler } from './schedulers/cronScheduler.js';
import { secretStore } from './stores/secretStore.js';
import { SERVER_VERSION } from './version.js';
import { buildSourceBlock } from './utils/sourceBlock.js';

// Register all tool modules
import './toolModules.js';

const STDIN_CLOSED_EXIT_MS = 500;

const server = new Server(
  { name: 'fileforge', version: SERVER_VERSION },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: registry.listTools(),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: params } = request.params;
  const callTimestamp = new Date().toISOString();

  // Best-effort: grab active tab context before the call so we know the
  // browser state at invocation time. This is a fast Chrome API round-trip
  // and is silently skipped if the bridge is down.
  let activeTab = null;
  try {
    const tabResponse = await rpcClient.send('browser.getActiveTab', {});
    const d = tabResponse?.data ?? tabResponse;
    if (d && !d.error) activeTab = d;
  } catch { /* bridge may not be connected — that's fine */ }

  const result = await registry.call(name, params ?? {}, { rpcClient });

  result._source = buildSourceBlock({ tool: name, timestamp: callTimestamp, params, result, activeTab });

  return toMcpToolResult(result);
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[fileforge] MCP server ready — extension bridge on ws://127.0.0.1:${WS_PORT}`);

// A client that quits doesn't always kill us, and the open bridge would keep this process alive and holding
// the port, so an updated server could never take over. The short wait lets replies already written reach the pipe.
let exiting = false;
function exitWithClient() {
  if (exiting) return;
  exiting = true;
  console.error('[fileforge] MCP client closed stdin; exiting');
  setTimeout(() => process.exit(0), STDIN_CLOSED_EXIT_MS);
}
process.stdin.once('end', exitWithClient);
process.stdin.once('close', exitWithClient);

wsServer.setExtensionRequestHandler(async ({ tool, params }) => {
  return registry.call(tool, params ?? {}, { rpcClient });
});

// Build capability catalog after all tool modules have registered.
capabilityCatalog.refresh();

// Ensure secrets.json exists with safe permissions (best-effort).
try { secretStore.ensureFile(); } catch { /* non-fatal */ }

// Configure the routine queue with the registry that wraps every tool call,
// then start the cron scheduler.
const routineRegistryAdapter = {
  call: (name, params) => registry.call(name, params ?? {}, { rpcClient }),
};
runQueue.configure({ registry: routineRegistryAdapter });
cronScheduler.start();

// Startup health check — surface infra problems immediately rather than at first tool call.
setTimeout(async () => {
  // 1. Verify WebSocket server bound successfully.
  if (wsServer.mode === 'peer') {
    console.error('[fileforge] ✓ Forwarding extension RPC through existing bridge owner');
  } else if (wsServer.connectedCount === 0) {
    console.error('[fileforge] ⚠️  No extension connected yet. Open Chrome with the FileForge extension loaded.');
  }

  // 2. Verify SQLite stores are writable.
  try {
    const { resultStore } = await import('./stores/resultStore.js');
    resultStore.list({ limit: 1 });
    console.error('[fileforge] ✓ SQLite result store OK');
  } catch (err) {
    console.error('[fileforge] ✗ SQLite result store FAILED:', err.message);
  }
}, 2000);
