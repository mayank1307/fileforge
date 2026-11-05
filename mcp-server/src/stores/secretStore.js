import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const DATA_DIR = join(homedir(), '.fileforge');
const SECRETS_PATH = join(DATA_DIR, 'secrets.json');

let _cache = null;
let _loadedAt = 0;
const RELOAD_MS = 5_000;

function loadFile() {
  try {
    if (!existsSync(SECRETS_PATH)) return {};
    const raw = readFileSync(SECRETS_PATH, 'utf8');
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (err) {
    console.error(`[fileforge] secretStore: failed to read ${SECRETS_PATH}: ${err.message}`);
    return {};
  }
}

function load(force = false) {
  const now = Date.now();
  if (!force && _cache && now - _loadedAt < RELOAD_MS) return _cache;
  _cache = loadFile();
  _loadedAt = now;
  return _cache;
}

export const secretStore = {
  path: SECRETS_PATH,

  has(name) {
    const file = load();
    if (Object.prototype.hasOwnProperty.call(file, name)) return true;
    return Object.prototype.hasOwnProperty.call(process.env, name);
  },

  get(name) {
    const file = load();
    if (Object.prototype.hasOwnProperty.call(file, name)) return String(file[name]);
    if (Object.prototype.hasOwnProperty.call(process.env, name)) return String(process.env[name]);
    return undefined;
  },

  listNames() {
    const file = load();
    return Array.from(new Set([...Object.keys(file), ...Object.keys(process.env)]));
  },

  ensureFile() {
    mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    if (!existsSync(SECRETS_PATH)) {
      writeFileSync(SECRETS_PATH, '{}\n', { mode: 0o600 });
      try { chmodSync(SECRETS_PATH, 0o600); } catch { /* best-effort */ }
    } else {
      try { chmodSync(SECRETS_PATH, 0o600); } catch { /* best-effort */ }
    }
    return SECRETS_PATH;
  },

  refresh() {
    return load(true);
  },
};
