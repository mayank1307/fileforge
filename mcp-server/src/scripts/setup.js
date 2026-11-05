#!/usr/bin/env node
// Prints the extension folder and the exact config for each MCP client, using this install's real paths.
// With --client cursor|claude-desktop --write, it also adds FileForge to that client's config file.
import { parseArgs } from 'util';
import {
  CLI_CLIENTS,
  CLIENTS,
  JSON_CLIENTS,
  SERVER_NAME,
  cliCommand,
  findExtensionDir,
  isEphemeralInstall,
  jsonConfigPath,
  serverConfigEntry,
  serverEntryPath,
  writeClientConfig,
} from '../setup.js';

const LABELS = { 'claude-code': 'Claude Code', codex: 'Codex', cursor: 'Cursor', 'claude-desktop': 'Claude Desktop' };
const USAGE = `Usage: fileforge-setup [--client ${CLIENTS.join('|')}] [--write]

Prints how to load the extension and connect an MCP client. Changes nothing unless you pass --write.

  --client <name>  Show only this client.
  --write          Add FileForge to the client's config file (${JSON_CLIENTS.join(', ')} only).
                   Other servers in the file are kept, and the old file is saved as <file>.bak.
  --help           Show this message.`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

let options;
try {
  ({ values: options } = parseArgs({
    options: { client: { type: 'string' }, write: { type: 'boolean', default: false }, help: { type: 'boolean', default: false } },
  }));
} catch (err) {
  fail(`${err.message}\n\n${USAGE}`);
}

if (options.help) {
  console.log(USAGE);
  process.exit(0);
}
if (options.client && !CLIENTS.includes(options.client)) fail(`Unknown client "${options.client}".\n\n${USAGE}`);
if (options.write && !options.client) fail(`--write needs --client.\n\n${USAGE}`);
if (options.write && CLI_CLIENTS.includes(options.client)) {
  fail(`${LABELS[options.client]} manages its own config. Run:\n\n  ${cliCommand(options.client)}`);
}

if (options.write) {
  const path = jsonConfigPath(options.client);
  if (!path) fail(`${LABELS[options.client]} has no official build for this OS.`);
  const label = LABELS[options.client];
  try {
    const { status, path: written, backup } = writeClientConfig(path, serverConfigEntry());
    if (status === 'unchanged') console.log(`${label} is already set up: ${written}`);
    else console.log(`${status === 'added' ? 'Added' : 'Updated'} ${SERVER_NAME} in ${written}${backup ? `\nSaved the previous file as ${backup}` : ''}`);
    console.log(options.client === 'claude-desktop' ? 'Quit Claude Desktop completely and reopen it.' : 'Check that fileforge is enabled under MCP in Cursor Settings.');
  } catch (err) {
    fail(`Left ${path} unchanged: ${err.message}.\nFix the file, or add this under "mcpServers" yourself:\n\n"${SERVER_NAME}": ${JSON.stringify(serverConfigEntry(), null, 2)}`);
  }
  process.exit(0);
}

const extensionDir = findExtensionDir();
const clients = options.client ? [options.client] : CLIENTS;

console.log('1. Load the extension\n');
console.log('   Open chrome://extensions, turn on Developer mode, click Load unpacked, and pick:\n');
console.log(`   ${extensionDir ?? 'extension folder not found; reinstall FileForge'}\n`);
if (isEphemeralInstall(serverEntryPath())) {
  console.log('   This is a temporary npx copy that npm can delete. Run npm install -g fileforge-mcp-server first,\n   then run fileforge-setup, so the folder Chrome loads stays put.\n');
}

console.log('2. Connect your MCP client\n');
for (const client of clients) {
  if (CLI_CLIENTS.includes(client)) {
    console.log(`   ${LABELS[client]}:\n     ${cliCommand(client)}\n`);
  } else if (jsonConfigPath(client)) {
    console.log(`   ${LABELS[client]} (${jsonConfigPath(client)}):\n     fileforge-setup --client ${client} --write\n`);
  } else if (options.client) {
    console.log(`   ${LABELS[client]} has no official build for this OS.\n`);
  }
}

console.log('3. Check it, with your client open and Chrome running\n');
console.log('   fileforge-verify\n');
console.log('From a clone, use npm run setup and npm run verify in mcp-server/; pass flags after --, as in npm run setup -- --client cursor --write.');
