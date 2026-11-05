import test from 'node:test';
import assert from 'node:assert/strict';
import { createZipBuffer } from './exportUtils.js';

function findEntry(zip, name) {
  const needle = Buffer.from(name);
  const index = zip.indexOf(needle);
  assert.notEqual(index, -1);
  return index;
}

test('creates a zip buffer with named entries', () => {
  const zip = createZipBuffer([
    { name: 'result.json', contents: '{"ok":true}' },
    { name: 'issues.json', contents: '[]' },
  ]);

  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.notEqual(findEntry(zip, 'result.json'), -1);
  assert.notEqual(findEntry(zip, 'issues.json'), -1);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
});
