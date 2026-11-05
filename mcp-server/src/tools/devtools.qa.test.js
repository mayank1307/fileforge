import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeActionName,
  resolveDevtoolsPreset,
  resolveDevtoolsQuery,
  validateDevtoolsQuery,
  projectFields,
  applyFilters,
  applyIssueFilters,
  redactSensitiveHeaders,
  redactSensitiveBody,
  redactSensitiveUrl,
  truncateBody,
  classifyNetworkRequest,
  classifyConsoleMessage,
  classifyThirdPartyDomain,
  classifyReplayRisk,
  validateEvaluate,
  validateReplay,
  collectStorageSummary,
  buildDevtoolsSummary,
  buildSecuritySummary,
  buildThirdPartySummary,
  buildHarSummary,
  buildDevtoolsIssues,
  handleQueryDevtools,
  PRESETS,
  LIMITS,
} from './devtoolsQuery.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeRequest(over = {}) {
  return {
    requestId: over.requestId ?? 'r1',
    url: over.url ?? 'https://example.com/api/profile',
    method: over.method ?? 'GET',
    type: over.type ?? 'XHR',
    requestHeaders: over.requestHeaders ?? { Authorization: 'Bearer abc' },
    postData: over.postData,
    startedAt: over.startedAt ?? 1000,
    finishedAt: over.finishedAt ?? 1500,
    initiator: over.initiator ?? { type: 'script', url: 'https://example.com/app.js' },
    failed: over.failed,
    response: over.response ?? { status: 200, headers: { 'content-type': 'application/json' }, encodedDataLength: 1234, mimeType: 'application/json' },
    body: over.body,
  };
}

function makeRpc({ requests = [], console_ = [], errors = [], websockets = [], tabUrl = 'https://example.com/' } = {}) {
  return {
    async send(method, _params) {
      if (method === 'devtools.startSession') return { ok: true, data: { tabId: 1, status: 'attached' } };
      if (method === 'devtools.stopSession') return { ok: true, data: { tabId: 1, status: 'detached' } };
      if (method === 'devtools.getConsole') return { ok: true, data: { entries: console_, tabId: 1, startedAt: 1000 } };
      if (method === 'devtools.getJsErrors') return { ok: true, data: { errors } };
      if (method === 'devtools.getNetwork') return { ok: true, data: { tabUrl, requests } };
      if (method === 'devtools.getApiResponses') {
        return { ok: true, data: { responses: requests.filter((r) => ['XHR', 'Fetch'].includes(r.type) || /\/api\/|graphql/i.test(r.url)) } };
      }
      if (method === 'devtools.getPerformance') return { ok: true, data: { computedMetrics: { lcp: 1200, fcp: 800, cls: 0.05, tbt: 50, ttfb: 200 }, timing: { navigation: [{}], paint: [] }, metrics: {} } };
      if (method === 'devtools.getWebSockets') return { ok: true, data: { websockets } };
      return { ok: true, data: {} };
    },
  };
}

function emptyRpc() {
  return { async send() { return { ok: false }; } };
}

// ─── Action alias normalization ──────────────────────────────────────────────

test('normalizeActionName resolves dotted and snake aliases (case 28: BC aliases)', () => {
  assert.equal(normalizeActionName('devtools.query'), 'query_devtools');
  assert.equal(normalizeActionName('query_devtools'), 'query_devtools');
  assert.equal(normalizeActionName('devtools.getConsole'), 'get_console');
  assert.equal(normalizeActionName('get_console'), 'get_console');
  assert.equal(normalizeActionName('devtools.startSession'), 'start_session');
  assert.equal(normalizeActionName('start_session'), 'start_session');
  assert.equal(normalizeActionName('devtools.replayRequest'), 'replay_request');
  assert.equal(normalizeActionName('replay_request'), 'replay_request');
  assert.equal(normalizeActionName('unknown'), 'unknown');
});

// ─── Preset / query resolution ───────────────────────────────────────────────

test('resolveDevtoolsPreset returns deep copy', () => {
  const r = resolveDevtoolsPreset('debug_page');
  assert.ok(r.preset);
  r.preset.console = false;
  assert.ok(PRESETS.debug_page.console);
});

test('resolveDevtoolsPreset rejects unknown preset (case 20)', () => {
  const r = resolveDevtoolsPreset('nope');
  assert.equal(r.error.error.code, 'INVALID_PRESET');
});

test('resolveDevtoolsQuery default falls back', () => {
  const { query } = resolveDevtoolsQuery({});
  assert.deepEqual(query, { session: true, summary: true });
});

// ─── Validation ──────────────────────────────────────────────────────────────

test('validateDevtoolsQuery rejects unknown module (case 19)', () => {
  const err = validateDevtoolsQuery({ bogus: true });
  assert.equal(err.error.code, 'INVALID_FIELD');
});

test('validateDevtoolsQuery rejects unknown field in network.fields', () => {
  const err = validateDevtoolsQuery({ network: { fields: ['url', 'cookies'] } });
  assert.equal(err.error.code, 'INVALID_FIELD');
  assert.equal(err.error.path, 'query.network.fields[1]');
});

test('validateDevtoolsQuery rejects oversized limit (case 21)', () => {
  const err = validateDevtoolsQuery({ console: { limit: 9999 } });
  assert.equal(err.error.code, 'INVALID_LIMIT');
});

test('validateDevtoolsQuery rejects invalid console level', () => {
  const err = validateDevtoolsQuery({ console: { levels: ['fatal'] } });
  assert.equal(err.error.code, 'INVALID_FILTER');
});

test('validateDevtoolsQuery rejects invalid sortBy', () => {
  const err = validateDevtoolsQuery({ network: { sortBy: 'random' } });
  assert.equal(err.error.code, 'INVALID_FILTER');
});

// ─── Field projection / filters ─────────────────────────────────────────────

test('projectFields returns only allowed keys', () => {
  assert.deepEqual(projectFields({ a: 1, b: 2, c: 3 }, ['a', 'c']), { a: 1, c: 3 });
});

test('applyFilters honors failed/status/url filters', () => {
  const items = [
    { failed: true, status: 500, url: '/api/x', method: 'GET' },
    { failed: false, status: 200, url: '/static/a', method: 'GET' },
  ];
  const out = applyFilters(items, { failed: true }, (m) => m);
  assert.equal(out.length, 1);
});

// ─── Redaction ──────────────────────────────────────────────────────────────

test('redactSensitiveHeaders redacts Authorization/Cookie (case 15)', () => {
  const out = redactSensitiveHeaders({ Authorization: 'Bearer abc', 'X-Other': 'ok' });
  assert.deepEqual(out.Authorization, { value: 'redacted', valueRedacted: true });
  assert.equal(out['X-Other'], 'ok');
});

test('redactSensitiveBody redacts password/token (case 16)', () => {
  const out = redactSensitiveBody({ password: 'p', token: 't', name: 'x' });
  assert.deepEqual(out.password, { value: 'redacted', valueRedacted: true });
  assert.deepEqual(out.token, { value: 'redacted', valueRedacted: true });
  assert.equal(out.name, 'x');
});

test('redactSensitiveBody redacts Bearer tokens in strings', () => {
  const out = redactSensitiveBody('Authorization: Bearer abcdef123');
  assert.match(out, /Bearer \[redacted\]/);
});

test('redactSensitiveUrl redacts sensitive query params (case 17)', () => {
  const out = redactSensitiveUrl('https://x.test/page?token=abc&q=keep');
  assert.match(out, /token=redacted/);
  assert.match(out, /q=keep/);
});

test('truncateBody enforces maxChars', () => {
  const out = truncateBody('x'.repeat(5000), 100);
  assert.equal(out.truncated, true);
  assert.equal(out.text.length, 100);
});

// ─── Classification ─────────────────────────────────────────────────────────

test('classifyNetworkRequest detects third-party', () => {
  const cls = classifyNetworkRequest(makeRequest({ url: 'https://cdn.other.com/x.js' }), 'https://example.com');
  assert.equal(cls.thirdParty, true);
});

test('classifyConsoleMessage classifies CORS/CSP/hydration', () => {
  assert.equal(classifyConsoleMessage({ level: 'error', text: 'CORS error blocked' }).category, 'cors');
  assert.equal(classifyConsoleMessage({ level: 'error', text: 'Content Security Policy violation' }).category, 'csp');
  assert.equal(classifyConsoleMessage({ level: 'warning', text: 'hydration mismatch' }).category, 'hydration');
});

test('classifyThirdPartyDomain returns category', () => {
  assert.equal(classifyThirdPartyDomain('www.google-analytics.com'), 'analytics');
  assert.equal(classifyThirdPartyDomain('checkout.stripe.com'), 'payments');
  assert.equal(classifyThirdPartyDomain('random.example.com'), 'unknown');
});

// ─── Safety: evaluate (cases 24, 25) ────────────────────────────────────────

test('validateEvaluate accepts dryRun-style benign code', () => {
  const r = validateEvaluate({ expression: 'document.title' });
  assert.ok(r.ok);
});

test('validateEvaluate blocks dangerous pattern (case 25)', () => {
  const r = validateEvaluate({ expression: 'document.cookie = "x=1"' });
  assert.equal(r.error.error.code, 'EVALUATE_BLOCKED');
});

test('validateEvaluate allows dangerous when allowDangerous=true (case 24 dryRun handled in handler)', () => {
  const r = validateEvaluate({ expression: 'localStorage.foo', allowDangerous: true });
  assert.ok(r.ok);
});

// ─── Safety: replay (cases 26, 27) ──────────────────────────────────────────

test('classifyReplayRisk: GET static = low, POST = high, /auth/ = high', () => {
  assert.equal(classifyReplayRisk({ method: 'GET', url: 'https://cdn.example.com/a.js' }), 'low');
  assert.equal(classifyReplayRisk({ method: 'POST', url: 'https://x.test/api/upload' }), 'high');
  assert.equal(classifyReplayRisk({ method: 'GET', url: 'https://x.test/auth/me' }), 'high');
});

test('validateReplay blocks unsafe method without allow (case 27)', () => {
  const r = validateReplay({ overrides: { method: 'POST', url: 'https://x.test/api/x' } }, { method: 'POST', url: 'https://x.test/api/x' });
  assert.equal(r.error.error.code, 'REPLAY_BLOCKED');
});

test('validateReplay permits unsafe when allowUnsafeMethods=true (case 26 supports dryRun in handler)', () => {
  const r = validateReplay({ overrides: { method: 'POST' }, allowUnsafeMethods: true }, { method: 'POST', url: 'https://x.test/api/x' });
  assert.ok(r.ok);
});

// ─── Storage privacy (case 18) ──────────────────────────────────────────────

test('collectStorageSummary never returns values', () => {
  const r = collectStorageSummary({}, true);
  assert.equal(r.data.includeValues, false);
  for (const k of ['localStorageKeys', 'sessionStorageKeys', 'cookieNames', 'indexedDbNames']) {
    assert.ok(Array.isArray(r.data[k]));
  }
});

// ─── End-to-end handler tests via fake rpcClient ────────────────────────────

test('handleQueryDevtools returns SESSION_NOT_STARTED when no session (case 22)', async () => {
  const res = await handleQueryDevtools({ preset: 'debug_page' }, { rpcClient: emptyRpc() });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'SESSION_NOT_STARTED');
});

test('handleQueryDevtools autoStartSession path runs without throwing (case 23)', async () => {
  let started = false;
  const rpc = {
    async send(method, _p) {
      if (method === 'devtools.startSession') { started = true; return { ok: true, data: {} }; }
      if (method === 'devtools.getConsole') return started ? { ok: true, data: { entries: [], startedAt: 1 } } : { ok: false };
      if (method === 'devtools.getNetwork') return { ok: true, data: { requests: [], tabUrl: 'https://x.test/' } };
      return { ok: true, data: {} };
    },
  };
  const res = await handleQueryDevtools({ preset: 'debug_page', autoStartSession: true, captureForMs: 0 }, { rpcClient: rpc });
  assert.equal(res.ok, true);
  assert.equal(started, true);
});

async function runPreset(presetName, opts = {}) {
  const rpc = makeRpc(opts);
  return handleQueryDevtools({ preset: presetName }, { rpcClient: rpc });
}

test('preset debug_page (case 1)', async () => {
  const res = await runPreset('debug_page', { requests: [makeRequest({ failed: true, response: { status: 0 } })] });
  assert.equal(res.ok, true);
  assert.equal(res.schemaVersion, 'devtools.query.v1');
  assert.ok(res.session);
  assert.ok(res.summary);
});

test('preset qa_failure_bundle (case 2)', async () => {
  const res = await runPreset('qa_failure_bundle', { requests: [makeRequest({ response: { status: 500, headers: { 'content-type': 'application/json' } }, body: { body: '{"error":"boom"}' } })] });
  assert.equal(res.ok, true);
  assert.ok(res.issues);
});

test('preset js_error_debug (case 3)', async () => {
  const res = await runPreset('js_error_debug', { errors: [{ text: 'ReferenceError: x is not defined', url: 'https://x.test/a.js', lineNumber: 10 }] });
  assert.equal(res.ok, true);
  assert.equal(res.jsErrors.length, 1);
});

test('preset network_debug (case 4)', async () => {
  const res = await runPreset('network_debug', { requests: [makeRequest(), makeRequest({ requestId: 'r2', url: 'https://example.com/big.js', type: 'Script' })] });
  assert.equal(res.ok, true);
  assert.ok(res.harSummary);
});

test('preset api_debug (case 5)', async () => {
  const res = await runPreset('api_debug', { requests: [makeRequest({ response: { status: 500, headers: { 'content-type': 'application/json' }, encodedDataLength: 12 }, body: { body: '{"err":1}' } })] });
  assert.equal(res.ok, true);
  assert.ok(res.apiInsights);
});

test('preset graphql_debug detects GraphQL ops (case 6, case 14)', async () => {
  const gqlReq = makeRequest({
    requestId: 'g1',
    url: 'https://api.example.com/graphql',
    method: 'POST',
    type: 'Fetch',
    postData: JSON.stringify({ operationName: 'GetUser', query: 'query GetUser { user { id } }', variables: { id: 1, password: 'p' } }),
    response: { status: 200, headers: { 'content-type': 'application/json' }, encodedDataLength: 50 },
    body: { body: '{"data":{"user":{"id":1}}}' },
  });
  const res = await runPreset('graphql_debug', { requests: [gqlReq] });
  assert.equal(res.ok, true);
  assert.equal(res.graphql.length, 1);
  assert.equal(res.graphql[0].operationName, 'GetUser');
  // variables redacted
  assert.deepEqual(res.graphql[0].variablesPreview.password, { value: 'redacted', valueRedacted: true });
});

test('preset performance_debug (case 7)', async () => {
  const res = await runPreset('performance_debug', { requests: [makeRequest({ type: 'Script' })] });
  assert.equal(res.ok, true);
  assert.ok(res.performance);
});

test('preset security_debug (case 8)', async () => {
  const res = await runPreset('security_debug', { requests: [makeRequest({ url: 'http://insecure.example.com/x' })] });
  assert.equal(res.ok, true);
  assert.ok(res.security);
});

test('preset third_party_audit (case 9)', async () => {
  const res = await runPreset('third_party_audit', {
    requests: [
      makeRequest({ url: 'https://www.google-analytics.com/ga.js', type: 'Script' }),
      makeRequest({ url: 'https://example.com/own.js', type: 'Script' }),
    ],
  });
  assert.equal(res.ok, true);
  assert.ok(res.thirdParties);
});

test('preset full_diagnostics (case 10)', async () => {
  const res = await runPreset('full_diagnostics', { requests: [makeRequest()] });
  assert.equal(res.ok, true);
  assert.ok(res.summary);
  assert.ok(res.session);
});

test('custom query: console + network + summary (case 11)', async () => {
  const rpc = makeRpc({ requests: [makeRequest()], console_: [{ level: 'error', text: 'boom' }] });
  const res = await handleQueryDevtools({ query: { console: true, network: true, summary: true } }, { rpcClient: rpc });
  assert.equal(res.ok, true);
  assert.equal(res.console.length, 1);
  assert.equal(res.summary.consoleErrorCount, 1);
});

test('custom query: failed requests only (case 12)', async () => {
  const rpc = makeRpc({ requests: [makeRequest(), makeRequest({ requestId: 'r2', failed: { errorText: 'net::ERR' }, response: { status: 0 } })] });
  const res = await handleQueryDevtools({ query: { network: { where: { failed: true } } } }, { rpcClient: rpc });
  assert.equal(res.ok, true);
  assert.equal(res.network.length, 1);
});

test('custom query: API body preview included (case 13)', async () => {
  const rpc = makeRpc({ requests: [makeRequest({ body: { body: JSON.stringify({ ok: true }) } })] });
  const res = await handleQueryDevtools({ query: { apiResponses: { includeJsonPreview: true } } }, { rpcClient: rpc });
  assert.equal(res.ok, true);
  assert.deepEqual(res.apiResponses[0].jsonPreview, { ok: true });
});

// ─── Issue + summary builders ───────────────────────────────────────────────

test('buildDevtoolsIssues produces normalized issues with stable IDs', () => {
  const ctx = {
    console: { items: [{ level: 'error', message: 'fail' }] },
    network: { raw: [{ url: '/api/x', method: 'GET', response: { status: 500 } }] },
  };
  const issues = buildDevtoolsIssues(ctx);
  assert.ok(issues.find((i) => i.category === 'console'));
  assert.ok(issues.find((i) => i.category === 'api' || i.category === 'network'));
  for (const i of issues) assert.ok(typeof i.id === 'string' && i.id.length > 0);
});

test('applyIssueFilters honors category + limit', () => {
  const issues = [
    { id: 'a', category: 'console', severity: 'high' },
    { id: 'b', category: 'network', severity: 'medium' },
  ];
  const out = applyIssueFilters(issues, { where: { category: 'console' }, limit: 10 });
  assert.equal(out.length, 1);
  assert.equal(out[0].category, 'console');
});

test('buildHarSummary aggregates status/type/domain', () => {
  const ctx = { network: { raw: [{ url: 'https://x.test/a', type: 'Script', response: { status: 200, encodedDataLength: 10 } }] } };
  const res = buildHarSummary(ctx, true);
  assert.equal(res.data.totalRequests, 1);
  assert.equal(res.data.statusCodeBreakdown['2xx'], 1);
});

test('buildSecuritySummary detects sensitive tokens in URL', () => {
  const ctx = { network: { raw: [{ url: 'https://x.test/p?token=abc', response: {} }] }, origin: 'https://x.test', console: { items: [] } };
  const res = buildSecuritySummary(ctx, true);
  assert.equal(res.data.authTokensExposed.length, 1);
});

test('buildThirdPartySummary groups by domain + category', () => {
  const ctx = { network: { raw: [{ url: 'https://www.google-analytics.com/x', type: 'Script', response: { encodedDataLength: 1 } }] }, origin: 'https://example.com' };
  const res = buildThirdPartySummary(ctx, true);
  assert.equal(res.items[0].category, 'analytics');
});

test('buildDevtoolsSummary supports include filter', () => {
  const ctx = { console: { items: [] }, network: { raw: [] } };
  const res = buildDevtoolsSummary(ctx, { include: ['totalRequests'] });
  assert.deepEqual(Object.keys(res), ['totalRequests']);
});

// ─── Limits sanity ──────────────────────────────────────────────────────────

test('LIMITS table exposes documented defaults', () => {
  assert.equal(LIMITS.console.default, 100);
  assert.equal(LIMITS.console.max, 1000);
  assert.equal(LIMITS.network.max, 2000);
  assert.equal(LIMITS.bodyChars.max, 20000);
});
