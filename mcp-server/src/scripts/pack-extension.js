#!/usr/bin/env node
// npm pack and npm publish only include files inside mcp-server/, so prepack copies the extension and the
// license in from the repo root and postpack removes the copies: node src/scripts/pack-extension.js copy|clean
import { cpSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';

const PACKAGE_DIR = fileURLToPath(new URL('../../', import.meta.url));
const COPIES = [
  { from: new URL('../../../extension/', import.meta.url), to: new URL('../../extension/', import.meta.url) },
  { from: new URL('../../../LICENSE', import.meta.url), to: new URL('../../LICENSE', import.meta.url) },
];

const mode = process.argv[2];
for (const { from, to } of COPIES) {
  rmSync(to, { recursive: true, force: true });
  if (mode === 'copy') cpSync(from, to, { recursive: true, filter: (src) => !src.endsWith('.DS_Store') });
}
console.log(`${mode === 'copy' ? 'Copied' : 'Removed'} extension/ and LICENSE ${mode === 'copy' ? 'into' : 'from'} ${PACKAGE_DIR}`);
