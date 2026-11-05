#!/usr/bin/env node
// Prints the bridge token to paste into the side panel's Settings tab when the server runs with
// FILEFORGE_REQUIRE_PAIRING=1. Creates ~/.fileforge/bridge-token if no server has yet.
import { bridgeToken } from '../bridgeAuth.js';

console.log('Paste this into the FileForge side panel (Settings → Pairing) and click Save:\n');
console.log(`  ${bridgeToken()}\n`);
console.log('It is the same secret as ~/.fileforge/bridge-token. Anyone who has it can drive your browser through FileForge, so do not share it.');
