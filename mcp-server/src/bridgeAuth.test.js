import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { FILEFORGE_EXTENSION_ID, allowedExtensionIds, pairingRequired } from './bridgeAuth.js';

// Chrome derives an extension ID from the SHA-256 of its public key, hex digits mapped 0-f -> a-p.
function idFromManifestKey(key) {
  const hex = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

test('default extension ID matches the key in manifest.json', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../extension/manifest.json', import.meta.url), 'utf8'));
  assert.equal(idFromManifestKey(manifest.key), FILEFORGE_EXTENSION_ID);
});

test('allowlist defaults to the FileForge extension ID', () => {
  assert.deepEqual(allowedExtensionIds({}), [FILEFORGE_EXTENSION_ID]);
  assert.deepEqual(allowedExtensionIds({ FILEFORGE_EXTENSION_IDS: ' , ' }), [FILEFORGE_EXTENSION_ID]);
});

test('FILEFORGE_EXTENSION_IDS replaces the default allowlist', () => {
  const other = 'b'.repeat(32);
  assert.deepEqual(allowedExtensionIds({ FILEFORGE_EXTENSION_IDS: `${other}, ${'c'.repeat(32)}` }), [other, 'c'.repeat(32)]);
});

test('pairing is on only for FILEFORGE_REQUIRE_PAIRING=1', () => {
  assert.equal(pairingRequired({ FILEFORGE_REQUIRE_PAIRING: '1' }), true);
  for (const value of [undefined, '', '0', 'true']) {
    assert.equal(pairingRequired({ FILEFORGE_REQUIRE_PAIRING: value }), false);
  }
});
