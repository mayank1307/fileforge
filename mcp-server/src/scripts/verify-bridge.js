#!/usr/bin/env node
// Checks a local install: Node version, dependencies, better-sqlite3, and, if a FileForge
// MCP server is running, whether the Chrome extension is connected to its bridge.
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import { peerHeaders } from '../bridgeAuth.js';
import { nativeModuleHelp } from '../nativeCheck.js';
import { SERVER_VERSION, extensionVersionWarning } from '../version.js';
import { EXTENSION_DIR, extensionBuildWarning } from '../extensionBuild.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = resolve(__dirname, '..', 'index.js');
const WS_PORT = Number(process.env.FILEFORGE_WS_PORT ?? 47821);

let ok = true;

console.log(`FileForge Bridge Verifier (server ${SERVER_VERSION})\n`);

// 1. Node.js version
const nodeVersion = process.versions.node;
const [major] = nodeVersion.split('.').map(Number);
if (major >= 20) {
  console.log(`[✓] Node.js ${nodeVersion}`);
} else {
  console.log(`[✗] Node.js ${nodeVersion} — requires >=20`);
  ok = false;
}

// 2. Dependencies installed
const nodeModulesPath = resolve(__dirname, '..', '..', 'node_modules');
if (existsSync(nodeModulesPath)) {
  console.log('[✓] node_modules present');
} else {
  console.log('[✗] node_modules missing. Run: npm install');
  ok = false;
}

// 3. better-sqlite3 built for this Node
try {
  const { default: Database } = await import('better-sqlite3');
  new Database(':memory:').close();
  console.log('[✓] better-sqlite3 loads');
} catch (err) {
  console.log(`[✗] better-sqlite3 failed to load\n${nativeModuleHelp(err) ?? err.message}`);
  ok = false;
}

// 4. Running bridge and extension, asked through the bridge the same way a second server would.
function askBridge(method) {
  return new Promise((resolveAsk) => {
    const ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}/?role=mcp-peer`, { headers: peerHeaders() });
    const done = (result) => { ws.terminate(); resolveAsk(result); };
    const timer = setTimeout(() => done({ error: 'timed out' }), 5_000);
    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'fileforge-peer-rpc',
        requestId: 'verify',
        message: { type: 'fileforge-mcp-rpc', requestId: 'verify-rpc', method, params: {} },
      }));
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.type !== 'fileforge-peer-response') return;
      clearTimeout(timer);
      done(msg.error ? { error: msg.error } : { response: msg.response });
    });
    ws.on('unexpected-response', (_req, res) => { clearTimeout(timer); done({ refused: res.statusCode }); });
    ws.on('error', (err) => { clearTimeout(timer); done({ unreachable: err.message }); });
  });
}

const status = await askBridge('runtime.status');
if (status.unreachable) {
  console.log(`[–] No bridge on ws://127.0.0.1:${WS_PORT}. Start your MCP client (or npm start) to check the extension connection.`);
  console.log(`    The extension to load unpacked at chrome://extensions is ${EXTENSION_DIR}`);
} else if (status.refused) {
  console.log(`[✗] Bridge refused this check (HTTP ${status.refused}). Is ~/.fileforge/bridge-token readable?`);
  ok = false;
} else if (String(status.error ?? '').startsWith('PAIRING_REQUIRED: ')) {
  console.log('[✗] The bridge requires pairing (FILEFORGE_REQUIRE_PAIRING=1) and the extension is not paired.');
  console.log('    Run fileforge-pair (or npm run pair), paste the token into the side panel\'s Settings tab and click Save.');
  ok = false;
} else if (status.error) {
  console.log(`[✗] Bridge is up, but the extension did not answer: ${status.error}`);
  console.log(`    Load ${EXTENSION_DIR} unpacked at chrome://extensions and make sure it is enabled.`);
  ok = false;
} else {
  const data = status.response?.data ?? status.response;
  console.log(`[✓] Extension ${data?.extensionId} connected`);
  const warning = extensionVersionWarning(data?.version);
  if (warning) {
    console.log(`[!] ${warning}`);
    ok = false;
  } else {
    console.log(`[✓] Extension version ${data?.version} matches the server`);
    const buildWarning = extensionBuildWarning(data?.buildId);
    if (buildWarning) {
      console.log(`[!] ${buildWarning}`);
      ok = false;
    } else {
      console.log('[✓] Chrome is running the extension code on disk');
    }
  }
}

console.log('');
if (ok) {
  console.log('Bridge looks good. Add to Claude config:');
  console.log(`  claude mcp add fileforge -- node ${SERVER_ENTRY}`);
} else {
  console.log('Fix the issues above, then re-run this script.');
  process.exitCode = 1;
}
