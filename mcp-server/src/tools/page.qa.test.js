import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeActionName } from './page.js';

// ─── normalizeActionName ──────────────────────────────────────────────────────

test('normalizeActionName: camelCase dot-notation → snake_case for existing actions', () => {
  assert.equal(normalizeActionName('page.getText'), 'get_text');
  assert.equal(normalizeActionName('page.getDomSnapshot'), 'get_dom_snapshot');
  assert.equal(normalizeActionName('page.getAccessibilityTree'), 'get_accessibility_tree');
  assert.equal(normalizeActionName('page.getInteractiveElements'), 'get_interactive_elements');
  assert.equal(normalizeActionName('page.getForms'), 'get_forms');
  assert.equal(normalizeActionName('page.click'), 'click');
  assert.equal(normalizeActionName('page.fill'), 'fill');
});

test('normalizeActionName: QA action aliases', () => {
  assert.equal(normalizeActionName('page.assert'), 'assert');
  assert.equal(normalizeActionName('page.smokeTest'), 'smoke_test');
  assert.equal(normalizeActionName('page.findErrors'), 'find_errors');
  assert.equal(normalizeActionName('page.checkBrokenImages'), 'check_broken_images');
  assert.equal(normalizeActionName('page.checkLinks'), 'check_links');
  assert.equal(normalizeActionName('page.checkLayout'), 'check_layout');
  assert.equal(normalizeActionName('page.debugSelector'), 'debug_selector');
  assert.equal(normalizeActionName('page.debugClickability'), 'debug_clickability');
  assert.equal(normalizeActionName('page.captureDebugBundle'), 'capture_debug_bundle');
  assert.equal(normalizeActionName('page.waitForPageChange'), 'wait_for_page_change');
  assert.equal(normalizeActionName('page.compareSnapshots'), 'compare_snapshots');
});

test('normalizeActionName: already-canonical names pass through unchanged', () => {
  assert.equal(normalizeActionName('assert'), 'assert');
  assert.equal(normalizeActionName('smoke_test'), 'smoke_test');
  assert.equal(normalizeActionName('debug_selector'), 'debug_selector');
  assert.equal(normalizeActionName('capture_debug_bundle'), 'capture_debug_bundle');
  assert.equal(normalizeActionName('compare_snapshots'), 'compare_snapshots');
});

test('normalizeActionName: unknown names pass through unchanged', () => {
  assert.equal(normalizeActionName('totally_unknown'), 'totally_unknown');
  assert.equal(normalizeActionName('browser.openUrl'), 'browser.openUrl');
});

// ─── Handler input validation (via mock rpcClient) ────────────────────────────

function makeRpc(returnValue = { ok: true, data: {} }) {
  const calls = [];
  return {
    client: {
      send: async (method, params) => {
        calls.push({ method, params });
        return typeof returnValue === 'function' ? returnValue(method, params) : returnValue;
      },
    },
    calls,
  };
}

async function callHandler(action, params = {}) {
  // Import here to avoid circular; tools array is singleton
  const { tools } = await import('./page.js');
  const tool = tools[0];
  const { client } = makeRpc();
  return tool.handler({ action, ...params }, { rpcClient: client });
}

async function callHandlerWithSpy(action, params = {}, returnValue) {
  const { tools } = await import('./page.js');
  const tool = tools[0];
  const { client, calls } = makeRpc(returnValue);
  const result = await tool.handler({ action, ...params }, { rpcClient: client });
  return { result, calls };
}

// ─── assert ───────────────────────────────────────────────────────────────────

test('assert: rejects empty assertions array', async () => {
  const result = await callHandler('assert', { assertions: [] });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_ARGUMENT');
  assert.match(result.error.message, /assertions/);
});

test('assert: rejects missing assertions entirely', async () => {
  const result = await callHandler('assert');
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_ARGUMENT');
});

test('assert: forwards valid assertions to page.assert RPC', async () => {
  const assertions = [
    { type: 'url_includes', value: 'example' },
    { type: 'selector_exists', selector: '#main' },
  ];
  const rpcReturn = { ok: true, data: { passed: 2, failed: 0, results: [] } };
  const { result, calls } = await callHandlerWithSpy('assert', { assertions }, rpcReturn);
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'page.assert');
  assert.deepEqual(calls[0].params.assertions, assertions);
});

test('assert: via alias page.assert', async () => {
  const assertions = [{ type: 'title_includes', value: 'Test' }];
  const rpcReturn = { ok: true, data: { passed: 1, failed: 0, results: [] } };
  const { result } = await callHandlerWithSpy('page.assert', { assertions }, rpcReturn);
  assert.equal(result.ok, true);
});

// ─── smoke_test ───────────────────────────────────────────────────────────────

test('smoke_test: calls page.smokeTest RPC', async () => {
  const smokeReturn = {
    ok: true,
    data: {
      stateId: 'state_abc123',
      healthy: true,
      checks: { loaded: true, hasText: true, hasInteractives: true, noErrors: true, noLayoutIssues: true },
      summary: 'All checks passed',
    },
  };
  const { result, calls } = await callHandlerWithSpy('smoke_test', {}, smokeReturn);
  assert.equal(result.ok, true);
  assert.equal(calls[0].method, 'page.smokeTest');
});

test('smoke_test: unhealthy page still returns ok:true with healthy:false', async () => {
  const smokeReturn = {
    ok: true,
    data: {
      stateId: 'state_def456',
      healthy: false,
      checks: { loaded: true, hasText: false, hasInteractives: true, noErrors: false, noLayoutIssues: true },
      summary: '2 checks failed',
    },
  };
  const { result } = await callHandlerWithSpy('smoke_test', {}, smokeReturn);
  assert.equal(result.ok, true);
  assert.equal(result.data.healthy, false);
});

test('smoke_test: via alias page.smokeTest', async () => {
  const { result } = await callHandlerWithSpy('page.smokeTest', {}, { ok: true, data: { healthy: true } });
  assert.equal(result.ok, true);
});

// ─── find_errors ──────────────────────────────────────────────────────────────

test('find_errors: calls page.findErrors with params', async () => {
  const findReturn = {
    ok: true,
    data: {
      errors: [{ text: 'Something went wrong', selector: '.error-banner', pattern: 'went wrong' }],
      count: 1,
    },
  };
  const { calls } = await callHandlerWithSpy('find_errors', { maxMatches: 10 }, findReturn);
  assert.equal(calls[0].method, 'page.findErrors');
  assert.equal(calls[0].params.maxMatches, 10);
});

test('find_errors: no errors returns empty list', async () => {
  const { result } = await callHandlerWithSpy('find_errors', {}, { ok: true, data: { errors: [], count: 0 } });
  assert.equal(result.ok, true);
  assert.equal(result.data.count, 0);
});

// ─── check_broken_images ──────────────────────────────────────────────────────

test('check_broken_images: calls page.checkBrokenImages RPC', async () => {
  const imgReturn = {
    ok: true,
    data: {
      broken: [{ src: 'https://example.com/missing.png', alt: '', selector: 'img:nth-of-type(2)' }],
      total: 5,
      brokenCount: 1,
    },
  };
  const { result, calls } = await callHandlerWithSpy('check_broken_images', {}, imgReturn);
  assert.equal(result.ok, true);
  assert.equal(calls[0].method, 'page.checkBrokenImages');
  assert.equal(result.data.brokenCount, 1);
});

test('check_broken_images: via alias page.checkBrokenImages', async () => {
  const { result } = await callHandlerWithSpy('page.checkBrokenImages', {}, { ok: true, data: { broken: [], brokenCount: 0 } });
  assert.equal(result.ok, true);
});

// ─── check_links ──────────────────────────────────────────────────────────────

test('check_links: extract_only mode calls page.checkLinks', async () => {
  const linkReturn = {
    ok: true,
    data: {
      links: [
        { href: 'https://example.com/', text: 'Home', type: 'absolute' },
        { href: 'javascript:void(0)', text: 'Click me', type: 'javascript' },
        { href: '', text: 'Empty', type: 'empty' },
      ],
      summary: { total: 3, javascript: 1, empty: 1, valid: 1 },
    },
  };
  const { result, calls } = await callHandlerWithSpy('check_links', { mode: 'extract_only' }, linkReturn);
  assert.equal(result.ok, true);
  assert.equal(calls[0].method, 'page.checkLinks');
  assert.equal(calls[0].params.mode, 'extract_only');
  assert.equal(result.data.summary.javascript, 1);
});

test('check_links: via alias page.checkLinks', async () => {
  const { result } = await callHandlerWithSpy('page.checkLinks', {}, { ok: true, data: { links: [] } });
  assert.equal(result.ok, true);
});

// ─── check_layout ─────────────────────────────────────────────────────────────

test('check_layout: detects horizontal overflow', async () => {
  const layoutReturn = {
    ok: true,
    data: {
      issues: [{ type: 'overflow', selector: '.wide-table', detail: 'scrollWidth 1400 > clientWidth 375' }],
      issueCount: 1,
    },
  };
  const { result, calls } = await callHandlerWithSpy('check_layout', {}, layoutReturn);
  assert.equal(result.ok, true);
  assert.equal(calls[0].method, 'page.checkLayout');
  assert.equal(result.data.issues[0].type, 'overflow');
});

test('check_layout: clean page returns no issues', async () => {
  const { result } = await callHandlerWithSpy('check_layout', {}, { ok: true, data: { issues: [], issueCount: 0 } });
  assert.equal(result.ok, true);
  assert.equal(result.data.issueCount, 0);
});

// ─── debug_selector ───────────────────────────────────────────────────────────

test('debug_selector: missing selector returns INVALID_ARGUMENT', async () => {
  const result = await callHandler('debug_selector');
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_ARGUMENT');
  assert.match(result.error.message, /selector/);
});

test('debug_selector: zero matches returns ok:true with matchCount=0', async () => {
  const debugReturn = {
    ok: true,
    data: { selector: '#nonexistent', matchCount: 0, visibleCount: 0, alternatives: [], warnings: ['No elements found'] },
  };
  const { result, calls } = await callHandlerWithSpy('debug_selector', { selector: '#nonexistent' }, debugReturn);
  assert.equal(result.ok, true);
  assert.equal(calls[0].method, 'page.debugSelector');
  assert.equal(result.data.matchCount, 0);
  assert.ok(result.data.warnings.length > 0);
});

test('debug_selector: ambiguous selector (multiple matches) includes warning', async () => {
  const debugReturn = {
    ok: true,
    data: {
      selector: '.btn',
      matchCount: 12,
      visibleCount: 10,
      alternatives: ['.btn-primary', '.btn.cta'],
      warnings: ['12 elements matched — selector may be ambiguous'],
    },
  };
  const { result } = await callHandlerWithSpy('debug_selector', { selector: '.btn' }, debugReturn);
  assert.equal(result.ok, true);
  assert.equal(result.data.matchCount, 12);
  assert.ok(result.data.warnings.some((w) => /ambiguous/i.test(w)));
});

test('debug_selector: via alias page.debugSelector', async () => {
  const { result } = await callHandlerWithSpy('page.debugSelector', { selector: 'h1' }, { ok: true, data: { matchCount: 1 } });
  assert.equal(result.ok, true);
});

// ─── debug_clickability ───────────────────────────────────────────────────────

test('debug_clickability: missing selector returns INVALID_ARGUMENT', async () => {
  const result = await callHandler('debug_clickability');
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_ARGUMENT');
  assert.match(result.error.message, /selector/);
});

test('debug_clickability: covered element returns canClick:false', async () => {
  const coverReturn = {
    ok: true,
    data: {
      selector: '#submit-btn',
      canClick: false,
      reasons: ['Element is covered by .modal-overlay'],
      coveredBy: '.modal-overlay',
      riskLevel: 'high',
    },
  };
  const { result, calls } = await callHandlerWithSpy('debug_clickability', { selector: '#submit-btn' }, coverReturn);
  assert.equal(result.ok, true);
  assert.equal(calls[0].method, 'page.debugClickability');
  assert.equal(result.data.canClick, false);
  assert.ok(result.data.reasons.length > 0);
});

test('debug_clickability: disabled element returns canClick:false', async () => {
  const disabledReturn = {
    ok: true,
    data: {
      selector: '#disabled-input',
      canClick: false,
      reasons: ['Element has disabled attribute'],
      riskLevel: 'low',
    },
  };
  const { result } = await callHandlerWithSpy('debug_clickability', { selector: '#disabled-input' }, disabledReturn);
  assert.equal(result.ok, true);
  assert.equal(result.data.canClick, false);
  assert.ok(result.data.reasons.some((r) => /disabled/i.test(r)));
});

test('debug_clickability: clickable element returns canClick:true', async () => {
  const { result } = await callHandlerWithSpy('debug_clickability', { selector: '.visible-btn' }, {
    ok: true,
    data: { selector: '.visible-btn', canClick: true, reasons: [], riskLevel: 'low' },
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.canClick, true);
});

test('debug_clickability: via alias page.debugClickability', async () => {
  const { result } = await callHandlerWithSpy('page.debugClickability', { selector: 'button' }, { ok: true, data: { canClick: true } });
  assert.equal(result.ok, true);
});

// ─── capture_debug_bundle ─────────────────────────────────────────────────────

test('capture_debug_bundle: calls page.captureBundle and visual.captureScreenshot', async () => {
  const spy = makeRpc((method) => {
    if (method === 'page.captureBundle') {
      return { ok: true, data: { pageInfo: { url: 'https://example.com', title: 'Example' }, errors: [], layoutIssues: [] } };
    }
    if (method === 'visual.captureScreenshot') {
      return { ok: true, data: { dataUrl: 'data:image/png;base64,abc' } };
    }
    return { ok: true, data: {} };
  });
  const { tools } = await import('./page.js');
  const result = await tools[0].handler({ action: 'capture_debug_bundle' }, { rpcClient: spy.client });
  assert.equal(result.ok, true);
  assert.ok(spy.calls.some((c) => c.method === 'page.captureBundle'));
  assert.ok(spy.calls.some((c) => c.method === 'visual.captureScreenshot'));
});

test('capture_debug_bundle: screenshot failure is non-fatal', async () => {
  const spy = makeRpc((method) => {
    if (method === 'page.captureBundle') return { ok: true, data: { pageInfo: {} } };
    if (method === 'visual.captureScreenshot') throw new Error('CDP not attached');
    return { ok: true, data: {} };
  });
  const { tools } = await import('./page.js');
  const result = await tools[0].handler({ action: 'capture_debug_bundle' }, { rpcClient: spy.client });
  assert.equal(result.ok, true);
  assert.equal(result.screenshot, undefined);
});

test('capture_debug_bundle: include=[] skips screenshot', async () => {
  const spy = makeRpc((method) => {
    if (method === 'page.captureBundle') return { ok: true, data: {} };
    return { ok: true, data: {} };
  });
  const { tools } = await import('./page.js');
  await tools[0].handler({ action: 'capture_debug_bundle', include: ['pageInfo', 'errors'] }, { rpcClient: spy.client });
  assert.ok(!spy.calls.some((c) => c.method === 'visual.captureScreenshot'));
});

test('capture_debug_bundle: via alias page.captureDebugBundle', async () => {
  const { result } = await callHandlerWithSpy('page.captureDebugBundle', {}, (method) => {
    if (method === 'visual.captureScreenshot') return { ok: true, data: { dataUrl: 'data:...' } };
    return { ok: true, data: {} };
  });
  assert.equal(result.ok, true);
});

// ─── wait_for_page_change ─────────────────────────────────────────────────────

test('wait_for_page_change: calls page.waitForPageChange RPC', async () => {
  const waitReturn = {
    ok: true,
    data: { changed: true, changeType: 'url', previousUrl: 'https://a.com/', currentUrl: 'https://b.com/' },
  };
  const { result, calls } = await callHandlerWithSpy('wait_for_page_change', { previousUrl: 'https://a.com/', timeoutMs: 5000 }, waitReturn);
  assert.equal(result.ok, true);
  assert.equal(calls[0].method, 'page.waitForPageChange');
  assert.equal(calls[0].params.previousUrl, 'https://a.com/');
  assert.equal(result.data.changed, true);
});

test('wait_for_page_change: timeout case returns changed:false', async () => {
  const { result } = await callHandlerWithSpy('wait_for_page_change', { previousUrl: 'https://a.com/', timeoutMs: 500 }, {
    ok: true,
    data: { changed: false, timedOut: true },
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.changed, false);
  assert.equal(result.data.timedOut, true);
});

test('wait_for_page_change: via alias page.waitForPageChange', async () => {
  const { result } = await callHandlerWithSpy('page.waitForPageChange', {}, { ok: true, data: { changed: false } });
  assert.equal(result.ok, true);
});

// ─── compare_snapshots ────────────────────────────────────────────────────────

test('compare_snapshots: missing beforeStateId returns INVALID_ARGUMENT', async () => {
  const result = await callHandler('compare_snapshots', { afterStateId: 'state_456' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_ARGUMENT');
});

test('compare_snapshots: missing afterStateId returns INVALID_ARGUMENT', async () => {
  const result = await callHandler('compare_snapshots', { beforeStateId: 'state_123' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_ARGUMENT');
});

test('compare_snapshots: both IDs present calls page.compareSnapshots', async () => {
  const compareReturn = {
    ok: true,
    data: {
      added: [{ selector: '#new-banner', text: 'New feature available' }],
      removed: [],
      errors: { before: 0, after: 1 },
      urlChanged: false,
    },
  };
  const { result, calls } = await callHandlerWithSpy(
    'compare_snapshots',
    { beforeStateId: 'state_123', afterStateId: 'state_456' },
    compareReturn
  );
  assert.equal(result.ok, true);
  assert.equal(calls[0].method, 'page.compareSnapshots');
  assert.equal(calls[0].params.beforeStateId, 'state_123');
  assert.equal(calls[0].params.afterStateId, 'state_456');
  assert.equal(result.data.added.length, 1);
  assert.equal(result.data.removed.length, 0);
});

test('compare_snapshots: via alias page.compareSnapshots', async () => {
  const { result } = await callHandlerWithSpy('page.compareSnapshots', { beforeStateId: 'a', afterStateId: 'b' }, { ok: true, data: {} });
  assert.equal(result.ok, true);
});

// ─── sensitive data ───────────────────────────────────────────────────────────

test('sensitive: assert does not leak raw value in error path', async () => {
  // The MCP layer validates only — actual redaction happens in content bridge
  // Ensure the assertions array is forwarded opaquely (not logged or returned)
  const assertions = [
    { type: 'input_value_equals', selector: '#password', value: 'SuperSecret123!' },
  ];
  const rpcReturn = { ok: true, data: { passed: 1, failed: 0, results: [] } };
  const { calls } = await callHandlerWithSpy('assert', { assertions }, rpcReturn);
  // params are forwarded to RPC — that is expected
  // ensure the returned result does not echo back the raw value
  const result = (await callHandlerWithSpy('assert', { assertions }, rpcReturn)).result;
  assert.equal(JSON.stringify(result).includes('SuperSecret123!'), false);
});

// ─── meta field ───────────────────────────────────────────────────────────────

test('meta: all QA actions include tool and action in meta', async () => {
  const qaActions = [
    ['smoke_test', {}],
    ['find_errors', {}],
    ['check_broken_images', {}],
    ['check_links', {}],
    ['check_layout', {}],
    ['debug_selector', { selector: 'h1' }],
    ['debug_clickability', { selector: 'button' }],
    ['wait_for_page_change', {}],
  ];

  const { tools } = await import('./page.js');
  for (const [action, params] of qaActions) {
    const { client } = makeRpc({ ok: true, data: {} });
    const result = await tools[0].handler({ action, ...params }, { rpcClient: client });
    assert.equal(result.meta?.tool, 'fileforge_page_interaction', `meta.tool missing for ${action}`);
    assert.equal(result.meta?.action, action, `meta.action wrong for ${action}`);
  }
});
