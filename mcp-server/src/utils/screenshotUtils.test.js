import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'fs';
import { materializeScreenshotResponse } from './screenshotUtils.js';

const ONE_BY_ONE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

test('materializes visual.captureScreenshot responses into artifacts', () => {
  const response = materializeScreenshotResponse(
    'visual.captureScreenshot',
    { project: 'unit-test', run: 'run-rpc-screenshot', name: 'rpc-shot' },
    { ok: true, data: { dataUrl: ONE_BY_ONE_PNG, format: 'png' } }
  );

  assert.equal(response.ok, true);
  assert.equal(response.data.screenshot.filename, 'rpc-shot.png');
  assert.equal('dataUrl' in response.data.screenshot, false);
  assert.ok(existsSync(response.data.screenshot.fullImagePath));
});

test('materializes visual.captureFullPage responses and preserves capture metadata', () => {
  const response = materializeScreenshotResponse(
    'visual.captureFullPage',
    { project: 'unit-test', run: 'run-rpc-full-page', name: 'full-page' },
    {
      ok: true,
      data: {
        dataUrl: ONE_BY_ONE_PNG,
        format: 'png',
        captureCount: 3,
        pageHeight: 2400,
        url: 'https://example.test/page',
      },
    }
  );

  assert.equal(response.ok, true);
  assert.equal(response.data.screenshot.filename, 'full-page.png');
  assert.equal(response.data.screenshot.url, 'https://example.test/page');
  assert.equal(response.data.captureCount, 3);
  assert.equal(response.data.pageHeight, 2400);
  assert.equal('dataUrl' in response.data.screenshot, false);
  assert.ok(existsSync(response.data.screenshot.fullImagePath));
});

test('materializes visual.captureElement responses and preserves selector metadata', () => {
  const response = materializeScreenshotResponse(
    'visual.captureElement',
    { project: 'unit-test', run: 'run-rpc-element', name: 'element-shot' },
    {
      ok: true,
      data: {
        dataUrl: ONE_BY_ONE_PNG,
        format: 'png',
        selector: '#submit',
        clipped: false,
        url: 'https://example.test/form',
      },
    }
  );

  assert.equal(response.ok, true);
  assert.equal(response.data.screenshot.filename, 'element-shot.png');
  assert.equal(response.data.selector, '#submit');
  assert.equal(response.data.clipped, false);
  assert.equal(response.data.screenshot.url, 'https://example.test/form');
  assert.ok(existsSync(response.data.screenshot.fullImagePath));
});

test('materializes visual.captureRegion responses and preserves requested region metadata', () => {
  const response = materializeScreenshotResponse(
    'visual.captureRegion',
    { project: 'unit-test', run: 'run-rpc-region', name: 'region-shot' },
    {
      ok: true,
      data: {
        dataUrl: ONE_BY_ONE_PNG,
        format: 'png',
        requested: { x: 10, y: 20, width: 300, height: 120, coordinateSpace: 'viewport' },
        clipped: true,
        url: 'https://example.test/dashboard',
      },
    }
  );

  assert.equal(response.ok, true);
  assert.equal(response.data.screenshot.filename, 'region-shot.png');
  assert.equal(response.data.requested.x, 10);
  assert.equal(response.data.clipped, true);
  assert.equal(response.data.screenshot.url, 'https://example.test/dashboard');
  assert.ok(existsSync(response.data.screenshot.fullImagePath));
});

test('materializes visual.pickAndCaptureElement responses and preserves picked metadata', () => {
  const response = materializeScreenshotResponse(
    'visual.pickAndCaptureElement',
    { project: 'unit-test', run: 'run-rpc-picked-element', name: 'picked-element' },
    {
      ok: true,
      data: {
        dataUrl: ONE_BY_ONE_PNG,
        format: 'png',
        selector: 'main > button:nth-of-type(1)',
        picked: { selector: 'main > button:nth-of-type(1)', tag: 'button' },
        url: 'https://example.test/editor',
      },
    }
  );

  assert.equal(response.ok, true);
  assert.equal(response.data.screenshot.filename, 'picked-element.png');
  assert.equal(response.data.picked.tag, 'button');
  assert.equal(response.data.selector, 'main > button:nth-of-type(1)');
  assert.equal(response.data.screenshot.url, 'https://example.test/editor');
  assert.ok(existsSync(response.data.screenshot.fullImagePath));
});

test('leaves screenshot base64 intact when storage is disabled', () => {
  const response = materializeScreenshotResponse(
    'visual.captureScreenshot',
    { store: false },
    { ok: true, data: { dataUrl: ONE_BY_ONE_PNG, format: 'png' } }
  );

  assert.deepEqual(response, { ok: true, data: { dataUrl: ONE_BY_ONE_PNG, format: 'png' } });
});

test('does not alter unrelated RPC responses', () => {
  const response = { ok: true, data: { value: 1 } };
  assert.equal(materializeScreenshotResponse('page.getText', {}, response), response);
});
