import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { deflateSync } from 'zlib';
import { comparePngFiles, sha256File } from './pngDiffUtils.js';

const ONE_BY_ONE_PNG = makePngBase64([255, 255, 255, 255]);
const BLACK_ONE_BY_ONE_PNG = makePngBase64([0, 0, 0, 255]);

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return out;
}

function makePngBase64(rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const pixels = deflateSync(Buffer.from([0, ...rgba]));
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', pixels), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}

function writePng(dir, name, base64) {
  const file = join(dir, name);
  writeFileSync(file, Buffer.from(base64, 'base64'));
  return file;
}

test('compares identical PNG files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fileforge-png-diff-'));
  const before = writePng(dir, 'before.png', ONE_BY_ONE_PNG);
  const after = writePng(dir, 'after.png', ONE_BY_ONE_PNG);

  const diff = comparePngFiles(before, after);
  assert.equal(diff.changedPixels, 0);
  assert.equal(diff.changedPercent, 0);
  assert.equal(diff.hashes, undefined);
  assert.equal(sha256File(before), sha256File(after));
});

test('reports changed pixels for different PNG files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fileforge-png-diff-'));
  const before = writePng(dir, 'before.png', ONE_BY_ONE_PNG);
  const after = writePng(dir, 'after.png', BLACK_ONE_BY_ONE_PNG);

  const diff = comparePngFiles(before, after);
  assert.equal(diff.changedPixels, 1);
  assert.equal(diff.changedPercent, 100);
});
