import { randomBytes, timingSafeEqual } from 'crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const DATA_DIR = join(homedir(), '.fileforge');
const TOKEN_PATH = join(DATA_DIR, 'bridge-token');
export const TOKEN_HEADER = 'x-fileforge-token';

// The `key` in extension/manifest.json pins the extension ID, so the bridge accepts only FileForge by default.
// FILEFORGE_EXTENSION_IDS (comma-separated) replaces the allowlist, e.g. for a fork built with its own key.
export const FILEFORGE_EXTENSION_ID = 'nlcebipkdgecilmgfpobamljieanadpn';

export function allowedExtensionIds(env = process.env) {
  const ids = (env.FILEFORGE_EXTENSION_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length ? ids : [FILEFORGE_EXTENSION_ID];
}

const ALLOWED_EXTENSION_IDS = allowedExtensionIds();

// Opt-in for shared machines: FILEFORGE_REQUIRE_PAIRING=1 makes the extension prove it holds the bridge
// token, since any local process can send an extension Origin header. Any other value leaves it off.
export function pairingRequired(env = process.env) {
  return env.FILEFORGE_REQUIRE_PAIRING === '1';
}

export const PAIRING_REQUIRED_CODE = 'PAIRING_REQUIRED';
export const PAIRING_HELP =
  'The bridge requires pairing (FILEFORGE_REQUIRE_PAIRING=1) and the extension has not presented the bridge token. ' +
  'Run fileforge-pair (or npm run pair in mcp-server/), paste the token into the side panel\'s Settings tab and click Save.';

let _token = null;

// Shared secret for MCP peers (other server instances, local scripts). Browsers cannot
// set custom WebSocket headers, so web pages can never present it.
export function bridgeToken() {
  if (_token) return _token;
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  // mkdirSync leaves an existing folder alone, so tighten one made by an older version (0755).
  if (process.platform !== 'win32') {
    try { chmodSync(DATA_DIR, 0o700); } catch { /* best-effort */ }
  }
  try {
    writeFileSync(TOKEN_PATH, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
  _token = readFileSync(TOKEN_PATH, 'utf8').trim();
  return _token;
}

export function peerHeaders() {
  return { [TOKEN_HEADER]: bridgeToken() };
}

export function tokenMatches(presented) {
  if (typeof presented !== 'string') return false;
  const expected = Buffer.from(bridgeToken());
  const actual = Buffer.from(presented);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function extensionIdFromOrigin(origin) {
  const match = /^chrome-extension:\/\/([a-p]{32})$/.exec(origin ?? '');
  return match?.[1] ?? null;
}

// Decides who a handshake is. Returns { role: 'extension' | 'peer' } or { reason } to reject.
export function classifyConnection(req) {
  const origin = req.headers.origin;
  const role = new URL(req.url ?? '/', 'ws://localhost').searchParams.get('role');

  if (role === 'mcp-peer') {
    // Peers are local Node processes: no Origin header, valid token.
    if (origin) return { reason: `peer connection from browser origin ${origin}` };
    if (!tokenMatches(req.headers[TOKEN_HEADER])) return { reason: 'peer connection with missing or invalid token' };
    return { role: 'peer' };
  }

  const extensionId = extensionIdFromOrigin(origin);
  if (!extensionId) return { reason: `extension connection from non-extension origin ${origin ?? '(none)'}` };
  if (!ALLOWED_EXTENSION_IDS.includes(extensionId)) {
    return { reason: `extension ${extensionId} is not an allowed FileForge extension ID (set FILEFORGE_EXTENSION_IDS to override)` };
  }
  return { role: 'extension', extensionId };
}
