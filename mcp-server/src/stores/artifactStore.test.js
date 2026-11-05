import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'fs';
import { artifactStore, imageDimensions, parseDataUrl } from './artifactStore.js';

const ONE_BY_ONE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

test('parses base64 image data URLs', () => {
  const parsed = parseDataUrl(ONE_BY_ONE_PNG);
  assert.equal(parsed.mimeType, 'image/png');
  assert.ok(parsed.buffer.length > 0);
});

test('extracts PNG dimensions', () => {
  const { buffer, mimeType } = parseDataUrl(ONE_BY_ONE_PNG);
  assert.deepEqual(imageDimensions(buffer, mimeType), { width: 1, height: 1 });
});

test('stores screenshot artifacts and omits base64 by default', () => {
  const screenshot = artifactStore.saveScreenshot({
    dataUrl: ONE_BY_ONE_PNG,
    project: 'unit-test',
    run: 'run-url-artifacts',
    name: 'homepage',
    url: 'https://example.com/',
    viewport: '1440x900',
  });

  assert.equal(screenshot.fullImage.endsWith('/unit-test/run-url-artifacts/screenshots/homepage.png'), true);
  assert.equal(screenshot.thumbnail.endsWith('/unit-test/run-url-artifacts/screenshots/homepage-thumb.svg'), true);
  assert.equal(screenshot.width, 1);
  assert.equal(screenshot.height, 1);
  assert.equal(screenshot.viewport, '1440x900');
  assert.equal('dataUrl' in screenshot, false);
  assert.ok(existsSync(screenshot.fullImagePath));
  assert.ok(existsSync(screenshot.thumbnailPath));
  assert.match(readFileSync(screenshot.thumbnailPath, 'utf8'), /<svg/);
});

test('can include base64 when explicitly requested', () => {
  const screenshot = artifactStore.saveScreenshot({
    dataUrl: ONE_BY_ONE_PNG,
    project: 'unit-test',
    run: 'run-url-artifacts',
    name: 'with-base64',
    includeBase64: true,
  });
  assert.equal(screenshot.dataUrl, ONE_BY_ONE_PNG);
});
