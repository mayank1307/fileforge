// Logic behind `fileforge-setup`. It imports no stores or native modules, so it still works when
// better-sqlite3 was built for another Node, and it never opens the bridge port.
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export const SERVER_NAME = 'fileforge';
export const CLI_CLIENTS = ['claude-code', 'codex'];
export const JSON_CLIENTS = ['cursor', 'claude-desktop'];
export const CLIENTS = [...CLI_CLIENTS, ...JSON_CLIENTS];

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

export function serverEntryPath(srcDir = SRC_DIR) {
  return join(srcDir, 'index.js');
}

// The npm package holds extension/ next to src/; a clone holds it one level above mcp-server/.
export function findExtensionDir(srcDir = SRC_DIR) {
  const candidates = [join(srcDir, '..', 'extension'), join(srcDir, '..', '..', 'extension')];
  return candidates.find((dir) => existsSync(join(dir, 'manifest.json'))) ?? null;
}

// npx unpacks into a cache that npm can clear, which would pull the extension out from under Chrome.
export function isEphemeralInstall(path) {
  return /[\\/]_npx[\\/]/.test(path);
}

export function jsonConfigPath(client, { platform = process.platform, home = homedir(), appData = process.env.APPDATA } = {}) {
  if (client === 'cursor') return join(home, '.cursor', 'mcp.json');
  if (client !== 'claude-desktop') throw new Error(`No JSON config for client: ${client}`);
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  if (platform === 'win32') return join(appData ?? join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  return null; // Claude Desktop has no official Linux build.
}

export function shellQuote(arg, platform = process.platform) {
  if (/^[\w@%+=:,./\\-]+$/.test(arg)) return arg;
  if (platform === 'win32') return `"${arg.replace(/"/g, '\\"')}"`;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function cliCommand(client, { node = process.execPath, entry = serverEntryPath(), platform = process.platform } = {}) {
  const server = `${shellQuote(node, platform)} ${shellQuote(entry, platform)}`;
  if (client === 'claude-code') return `claude mcp add --scope user ${SERVER_NAME} -- ${server}`;
  if (client === 'codex') return `codex mcp add ${SERVER_NAME} -- ${server}`;
  throw new Error(`No CLI command for client: ${client}`);
}

// The full path to Node is deliberate: desktop apps don't read the shell's PATH (see docs/setup.md).
export function serverConfigEntry({ node = process.execPath, entry = serverEntryPath() } = {}) {
  return { command: node, args: [entry] };
}

export function mergeServerEntry(existingText, serverEntry) {
  const hasContent = existingText !== null && existingText.trim() !== '';
  let config = {};
  if (hasContent) {
    try {
      config = JSON.parse(existingText);
    } catch (err) {
      throw new Error(`it is not valid JSON (${err.message})`, { cause: err });
    }
    if (!isPlainObject(config)) throw new Error('its top level is not a JSON object');
    if (config.mcpServers !== undefined && !isPlainObject(config.mcpServers)) throw new Error('its "mcpServers" value is not a JSON object');
  }
  const previous = config.mcpServers?.[SERVER_NAME];
  // Keep anything the user added to the entry, such as env for pairing.
  const next = isPlainObject(previous) ? { ...previous, ...serverEntry } : serverEntry;
  if (previous !== undefined && JSON.stringify(previous) === JSON.stringify(next)) {
    return { status: 'unchanged', text: existingText };
  }
  const merged = { ...config, mcpServers: { ...config.mcpServers, [SERVER_NAME]: next } };
  return { status: previous === undefined ? 'added' : 'updated', text: `${JSON.stringify(merged, null, 2)}\n` };
}

// Refuses a file it can't parse rather than overwrite it, and keeps a .bak of any file it changes.
export function writeClientConfig(path, serverEntry) {
  const target = existsSync(path) ? realpathSync(path) : path; // A dotfiles symlink stays a symlink.
  const existing = existsSync(target) ? readFileSync(target, 'utf8') : null;
  const { status, text } = mergeServerEntry(existing, serverEntry);
  if (status === 'unchanged') return { status, path: target, backup: null };

  mkdirSync(dirname(target), { recursive: true });
  let backup = null;
  if (existing !== null) {
    backup = `${target}.bak`;
    copyFileSync(target, backup);
  }
  const temp = `${target}.tmp-${process.pid}`;
  writeFileSync(temp, text, existing !== null ? { mode: statSync(target).mode } : undefined);
  renameSync(temp, target);
  return { status, path: target, backup };
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
