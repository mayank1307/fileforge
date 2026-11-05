import test from 'node:test';
import assert from 'node:assert/strict';
import { tools as responsiveTools } from './responsive.js';

const responsiveActionTool = responsiveTools.find((tool) => tool.name === 'fileforge_responsive_action');

test('capture_matrix orchestrates via canonical browser/devtools/visual methods', async () => {
  const calls = [];
  const rpcClient = {
    async send(method, params = {}) {
      calls.push({ method, params });
      if (method === 'browser.navigate') {
        if (params.url === 'about:blank') return { ok: true, data: { id: 101 } };
        return { ok: true, data: { id: 101, url: params.url } };
      }
      if (method === 'browser.wait') return { ok: true, data: { tabId: params.tabId, status: 'complete' } };
      if (method === 'devtools.getNetwork') return { ok: true, data: { requests: [] } };
      if (method === 'visual.captureScreenshot') {
        return {
          ok: true,
          data: {
            screenshot: {
              fullImagePath: `/tmp/${params.name}.png`,
              fullImage: `file:///tmp/${params.name}.png`,
              format: 'png',
            },
          },
        };
      }
      return { ok: true, data: {} };
    },
  };

  const result = await responsiveActionTool.handler({
    action: 'capture_matrix',
    url: 'example.com',
    widths: [360, 1024],
    store: false,
    settleMs: 0,
  }, { rpcClient });

  assert.equal(result.ok, true);
  assert.equal(result.data.captures.length, 2);
  assert.equal(result.data.summary.ok, 2);
  assert.ok(calls.some((call) => call.method === 'visual.captureScreenshot'));
  assert.ok(calls.some((call) => call.method === 'browser.navigate'));
  assert.ok(calls.some((call) => call.method === 'browser.wait'));
  assert.ok(calls.some((call) => call.method === 'devtools.setViewport'));
  assert.equal(calls.some((call) => call.method === 'responsive.captureMatrix'), false);
});
