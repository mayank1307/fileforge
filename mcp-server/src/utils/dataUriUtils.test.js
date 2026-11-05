import test from 'node:test';
import assert from 'node:assert/strict';
import { dataUriSummary, detectDataUrisInText, parseDataUri } from './dataUriUtils.js';

const ONE_BY_ONE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

test('inspects text data URIs with safe previews', () => {
  const parsed = parseDataUri('data:application/json,%7B%22ok%22%3Atrue%7D');
  assert.equal(parsed.mime, 'application/json');
  assert.equal(parsed.encoding, 'url');
  assert.equal(parsed.category, 'json');
  assert.equal(parsed.extension, 'json');
  assert.equal(parsed.textPreview, '{"ok":true}');
  assert.deepEqual(parsed.jsonPreview, { ok: true });
  assert.equal(parsed.buffer.toString('utf8'), '{"ok":true}');
});

test('inspects image data URIs and extracts dimensions', () => {
  const summary = dataUriSummary(ONE_BY_ONE_PNG);
  assert.equal(summary.mime, 'image/png');
  assert.equal(summary.category, 'image');
  assert.equal(summary.extension, 'png');
  assert.deepEqual(summary.dimensions, { width: 1, height: 1 });
  assert.equal('buffer' in summary, false);
});

test('detects embedded data URIs in text', () => {
  const matches = detectDataUrisInText(`body{background:url("${ONE_BY_ONE_PNG}")} a=data:text/plain,hello`);
  assert.equal(matches.length, 2);
  assert.equal(matches[0].mime, 'image/png');
  assert.equal(matches[1].mime, 'text/plain');
});
