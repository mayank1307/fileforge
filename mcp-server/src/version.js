import { readFileSync } from 'fs';

export const SERVER_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

// The extension reports its manifest version when it connects. Returns a warning to show, or null when they match.
export function extensionVersionWarning(extensionVersion, serverVersion = SERVER_VERSION) {
  if (!extensionVersion) {
    return `FileForge extension did not report a version, so it is older than the server (${serverVersion}). Reload it at chrome://extensions.`;
  }
  if (extensionVersion !== serverVersion) {
    return `FileForge extension ${extensionVersion} does not match server ${serverVersion}. Reload the extension at chrome://extensions, or update whichever side is older.`;
  }
  return null;
}
