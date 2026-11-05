import test from 'node:test';
import assert from 'node:assert/strict';
import { collectLayeredSnapshot, shouldFallbackToLayeredSnapshot } from './layeredSnapshotUtils.js';

function fakeRpcClient(responses) {
  const calls = [];
  return {
    calls,
    async send(method, params) {
      calls.push({ method, params });
      const response = responses[method];
      if (response instanceof Error) throw response;
      if (typeof response === 'function') return response(params);
      return response ?? { ok: false, error: { message: `Missing fake response for ${method}` } };
    },
  };
}

test('collects a complete layered snapshot', async () => {
  const rpcClient = fakeRpcClient({
    'page.getHtml': { ok: true, data: { html: '<html><body>Hello</body></html>', length: 31, truncated: false } },
    'page.getDomSnapshot': { ok: true, data: { snapshot: { tag: 'body' } } },
    'page.getAccessibilityTree': { ok: true, data: { tree: { role: 'document' } } },
    'page.getText': { ok: true, data: { text: 'Hello world' } },
    'page.getInteractiveElements': { ok: true, data: { elements: [{ tag: 'a', text: 'Home' }] } },
    'page.getForms': { ok: true, data: { forms: [{ id: 'signup' }] } },
    'app.detectFramework': { ok: true, data: { frameworks: [{ name: 'React' }] } },
    'app.getRouteInfo': { ok: true, data: { route: { href: 'https://example.com/' } } },
  });

  const result = await collectLayeredSnapshot(rpcClient, { tabId: '1', store: false });

  assert.equal(result.ok, true);
  assert.equal(result.data.snapshotStatus, 'complete');
  assert.deepEqual(result.data.availableLayers, [
    'rawHtml',
    'renderedDom',
    'accessibilityTree',
    'visibleText',
    'interactiveElements',
    'forms',
    'framework',
    'route',
  ]);
  assert.equal(result.data.layers.visibleText.sample, 'Hello world');
  assert.equal(result.warnings.length, 0);
});

test('returns partial layered snapshot when rendered DOM is empty or a layer fails', async () => {
  const rpcClient = fakeRpcClient({
    'page.getHtml': { ok: true, data: { html: '<html></html>', length: 13, truncated: false } },
    'page.getDomSnapshot': { ok: true, data: { snapshot: null } },
    'page.getAccessibilityTree': new Error('a11y unavailable'),
    'page.getText': { ok: true, data: { text: 'Fallback text' } },
    'page.getInteractiveElements': { ok: true, data: { elements: [] } },
    'page.getForms': { ok: true, data: { forms: [] } },
    'app.detectFramework': { ok: true, data: { frameworks: [{ name: 'unknown' }] } },
    'app.getRouteInfo': { ok: true, data: { route: { href: 'https://example.com/app' } } },
  });

  const result = await collectLayeredSnapshot(rpcClient, { tabId: '1', store: false });

  assert.equal(result.ok, true);
  assert.equal(result.data.snapshotStatus, 'partial');
  assert.ok(result.data.availableLayers.includes('visibleText'));
  assert.deepEqual(result.data.failedLayers, [{ layer: 'accessibilityTree', reason: 'a11y unavailable' }]);
  assert.ok(result.data.emptyLayers.includes('renderedDom'));
  assert.ok(result.warnings.some((warning) => warning.includes('Rendered DOM snapshot returned no useful data')));
});

test('detects when DOM snapshot fallback should run', () => {
  assert.equal(shouldFallbackToLayeredSnapshot({ ok: true, data: { snapshot: null } }), true);
  assert.equal(shouldFallbackToLayeredSnapshot({ ok: false, error: { message: 'boom' } }), true);
  assert.equal(shouldFallbackToLayeredSnapshot({ ok: true, data: { snapshot: { tag: 'body' } } }), false);
});
