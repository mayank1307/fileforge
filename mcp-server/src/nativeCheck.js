import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));

// better-sqlite3 is a native addon built for one Node ABI. When the MCP client launches a different
// Node than the one that ran npm install, loading it fails with ERR_DLOPEN_FAILED / NODE_MODULE_VERSION.
export function nativeModuleHelp(err, { nodeVersion = process.version, serverDir = SERVER_DIR } = {}) {
  const text = `${err?.code ?? ''} ${err?.message ?? ''}`;
  if (!/ERR_DLOPEN_FAILED|NODE_MODULE_VERSION|was compiled against a different Node\.js version/.test(text)) return null;
  return [
    `better-sqlite3 was built for a different Node.js version than the one running FileForge (${nodeVersion}).`,
    'Rebuild it with the same Node your MCP client uses:',
    '',
    `  cd "${serverDir}"`,
    '  npm rebuild better-sqlite3',
    '',
    'If your MCP client starts a different node than your shell, point its "command" at the full path of that node.',
  ].join('\n');
}

export function checkNativeModules() {
  const require = createRequire(import.meta.url);
  try {
    const Database = require('better-sqlite3');
    new Database(':memory:').close();
  } catch (err) {
    const help = nativeModuleHelp(err);
    if (!help) throw err;
    console.error(`[fileforge] ✗ ${help}`);
    process.exit(1);
  }
}
