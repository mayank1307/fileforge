#!/usr/bin/env node
// Writes docs/tools.md from the tool registry. Run it after adding or changing a tool: npm run docs:tools
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { renderToolsDoc, TOOLS_DOC_URL } from '../toolsDoc.js';
import { renderToolsSpec, TOOLS_SPEC_URL } from '../toolsSpec.js';

writeFileSync(TOOLS_DOC_URL, renderToolsDoc());
console.log(`Wrote ${fileURLToPath(TOOLS_DOC_URL)}`);
writeFileSync(TOOLS_SPEC_URL, renderToolsSpec());
console.log(`Wrote ${fileURLToPath(TOOLS_SPEC_URL)}`);
