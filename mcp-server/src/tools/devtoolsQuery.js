import { createHash } from 'node:crypto';

// ─── Action aliases ───────────────────────────────────────────────────────────

const ACTION_ALIASES = {
  // canonical
  'start_session': 'start_session',
  'stop_session': 'stop_session',
  'clear_session': 'clear_session',
  'session': 'session',
  'get_console': 'get_console',
  'get_js_errors': 'get_js_errors',
  'get_network': 'get_network',
  'get_api_responses': 'get_api_responses',
  'get_performance': 'get_performance',
  'get_websockets': 'get_websockets',
  'replay_request': 'replay_request',
  'export_har': 'export_har',
  'evaluate': 'evaluate',
  'query_devtools': 'query_devtools',
  // dotted/camel
  'devtools.startSession': 'start_session',
  'devtools.stopSession': 'stop_session',
  'devtools.clearSession': 'clear_session',
  'devtools.session': 'session',
  'devtools.getConsole': 'get_console',
  'devtools.getJsErrors': 'get_js_errors',
  'devtools.getNetwork': 'get_network',
  'devtools.getApiResponses': 'get_api_responses',
  'devtools.getPerformance': 'get_performance',
  'devtools.getWebSockets': 'get_websockets',
  'devtools.replayRequest': 'replay_request',
  'devtools.exportHar': 'export_har',
  'devtools.evaluate': 'evaluate',
  'devtools.query': 'query_devtools',
};

export function normalizeActionName(action) {
  return ACTION_ALIASES[action] ?? action;
}

// ─── Limits ───────────────────────────────────────────────────────────────────

export const LIMITS = {
  console: { default: 100, max: 1000 },
  jsErrors: { default: 50, max: 500 },
  network: { default: 200, max: 2000 },
  apiResponses: { default: 50, max: 500 },
  graphql: { default: 50, max: 500 },
  webSockets: { default: 200, max: 2000 },
  webSocketPayload: { default: 1000, max: 10000 },
  coverage: { default: 100, max: 1000 },
  sourceMaps: { default: 100, max: 1000 },
  issues: { default: 100, max: 1000 },
  bodyChars: { default: 2000, max: 20000 },
};

// ─── Constants ────────────────────────────────────────────────────────────────

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
const SEVERITY_RANK = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };

export const ISSUE_CATEGORIES = [
  'console', 'js_error', 'network', 'api', 'graphql',
  'performance', 'security', 'websocket', 'sourcemap', 'third_party',
];

export const CONSOLE_LEVELS = ['log', 'info', 'warning', 'error', 'debug'];

const SENSITIVE_HEADERS = new Set([
  'authorization', 'cookie', 'set-cookie', 'x-api-key', 'api-key',
  'x-auth-token', 'proxy-authorization',
]);

const SENSITIVE_BODY_KEYS = /^(password|pass|token|access[_-]?token|refresh[_-]?token|id[_-]?token|secret|api[_-]?key|apikey|authorization|auth|session|cookie|otp|code|credit|card|cvv|cvc)$/i;

const SENSITIVE_QUERY_PARAMS = new Set([
  'token', 'access_token', 'refresh_token', 'key', 'api_key',
  'secret', 'password', 'session', 'auth',
]);

const THIRD_PARTY_CLASSIFICATION = [
  { category: 'analytics', patterns: [/google-analytics\.com/, /googletagmanager\.com/, /segment\.(io|com)/, /mixpanel\.com/, /amplitude\.com/, /heap\.io/, /hotjar\.com/, /fullstory\.com/, /matomo/] },
  { category: 'ads', patterns: [/doubleclick\.net/, /googlesyndication/, /adservice/, /adsystem/, /adnxs\.com/, /criteo\.com/] },
  { category: 'payments', patterns: [/stripe\.com/, /paypal\.com/, /braintreepayments/, /checkout\.com/, /adyen\.com/] },
  { category: 'cdn', patterns: [/cloudflare\.com/, /cloudfront\.net/, /akamai/, /jsdelivr\.net/, /unpkg\.com/, /cdnjs\.cloudflare/] },
  { category: 'fonts', patterns: [/fonts\.googleapis/, /fonts\.gstatic/, /typekit\.net/, /use\.typekit/] },
  { category: 'social', patterns: [/facebook\.com|fbcdn/, /twitter\.com|twimg/, /linkedin\.com/, /pinterest\.com/, /tiktok\.com/] },
  { category: 'video', patterns: [/youtube\.com|ytimg/, /vimeo\.com/, /wistia/, /jwplayer/] },
  { category: 'customer_support', patterns: [/intercom\.io/, /zendesk\.com/, /drift\.com/, /crisp\.chat/, /hubspot/] },
];

// ─── Field allowlists ─────────────────────────────────────────────────────────

export const FIELDS = {
  session: ['active', 'sessionId', 'startedAt', 'stoppedAt', 'durationMs', 'capturedConsoleCount', 'capturedNetworkCount', 'capturedApiResponseCount', 'capturedWebSocketFrameCount'],
  page: ['url', 'title', 'finalUrl', 'readyState', 'userAgent'],
  console: ['level', 'message', 'timestamp', 'source', 'url', 'line', 'column', 'stack', 'count', 'category'],
  jsErrors: ['message', 'source', 'url', 'line', 'column', 'stack', 'timestamp', 'errorType', 'severity'],
  network: ['id', 'url', 'method', 'status', 'statusText', 'type', 'resourceType', 'domain', 'thirdParty', 'startTime', 'endTime', 'durationMs', 'sizeBytes', 'transferSize', 'requestHeaders', 'responseHeaders', 'initiator', 'errorText', 'fromCache', 'protocol', 'mimeType'],
  apiResponses: ['id', 'url', 'method', 'status', 'contentType', 'durationMs', 'requestPayloadPreview', 'bodyPreview', 'jsonPreview', 'sizeBytes', 'truncated', 'error'],
  graphql: ['id', 'url', 'operationName', 'operationType', 'queryPreview', 'variablesPreview', 'responsePreview', 'errors', 'status', 'durationMs', 'sizeBytes', 'timestamp'],
  performance: ['navigationTiming', 'paintTiming', 'coreWebVitals', 'resourceSummary', 'largestRequests', 'slowestRequests', 'longTasks', 'renderBlocking', 'thirdPartyScripts', 'memory', 'domContentLoadedMs', 'loadEventMs', 'firstPaintMs', 'firstContentfulPaintMs'],
  webSockets: ['id', 'url', 'direction', 'timestamp', 'opcode', 'payloadPreview', 'sizeBytes', 'frameType'],
  coverage: ['url', 'type', 'usedBytes', 'totalBytes', 'unusedBytes', 'unusedPercent'],
  storageSummary: ['localStorageKeys', 'sessionStorageKeys', 'cookieNames', 'indexedDbNames', 'cacheStorageNames', 'includeValues'],
  sourceMaps: ['scriptUrl', 'sourceMapUrl', 'status', 'error'],
  requestChains: ['rootUrl', 'children', 'totalDurationMs', 'totalSizeBytes', 'depth', 'initiator'],
  apiInsights: ['endpoints', 'failedEndpoints', 'slowEndpoints', 'duplicateCalls', 'graphqlErrors', 'restErrors', 'unexpectedHtmlResponses', 'emptyResponses', 'malformedJsonResponses'],
  harSummary: ['totalRequests', 'totalTransferSize', 'statusCodeBreakdown', 'typeBreakdown', 'domainBreakdown', 'failedRequests', 'slowestRequests', 'largestRequests', 'cacheSummary'],
  security: ['mixedContent', 'insecureRequests', 'missingSecurityHeaders', 'corsErrors', 'cspViolations', 'blockedByCsp', 'thirdPartyDomains', 'insecureFormActions', 'sensitiveDataInUrl', 'authTokensExposed'],
  thirdParties: ['domain', 'category', 'requestCount', 'transferSize', 'scriptCount', 'slowestRequest', 'largestRequest', 'failedRequestCount'],
  issues: ['id', 'category', 'severity', 'title', 'description', 'evidence', 'fixSuggestion', 'source', 'recommendedNextAction'],
  summary: [
    'consoleMessageCount', 'consoleErrorCount', 'consoleWarningCount',
    'jsErrorCount', 'totalRequests', 'failedRequestCount', 'slowRequestCount',
    'apiRequestCount', 'failedApiCount', 'slowApiCount',
    'graphqlOperationCount', 'graphqlErrorCount',
    'totalTransferSize', 'largestRequest', 'slowestRequest',
    'thirdPartyRequestCount', 'webSocketCount', 'webSocketFrameCount',
    'sentFrameCount', 'receivedFrameCount',
    'securityIssueCount', 'issueCount', 'recommendedNextTool',
    'statusCodeBreakdown', 'typeBreakdown', 'domainBreakdown',
  ],
};

export const QUERY_MODULES = new Set([
  'session', 'page', 'console', 'jsErrors', 'network', 'apiResponses',
  'graphql', 'performance', 'webSockets', 'coverage', 'storageSummary',
  'sourceMaps', 'requestChains', 'apiInsights', 'harSummary', 'security',
  'thirdParties', 'issues', 'recommendations', 'summary', 'privacy',
]);

// ─── Presets ──────────────────────────────────────────────────────────────────

export const PRESETS = {
  debug_page: {
    session: true,
    page: true,
    console: { levels: ['error', 'warning'], limit: 100 },
    jsErrors: { includeStack: true, limit: 50 },
    network: { where: { failed: true }, fields: ['url', 'method', 'status', 'type', 'durationMs', 'errorText', 'initiator'], limit: 100 },
    performance: { fields: ['navigationTiming', 'paintTiming', 'resourceSummary'] },
    issues: true,
    summary: true,
    recommendations: true,
  },
  qa_failure_bundle: {
    session: true,
    page: true,
    console: { levels: ['error', 'warning'], limit: 100 },
    jsErrors: { includeStack: true, limit: 50 },
    network: { where: { failed: true }, fields: ['url', 'method', 'status', 'type', 'durationMs', 'errorText', 'initiator'], limit: 100 },
    apiResponses: { where: { statusGte: 400 }, fields: ['url', 'method', 'status', 'bodyPreview', 'jsonPreview'], maxBodyChars: 2000, limit: 25 },
    performance: { fields: ['navigationTiming', 'resourceSummary'] },
    security: true,
    issues: true,
    summary: true,
    recommendations: true,
  },
  js_error_debug: {
    console: { levels: ['error'], limit: 100 },
    jsErrors: { includeStack: true, fields: ['message', 'source', 'line', 'column', 'stack', 'url', 'timestamp', 'errorType'], limit: 100 },
    network: { where: { failed: true }, fields: ['url', 'method', 'status', 'type', 'durationMs', 'errorText'], limit: 50 },
    sourceMaps: true,
    issues: true,
    summary: { include: ['consoleErrorCount', 'jsErrorCount', 'failedRequestCount'] },
    recommendations: true,
  },
  network_debug: {
    network: {
      fields: ['url', 'method', 'status', 'type', 'domain', 'thirdParty', 'durationMs', 'sizeBytes', 'errorText', 'initiator'],
      limit: 300, sortBy: 'durationMs', sortOrder: 'desc',
    },
    requestChains: true,
    harSummary: true,
    thirdParties: true,
    issues: true,
    summary: { include: ['totalRequests', 'failedRequestCount', 'slowRequestCount', 'thirdPartyRequestCount', 'totalTransferSize'] },
    recommendations: true,
  },
  api_debug: {
    apiResponses: {
      where: { urlIncludes: '/api/' },
      fields: ['url', 'method', 'status', 'contentType', 'requestPayloadPreview', 'bodyPreview', 'jsonPreview', 'durationMs'],
      includeJsonPreview: true, maxBodyChars: 3000, limit: 50,
    },
    network: { where: { urlIncludes: '/api/' }, fields: ['url', 'method', 'status', 'durationMs', 'sizeBytes', 'errorText'], limit: 100 },
    apiInsights: true,
    issues: true,
    summary: { include: ['apiRequestCount', 'failedApiCount', 'slowApiCount'] },
    recommendations: true,
  },
  graphql_debug: {
    graphql: {
      fields: ['operationName', 'operationType', 'status', 'errors', 'durationMs', 'variablesPreview', 'responsePreview'],
      redactVariables: true, includeErrors: true, limit: 100,
    },
    network: { where: { urlIncludes: 'graphql' }, fields: ['url', 'method', 'status', 'durationMs', 'sizeBytes'], limit: 100 },
    apiInsights: true,
    issues: true,
    summary: true,
    recommendations: true,
  },
  performance_debug: {
    performance: { fields: ['navigationTiming', 'paintTiming', 'coreWebVitals', 'resourceSummary', 'largestRequests', 'slowestRequests', 'longTasks', 'renderBlocking', 'thirdPartyScripts'] },
    network: { fields: ['url', 'type', 'durationMs', 'sizeBytes', 'domain', 'thirdParty'], limit: 300, sortBy: 'sizeBytes', sortOrder: 'desc' },
    coverage: true,
    requestChains: true,
    harSummary: true,
    thirdParties: true,
    issues: true,
    summary: true,
    recommendations: true,
  },
  security_debug: {
    security: { fields: ['mixedContent', 'insecureRequests', 'missingSecurityHeaders', 'corsErrors', 'cspViolations', 'blockedByCsp', 'sensitiveDataInUrl', 'authTokensExposed', 'thirdPartyDomains'] },
    console: { levels: ['error', 'warning'], limit: 100 },
    network: { fields: ['url', 'method', 'status', 'type', 'domain', 'thirdParty', 'errorText'], limit: 300 },
    storageSummary: true,
    issues: true,
    summary: true,
    recommendations: true,
  },
  third_party_audit: {
    thirdParties: { fields: ['domain', 'category', 'requestCount', 'transferSize', 'scriptCount', 'slowestRequest', 'largestRequest'] },
    network: { where: { thirdParty: true }, fields: ['url', 'domain', 'type', 'durationMs', 'sizeBytes', 'status'], limit: 300 },
    performance: { fields: ['thirdPartyScripts', 'resourceSummary'] },
    issues: true,
    summary: true,
    recommendations: true,
  },
  full_diagnostics: {
    session: true,
    page: true,
    console: true,
    jsErrors: { includeStack: true },
    network: { limit: 500 },
    apiResponses: { includeJsonPreview: true, maxBodyChars: 2000, limit: 100 },
    graphql: { redactVariables: true, limit: 100 },
    performance: true,
    webSockets: { maxPayloadChars: 1000, limit: 300 },
    coverage: true,
    storageSummary: true,
    sourceMaps: true,
    requestChains: true,
    apiInsights: true,
    harSummary: true,
    security: true,
    thirdParties: true,
    issues: true,
    summary: true,
    recommendations: true,
  },
  har_summary: {
    harSummary: true,
    network: { fields: ['url', 'method', 'status', 'type', 'durationMs', 'sizeBytes', 'domain'], limit: 500 },
    summary: { include: ['totalRequests', 'statusCodeBreakdown', 'typeBreakdown', 'domainBreakdown', 'totalTransferSize'] },
  },
};

// ─── Response helpers ─────────────────────────────────────────────────────────

const TOOL_NAME = 'fileforge_devtools_action';

export function createErrorResponse(code, message, extra = {}) {
  return { ok: false, error: { code, message, ...extra }, meta: { tool: TOOL_NAME } };
}

function validationError(code, message, path, extra = {}) {
  return createErrorResponse(code, message, { path, ...extra });
}

export function createSuccessResponse(payload) {
  return {
    ok: true,
    schemaVersion: 'devtools.query.v1',
    timestamp: new Date().toISOString(),
    ...payload,
    meta: { tool: TOOL_NAME, ...(payload?.meta ?? {}) },
  };
}

// ─── Preset / query resolution ────────────────────────────────────────────────

export function resolveDevtoolsPreset(name) {
  if (!name) return null;
  const preset = PRESETS[name];
  if (!preset) {
    return { error: validationError('INVALID_PRESET', `Unknown preset '${name}'`, 'preset', { allowedPresets: Object.keys(PRESETS) }) };
  }
  return { preset: JSON.parse(JSON.stringify(preset)) };
}

function mergeShallow(base, override) {
  if (!base) return override ?? {};
  if (!override) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export function resolveDevtoolsQuery({ preset, query }) {
  if (preset) {
    const resolved = resolveDevtoolsPreset(preset);
    if (resolved.error) return resolved;
    return { query: mergeShallow(resolved.preset, query) };
  }
  return { query: query ?? { session: true, summary: true } };
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateFieldList(spec, allowed, path) {
  if (!Array.isArray(spec?.fields)) return null;
  for (let i = 0; i < spec.fields.length; i++) {
    if (!allowed.includes(spec.fields[i])) {
      return validationError('INVALID_FIELD', `Field '${spec.fields[i]}' is not allowed in ${path}.fields`, `query.${path}.fields[${i}]`, { allowedFields: allowed });
    }
  }
  return null;
}

function validateLimit(spec, key, max, path) {
  if (spec?.[key] == null) return null;
  if (typeof spec[key] !== 'number' || spec[key] < 0 || spec[key] > max) {
    return validationError('INVALID_LIMIT', `${path}.${key} must be between 0 and ${max}`, `query.${path}.${key}`);
  }
  return null;
}

export function validateDevtoolsQuery(query) {
  if (!query || typeof query !== 'object') {
    return validationError('INVALID_FIELD', 'query must be an object', 'query');
  }
  for (const key of Object.keys(query)) {
    if (!QUERY_MODULES.has(key)) {
      return validationError('INVALID_FIELD', `Unknown query module '${key}'`, `query.${key}`, { allowedModules: [...QUERY_MODULES] });
    }
    const spec = query[key];
    if (spec === true || spec === false || spec == null) continue;
    if (typeof spec !== 'object') {
      return validationError('INVALID_FIELD', `Module '${key}' must be true or an object`, `query.${key}`);
    }
    if (FIELDS[key]) {
      const err = validateFieldList(spec, FIELDS[key], key);
      if (err) return err;
    }
    if (key === 'console') {
      if (Array.isArray(spec.levels)) {
        for (let i = 0; i < spec.levels.length; i++) {
          if (!CONSOLE_LEVELS.includes(spec.levels[i])) {
            return validationError('INVALID_FILTER', `Unknown console level '${spec.levels[i]}'`, `query.console.levels[${i}]`, { allowedLevels: CONSOLE_LEVELS });
          }
        }
      }
      const err = validateLimit(spec, 'limit', LIMITS.console.max, 'console');
      if (err) return err;
    }
    if (key === 'jsErrors') { const err = validateLimit(spec, 'limit', LIMITS.jsErrors.max, 'jsErrors'); if (err) return err; }
    if (key === 'network') {
      const err = validateLimit(spec, 'limit', LIMITS.network.max, 'network');
      if (err) return err;
      if (spec.sortBy && !['startTime', 'durationMs', 'sizeBytes', 'status'].includes(spec.sortBy)) {
        return validationError('INVALID_FILTER', `Unknown network.sortBy '${spec.sortBy}'`, 'query.network.sortBy', { allowedSortBy: ['startTime', 'durationMs', 'sizeBytes', 'status'] });
      }
      if (spec.sortOrder && !['asc', 'desc'].includes(spec.sortOrder)) {
        return validationError('INVALID_FILTER', `Unknown network.sortOrder '${spec.sortOrder}'`, 'query.network.sortOrder');
      }
    }
    if (key === 'apiResponses') {
      const err = validateLimit(spec, 'limit', LIMITS.apiResponses.max, 'apiResponses');
      if (err) return err;
      const errB = validateLimit(spec, 'maxBodyChars', LIMITS.bodyChars.max, 'apiResponses');
      if (errB) return errB;
    }
    if (key === 'graphql') { const err = validateLimit(spec, 'limit', LIMITS.graphql.max, 'graphql'); if (err) return err; }
    if (key === 'webSockets') {
      const err = validateLimit(spec, 'limit', LIMITS.webSockets.max, 'webSockets');
      if (err) return err;
      const errP = validateLimit(spec, 'maxPayloadChars', LIMITS.webSocketPayload.max, 'webSockets');
      if (errP) return errP;
    }
    if (key === 'coverage') { const err = validateLimit(spec, 'limit', LIMITS.coverage.max, 'coverage'); if (err) return err; }
    if (key === 'sourceMaps') { const err = validateLimit(spec, 'limit', LIMITS.sourceMaps.max, 'sourceMaps'); if (err) return err; }
    if (key === 'issues') {
      const err = validateLimit(spec, 'limit', LIMITS.issues.max, 'issues');
      if (err) return err;
      const where = spec.where ?? {};
      if (where.severity && !SEVERITIES.includes(where.severity)) {
        return validationError('INVALID_FILTER', `Unknown severity '${where.severity}'`, 'query.issues.where.severity', { allowedSeverities: SEVERITIES });
      }
      if (Array.isArray(where.severityIn)) {
        for (let i = 0; i < where.severityIn.length; i++) {
          if (!SEVERITIES.includes(where.severityIn[i])) {
            return validationError('INVALID_FILTER', `Unknown severity '${where.severityIn[i]}'`, `query.issues.where.severityIn[${i}]`, { allowedSeverities: SEVERITIES });
          }
        }
      }
      if (where.category && !ISSUE_CATEGORIES.includes(where.category)) {
        return validationError('INVALID_FILTER', `Unknown issue category '${where.category}'`, 'query.issues.where.category', { allowedCategories: ISSUE_CATEGORIES });
      }
    }
  }
  return null;
}

// ─── Field projection ─────────────────────────────────────────────────────────

export function projectFields(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;
  if (!Array.isArray(fields) || fields.length === 0) return obj;
  const out = {};
  for (const f of fields) if (f in obj) out[f] = obj[f];
  return out;
}

function projectArray(arr, fields) {
  if (!Array.isArray(fields) || fields.length === 0) return arr;
  return arr.map((item) => projectFields(item, fields));
}

// ─── Redaction ────────────────────────────────────────────────────────────────

export function redactSensitiveHeaders(headers, opts = {}) {
  if (!headers || typeof headers !== 'object') return headers;
  if (opts.redactHeaders === false) return headers;
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(k.toLowerCase())) {
      out[k] = { value: 'redacted', valueRedacted: true };
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function redactSensitiveBody(body, opts = {}, depth = 0) {
  if (depth > 6) return '[redacted-depth]';
  if (body == null) return body;
  if (opts.redactBodies === true && typeof body === 'string') {
    return { value: 'redacted', valueRedacted: true };
  }
  if (typeof body === 'string') {
    if (opts.redactAuthTokens !== false) {
      return body.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [redacted]');
    }
    return body;
  }
  if (Array.isArray(body)) return body.map((v) => redactSensitiveBody(v, opts, depth + 1));
  if (typeof body === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(body)) {
      if (SENSITIVE_BODY_KEYS.test(k)) {
        out[k] = { value: 'redacted', valueRedacted: true };
      } else {
        out[k] = redactSensitiveBody(v, opts, depth + 1);
      }
    }
    return out;
  }
  return body;
}

export function redactSensitiveUrl(url, opts = {}) {
  if (!url) return url;
  if (opts.redactAuthTokens === false) return url;
  try {
    const u = new URL(url);
    let changed = false;
    for (const key of [...u.searchParams.keys()]) {
      if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
        u.searchParams.set(key, 'redacted');
        changed = true;
      }
    }
    return changed ? u.toString() : url;
  } catch {
    return url;
  }
}

export function truncateBody(body, maxChars) {
  if (typeof body !== 'string') return { text: body, truncated: false };
  const limit = Math.min(maxChars ?? LIMITS.bodyChars.default, LIMITS.bodyChars.max);
  if (body.length <= limit) return { text: body, truncated: false };
  return { text: body.slice(0, limit), truncated: true, originalLength: body.length, limit };
}

// ─── Classification ───────────────────────────────────────────────────────────

function safeDomain(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

function isThirdParty(url, origin) {
  if (!url || !origin) return false;
  try {
    const u = new URL(url, origin);
    const o = new URL(origin);
    return u.hostname !== o.hostname && !u.hostname.endsWith('.' + o.hostname);
  } catch { return false; }
}

export function classifyThirdPartyDomain(domain) {
  if (!domain) return 'unknown';
  for (const entry of THIRD_PARTY_CLASSIFICATION) {
    if (entry.patterns.some((re) => re.test(domain))) return entry.category;
  }
  return 'unknown';
}

export function classifyNetworkRequest(req, origin) {
  const status = req?.response?.status ?? 0;
  const failed = !!req?.failed || status >= 400;
  const domain = safeDomain(req?.url);
  return {
    failed,
    status,
    domain,
    thirdParty: isThirdParty(req?.url, origin),
    method: req?.method ?? 'GET',
    type: req?.type ?? 'Other',
    durationMs: (req?.finishedAt && req?.startedAt) ? Math.max(0, req.finishedAt - req.startedAt) : null,
    sizeBytes: req?.response?.encodedDataLength ?? req?.encodedDataLength ?? 0,
  };
}

export function classifyConsoleMessage(entry) {
  const level = entry?.level ?? 'log';
  const text = String(entry?.text ?? entry?.message ?? '');
  let category = 'general';
  if (/CORS/i.test(text)) category = 'cors';
  else if (/Content Security Policy|CSP/i.test(text)) category = 'csp';
  else if (/Mixed Content/i.test(text)) category = 'mixed_content';
  else if (/hydration/i.test(text)) category = 'hydration';
  else if (/chunk(load|s)|loading chunk/i.test(text)) category = 'chunk_load';
  else if (/Unhandled (Promise )?[Rr]ejection/i.test(text)) category = 'unhandled_rejection';
  else if (/source ?map/i.test(text)) category = 'sourcemap';
  return { level, category };
}

export function classifyApiResponse(req) {
  const contentType = String(req?.response?.headers?.['content-type'] ?? req?.response?.headers?.['Content-Type'] ?? '');
  const status = req?.response?.status ?? 0;
  return {
    isJson: /application\/json|\+json/i.test(contentType),
    isHtml: /text\/html/i.test(contentType),
    failed: status >= 400,
    empty: !(req?.body?.body),
    contentType,
  };
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export function applyFilters(items, where, mapper) {
  if (!where) return items;
  return items.filter((raw) => {
    const m = mapper(raw);
    if (where.failed != null && m.failed !== where.failed) return false;
    if (where.status != null && m.status !== where.status) return false;
    if (where.statusGte != null && (m.status ?? 0) < where.statusGte) return false;
    if (where.statusLt != null && (m.status ?? 0) >= where.statusLt) return false;
    if (where.urlIncludes && !(m.url ?? '').includes(where.urlIncludes)) return false;
    if (where.method && (m.method ?? '').toUpperCase() !== where.method.toUpperCase()) return false;
    if (where.type && m.type !== where.type) return false;
    if (where.domainIncludes && !(m.domain ?? '').includes(where.domainIncludes)) return false;
    if (where.thirdParty != null && m.thirdParty !== where.thirdParty) return false;
    if (where.slowerThanMs != null && (m.durationMs ?? 0) < where.slowerThanMs) return false;
    if (where.largerThanKb != null && (m.sizeBytes ?? 0) / 1024 < where.largerThanKb) return false;
    if (where.textIncludes && !(m.text ?? '').includes(where.textIncludes)) return false;
    if (where.direction && m.direction !== where.direction) return false;
    if (where.contentTypeIncludes && !(m.contentType ?? '').includes(where.contentTypeIncludes)) return false;
    return true;
  });
}

function truncationMeta(returned, total, limit) {
  return total > returned ? { truncated: true, returned, totalMatched: total, limit } : { truncated: false, returned, totalMatched: total };
}

// ─── Session state ────────────────────────────────────────────────────────────

async function safeRpc(rpcClient, method, params) {
  if (!rpcClient) return null;
  try {
    const res = await rpcClient.send(method, params);
    if (res?.ok === false) return null;
    return res?.data ?? res ?? null;
  } catch { return null; }
}

export async function getSessionState(rpcClient, tabId) {
  // getConsole succeeds with no session, so the probe relies on the sessionActive flag it returns.
  const probe = await safeRpc(rpcClient, 'devtools.getConsole', { tabId });
  if (!probe || probe.sessionActive === false) return { active: false };
  return {
    active: true,
    sessionId: `devtools_${createHash('sha1').update(String(tabId ?? 'active')).digest('hex').slice(0, 10)}`,
    startedAt: probe.startedAt ?? null,
    tabId: probe.tabId ?? tabId,
  };
}

// ─── Collectors ───────────────────────────────────────────────────────────────

export async function collectConsoleMessages(rpcClient, tabId, spec = {}) {
  const raw = await safeRpc(rpcClient, 'devtools.getConsole', { tabId });
  const entries = Array.isArray(raw?.entries) ? raw.entries : [];
  let mapped = entries.map((e) => {
    const cls = classifyConsoleMessage(e);
    const text = String(e.text ?? e.message ?? (Array.isArray(e.parameters) ? e.parameters.map((p) => p.value ?? p.description ?? '').join(' ') : ''));
    return {
      level: e.level ?? cls.level,
      message: text,
      timestamp: e.timestamp,
      source: e.source,
      url: e.url,
      line: e.line,
      column: e.column,
      stack: e.stackTrace ?? e.stack,
      count: e.count ?? 1,
      category: cls.category,
    };
  });
  if (spec && spec !== true) {
    if (Array.isArray(spec.levels)) mapped = mapped.filter((m) => spec.levels.includes(m.level));
    if (spec.textIncludes) mapped = mapped.filter((m) => (m.message ?? '').includes(spec.textIncludes));
  }
  const limit = Math.min(spec?.limit ?? LIMITS.console.default, LIMITS.console.max);
  const total = mapped.length;
  mapped = mapped.slice(0, limit);
  const fields = (spec && spec !== true && spec.fields) || null;
  return { items: projectArray(mapped, fields), meta: truncationMeta(mapped.length, total, limit) };
}

export async function collectJsErrors(rpcClient, tabId, spec = {}) {
  const raw = await safeRpc(rpcClient, 'devtools.getJsErrors', { tabId });
  const errors = Array.isArray(raw?.errors) ? raw.errors : [];
  let mapped = errors.map((e) => ({
    message: e.text ?? e.message ?? e.exception?.description,
    source: e.url ?? e.scriptId,
    url: e.url,
    line: e.lineNumber ?? e.line,
    column: e.columnNumber ?? e.column,
    stack: (spec === true || spec?.includeStack !== false) ? (e.stackTrace ?? e.stack ?? e.exception?.stackTrace) : undefined,
    timestamp: e.timestamp,
    errorType: e.exception?.className ?? e.errorType,
    severity: 'high',
  }));
  const limit = Math.min(spec?.limit ?? LIMITS.jsErrors.default, LIMITS.jsErrors.max);
  const total = mapped.length;
  mapped = mapped.slice(0, limit);
  const fields = (spec && spec !== true && spec.fields) || null;
  return { items: projectArray(mapped, fields), meta: truncationMeta(mapped.length, total, limit) };
}

export async function collectNetworkRequests(rpcClient, tabId, spec = {}, ctx = {}) {
  const raw = await safeRpc(rpcClient, 'devtools.getNetwork', { tabId });
  const requests = Array.isArray(raw?.requests) ? raw.requests : [];
  const origin = ctx.origin ?? (raw?.tabUrl ? safeOrigin(raw.tabUrl) : null);
  let mapped = requests.map((r) => {
    const cls = classifyNetworkRequest(r, origin);
    return {
      id: r.requestId,
      url: ctx.privacy ? redactSensitiveUrl(r.url, ctx.privacy) : r.url,
      method: r.method,
      status: r.response?.status,
      statusText: r.response?.statusText,
      type: r.type,
      resourceType: r.type,
      domain: cls.domain,
      thirdParty: cls.thirdParty,
      startTime: r.startedAt,
      endTime: r.finishedAt,
      durationMs: cls.durationMs,
      sizeBytes: cls.sizeBytes,
      transferSize: r.response?.encodedDataLength,
      requestHeaders: redactSensitiveHeaders(r.requestHeaders, ctx.privacy),
      responseHeaders: redactSensitiveHeaders(r.response?.headers, ctx.privacy),
      initiator: r.initiator,
      errorText: r.failed?.errorText,
      fromCache: r.response?.fromDiskCache || r.response?.fromServiceWorker,
      protocol: r.response?.protocol,
      mimeType: r.response?.mimeType,
      _failed: cls.failed,
    };
  });
  if (spec && spec !== true && spec.where) {
    mapped = applyFilters(mapped, spec.where, (m) => ({
      failed: m._failed, status: m.status, url: m.url, method: m.method,
      type: m.type, domain: m.domain, thirdParty: m.thirdParty,
      durationMs: m.durationMs, sizeBytes: m.sizeBytes,
    }));
  }
  // Sort
  const sortBy = (spec && spec !== true && spec.sortBy) || null;
  if (sortBy) {
    const order = (spec.sortOrder ?? 'desc') === 'asc' ? 1 : -1;
    mapped.sort((a, b) => ((a[sortBy] ?? 0) - (b[sortBy] ?? 0)) * order);
  }
  const limit = Math.min(spec?.limit ?? LIMITS.network.default, LIMITS.network.max);
  const total = mapped.length;
  mapped = mapped.slice(0, limit);
  for (const item of mapped) delete item._failed;
  const fields = (spec && spec !== true && spec.fields) || null;
  return { items: projectArray(mapped, fields), raw: requests, meta: truncationMeta(mapped.length, total, limit) };
}

function safeOrigin(url) { try { return new URL(url).origin; } catch { return null; } }

function isGraphqlRequest(req) {
  const url = String(req?.url ?? '');
  if (/graphql/i.test(url)) return true;
  const postData = req?.postData;
  if (typeof postData === 'string' && /"query"\s*:/.test(postData)) return true;
  return false;
}

function parseJsonSafe(text) {
  if (typeof text !== 'string') return { json: null, malformed: false };
  try { return { json: JSON.parse(text), malformed: false }; }
  catch { return { json: null, malformed: true }; }
}

export async function collectApiResponses(rpcClient, tabId, spec = {}, ctx = {}) {
  const includeBodies = (spec === true || spec?.includeBody !== false);
  const raw = await safeRpc(rpcClient, 'devtools.getApiResponses', { tabId, includeBodies });
  const responses = Array.isArray(raw?.responses) ? raw.responses : [];
  const maxBodyChars = Math.min(spec?.maxBodyChars ?? LIMITS.bodyChars.default, LIMITS.bodyChars.max);
  let mapped = responses.map((r) => {
    const cls = classifyApiResponse(r);
    const bodyText = typeof r.body?.body === 'string' ? r.body.body : null;
    const truncated = bodyText ? truncateBody(bodyText, maxBodyChars) : { text: null, truncated: false };
    const parsed = bodyText && cls.isJson ? parseJsonSafe(bodyText) : { json: null, malformed: false };
    return {
      id: r.requestId,
      url: ctx.privacy ? redactSensitiveUrl(r.url, ctx.privacy) : r.url,
      method: r.method,
      status: r.response?.status,
      contentType: cls.contentType,
      durationMs: (r.finishedAt && r.startedAt) ? Math.max(0, r.finishedAt - r.startedAt) : null,
      requestPayloadPreview: typeof r.postData === 'string' ? truncateBody(r.postData, maxBodyChars).text : undefined,
      bodyPreview: includeBodies ? truncated.text : undefined,
      jsonPreview: (spec?.includeJsonPreview !== false && parsed.json) ? redactSensitiveBody(parsed.json, ctx.privacy ?? {}) : undefined,
      sizeBytes: r.response?.encodedDataLength ?? 0,
      truncated: truncated.truncated,
      error: r.failed?.errorText ?? (parsed.malformed ? 'malformed_json' : undefined),
      _failed: cls.failed,
      _isHtml: cls.isHtml,
      _empty: cls.empty,
      _malformed: parsed.malformed,
    };
  });
  if (spec && spec !== true && spec.where) {
    mapped = applyFilters(mapped, spec.where, (m) => ({
      failed: m._failed, status: m.status, url: m.url, method: m.method,
      contentType: m.contentType,
    }));
    if (spec.where.jsonPathExists) {
      mapped = mapped.filter((m) => jsonPathExists(m.jsonPreview, spec.where.jsonPathExists));
    }
  }
  const limit = Math.min(spec?.limit ?? LIMITS.apiResponses.default, LIMITS.apiResponses.max);
  const total = mapped.length;
  mapped = mapped.slice(0, limit);
  const fields = (spec && spec !== true && spec.fields) || null;
  // strip internals after filtering
  for (const item of mapped) { delete item._failed; delete item._isHtml; delete item._empty; delete item._malformed; }
  return { items: projectArray(mapped, fields), raw: responses, meta: truncationMeta(mapped.length, total, limit) };
}

function jsonPathExists(obj, path) {
  if (!obj || !path) return false;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return false;
    cur = cur[p];
  }
  return cur !== undefined;
}

export async function collectGraphqlOperations(rpcClient, tabId, spec = {}, ctx = {}) {
  const raw = await safeRpc(rpcClient, 'devtools.getApiResponses', { tabId, includeBodies: true });
  const responses = Array.isArray(raw?.responses) ? raw.responses : [];
  const gqlRequests = responses.filter(isGraphqlRequest);
  const maxBodyChars = Math.min(spec?.maxBodyChars ?? 1000, LIMITS.bodyChars.max);
  let mapped = gqlRequests.map((r) => {
    let operationName, operationType, queryPreview, variables;
    try {
      const parsed = typeof r.postData === 'string' ? JSON.parse(r.postData) : (r.postData ?? {});
      operationName = parsed.operationName;
      const queryStr = parsed.query ?? '';
      const m = /^\s*(query|mutation|subscription)\b/i.exec(queryStr);
      operationType = m ? m[1].toLowerCase() : 'query';
      queryPreview = truncateBody(queryStr, maxBodyChars).text;
      variables = parsed.variables;
    } catch { /* ignore */ }
    const respText = r.body?.body;
    const parsedResp = typeof respText === 'string' ? parseJsonSafe(respText) : { json: null };
    const errors = parsedResp.json?.errors;
    return {
      id: r.requestId,
      url: ctx.privacy ? redactSensitiveUrl(r.url, ctx.privacy) : r.url,
      operationName,
      operationType,
      queryPreview,
      variablesPreview: (spec?.redactVariables !== false) ? redactSensitiveBody(variables ?? null, ctx.privacy ?? {}) : variables,
      responsePreview: typeof respText === 'string' ? truncateBody(respText, maxBodyChars).text : null,
      errors: (spec?.includeErrors !== false) ? errors : undefined,
      status: r.response?.status,
      durationMs: (r.finishedAt && r.startedAt) ? Math.max(0, r.finishedAt - r.startedAt) : null,
      sizeBytes: r.response?.encodedDataLength,
      timestamp: r.startedAt,
    };
  });
  const limit = Math.min(spec?.limit ?? LIMITS.graphql.default, LIMITS.graphql.max);
  const total = mapped.length;
  mapped = mapped.slice(0, limit);
  const fields = (spec && spec !== true && spec.fields) || null;
  return { items: projectArray(mapped, fields), meta: truncationMeta(mapped.length, total, limit) };
}

export async function collectPerformanceMetrics(rpcClient, tabId, spec = {}, ctx = {}) {
  const raw = await safeRpc(rpcClient, 'devtools.getPerformance', { tabId });
  const cwv = raw?.computedMetrics ?? {};
  const timing = raw?.timing ?? {};
  const nav = timing.navigation?.[0] ?? {};
  const paint = timing.paint ?? [];
  const requests = ctx.network?.raw ?? [];
  const resources = requests.map((r) => ({
    url: r.url, type: r.type,
    durationMs: (r.finishedAt && r.startedAt) ? r.finishedAt - r.startedAt : 0,
    sizeBytes: r.response?.encodedDataLength ?? 0,
  }));
  const data = {
    navigationTiming: nav,
    paintTiming: paint,
    coreWebVitals: { LCP: cwv.lcp, FCP: cwv.fcp, CLS: cwv.cls, TBT: cwv.tbt, TTFB: cwv.ttfb },
    resourceSummary: {
      requestCount: resources.length,
      totalTransferSize: resources.reduce((s, r) => s + r.sizeBytes, 0),
    },
    largestRequests: [...resources].sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, 10),
    slowestRequests: [...resources].sort((a, b) => b.durationMs - a.durationMs).slice(0, 10),
    longTasks: timing.longTasks ?? [],
    renderBlocking: requests.filter((r) => ['Script', 'Stylesheet'].includes(r.type)).map((r) => ({ url: r.url, type: r.type })).slice(0, 20),
    thirdPartyScripts: requests.filter((r) => r.type === 'Script' && isThirdParty(r.url, ctx.origin)).map((r) => r.url).slice(0, 30),
    memory: raw?.metrics?.metrics?.find?.((m) => m.name === 'JSHeapUsedSize')?.value,
    domContentLoadedMs: cwv.domContentLoaded,
    loadEventMs: cwv.load,
    firstPaintMs: cwv.fp,
    firstContentfulPaintMs: cwv.fcp,
  };
  const fields = (spec && spec !== true && spec.fields) || null;
  return { data: projectFields(data, fields) };
}

export async function collectWebSocketFrames(rpcClient, tabId, spec = {}, ctx = {}) {
  const raw = await safeRpc(rpcClient, 'devtools.getWebSockets', { tabId });
  const frames = Array.isArray(raw?.websockets) ? raw.websockets : [];
  const maxPayloadChars = Math.min(spec?.maxPayloadChars ?? LIMITS.webSocketPayload.default, LIMITS.webSocketPayload.max);
  let mapped = frames.map((f) => {
    const direction = /FrameSent/i.test(f.method) ? 'sent' : /FrameReceived/i.test(f.method) ? 'received' : 'meta';
    const payload = f.response?.payloadData ?? f.frame?.payloadData ?? null;
    return {
      id: f.requestId,
      url: ctx.privacy ? redactSensitiveUrl(f.url, ctx.privacy) : f.url,
      direction,
      timestamp: f.timestamp,
      opcode: f.response?.opcode ?? f.frame?.opcode,
      payloadPreview: typeof payload === 'string' ? truncateBody(payload, maxPayloadChars).text : payload,
      sizeBytes: typeof payload === 'string' ? payload.length : 0,
      frameType: f.method,
    };
  });
  if (spec && spec !== true && spec.where) {
    mapped = applyFilters(mapped, spec.where, (m) => ({
      url: m.url, direction: m.direction, text: m.payloadPreview,
    }));
  }
  const limit = Math.min(spec?.limit ?? LIMITS.webSockets.default, LIMITS.webSockets.max);
  const total = mapped.length;
  mapped = mapped.slice(0, limit);
  const fields = (spec && spec !== true && spec.fields) || null;
  return { items: projectArray(mapped, fields), meta: truncationMeta(mapped.length, total, limit) };
}

export function collectCoverage(_ctx, spec = {}) {
  // Coverage data is not currently captured by the extension; return empty.
  const items = [];
  const fields = (spec && spec !== true && spec.fields) || null;
  return { items: projectArray(items, fields), meta: { truncated: false, returned: 0, totalMatched: 0 } };
}

export function collectStorageSummary(_ctx, spec = {}) {
  // Storage summary keys-only by default; never include values.
  const data = {
    localStorageKeys: [],
    sessionStorageKeys: [],
    cookieNames: [],
    indexedDbNames: [],
    cacheStorageNames: [],
    includeValues: false,
  };
  const fields = (spec && spec !== true && spec.fields) || null;
  return { data: projectFields(data, fields) };
}

export function collectSourceMaps(ctx, spec = {}) {
  const requests = ctx.network?.raw ?? [];
  const items = requests
    .filter((r) => r.type === 'Script')
    .map((r) => ({
      scriptUrl: r.url,
      sourceMapUrl: r.response?.headers?.['SourceMap'] ?? r.response?.headers?.['sourcemap'] ?? r.response?.headers?.['X-SourceMap'] ?? null,
      status: r.response?.status ?? null,
      error: null,
    }))
    .slice(0, Math.min(spec?.limit ?? LIMITS.sourceMaps.default, LIMITS.sourceMaps.max));
  const fields = (spec && spec !== true && spec.fields) || null;
  return { items: projectArray(items, fields), meta: { truncated: false, returned: items.length, totalMatched: items.length } };
}

// ─── Synthesizers ─────────────────────────────────────────────────────────────

export function buildRequestChains(ctx, spec = {}) {
  const requests = ctx.network?.raw ?? [];
  const byId = new Map(requests.map((r) => [r.requestId, r]));
  const chains = [];
  for (const r of requests) {
    const initiatorUrl = r.initiator?.url ?? r.initiator?.stack?.callFrames?.[0]?.url;
    if (!initiatorUrl) {
      chains.push({
        rootUrl: r.url,
        children: requests.filter((c) => c.initiator?.url === r.url).map((c) => c.url).slice(0, 20),
        totalDurationMs: (r.finishedAt && r.startedAt) ? r.finishedAt - r.startedAt : 0,
        totalSizeBytes: r.response?.encodedDataLength ?? 0,
        depth: 1,
        initiator: r.initiator?.type ?? null,
      });
    }
  }
  const limit = Math.min(spec?.limit ?? 50, 500);
  const items = chains.slice(0, limit);
  const fields = (spec && spec !== true && spec.fields) || null;
  return { items: projectArray(items, fields) };
}

export function buildApiInsights(ctx, spec = {}) {
  const apiItems = ctx.apiResponses?.raw ?? [];
  const endpoints = {};
  const failed = [];
  const slow = [];
  const duplicates = [];
  const seen = new Map();
  for (const r of apiItems) {
    const key = `${r.method} ${r.url}`;
    endpoints[key] = (endpoints[key] ?? 0) + 1;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if ((r.response?.status ?? 0) >= 400) failed.push({ url: r.url, status: r.response?.status });
    const dur = (r.finishedAt && r.startedAt) ? r.finishedAt - r.startedAt : 0;
    if (dur > 1000) slow.push({ url: r.url, durationMs: dur });
  }
  for (const [key, count] of seen) if (count > 1) duplicates.push({ key, count });
  const data = {
    endpoints: Object.entries(endpoints).map(([endpoint, count]) => ({ endpoint, count })),
    failedEndpoints: failed,
    slowEndpoints: slow,
    duplicateCalls: duplicates,
    graphqlErrors: (ctx.graphql?.items ?? []).filter((g) => g.errors).length,
    restErrors: failed.length,
    unexpectedHtmlResponses: apiItems.filter((r) => /text\/html/i.test(r.response?.headers?.['content-type'] ?? '')).length,
    emptyResponses: apiItems.filter((r) => !r.body?.body).length,
    malformedJsonResponses: 0,
  };
  const fields = (spec && spec !== true && spec.fields) || null;
  return { data: projectFields(data, fields) };
}

export function buildHarSummary(ctx, spec = {}) {
  const requests = ctx.network?.raw ?? [];
  const statusCodeBreakdown = {};
  const typeBreakdown = {};
  const domainBreakdown = {};
  let totalTransferSize = 0;
  for (const r of requests) {
    const s = r.response?.status ?? 0;
    const bucket = s ? `${Math.floor(s / 100)}xx` : 'unknown';
    statusCodeBreakdown[bucket] = (statusCodeBreakdown[bucket] ?? 0) + 1;
    typeBreakdown[r.type ?? 'Other'] = (typeBreakdown[r.type ?? 'Other'] ?? 0) + 1;
    const dom = safeDomain(r.url);
    if (dom) domainBreakdown[dom] = (domainBreakdown[dom] ?? 0) + 1;
    totalTransferSize += r.response?.encodedDataLength ?? 0;
  }
  const data = {
    totalRequests: requests.length,
    totalTransferSize,
    statusCodeBreakdown,
    typeBreakdown,
    domainBreakdown,
    failedRequests: requests.filter((r) => r.failed || (r.response?.status ?? 0) >= 400).length,
    slowestRequests: [...requests].sort((a, b) => ((b.finishedAt ?? 0) - (b.startedAt ?? 0)) - ((a.finishedAt ?? 0) - (a.startedAt ?? 0))).slice(0, 10).map((r) => ({ url: r.url, durationMs: (r.finishedAt ?? 0) - (r.startedAt ?? 0) })),
    largestRequests: [...requests].sort((a, b) => (b.response?.encodedDataLength ?? 0) - (a.response?.encodedDataLength ?? 0)).slice(0, 10).map((r) => ({ url: r.url, sizeBytes: r.response?.encodedDataLength ?? 0 })),
    cacheSummary: { fromCache: requests.filter((r) => r.response?.fromDiskCache || r.response?.fromServiceWorker).length },
  };
  const fields = (spec && spec !== true && spec.fields) || null;
  return { data: projectFields(data, fields) };
}

export function buildSecuritySummary(ctx, spec = {}) {
  const requests = ctx.network?.raw ?? [];
  const origin = ctx.origin;
  const console_ = ctx.console?.items ?? [];
  const mixedContent = requests
    .filter((r) => origin?.startsWith('https://') && (r.url ?? '').startsWith('http://'))
    .map((r) => r.url);
  const insecureRequests = requests.filter((r) => (r.url ?? '').startsWith('http://')).map((r) => r.url);
  const corsErrors = console_.filter((e) => e.category === 'cors').map((e) => e.message).slice(0, 20);
  const cspViolations = console_.filter((e) => e.category === 'csp').map((e) => e.message).slice(0, 20);
  const sensitiveDataInUrl = [];
  const authTokensExposed = [];
  for (const r of requests) {
    try {
      const u = new URL(r.url);
      for (const k of u.searchParams.keys()) {
        if (SENSITIVE_QUERY_PARAMS.has(k.toLowerCase())) {
          sensitiveDataInUrl.push({ url: r.url, param: k });
          if (/token|auth/i.test(k)) authTokensExposed.push({ url: r.url, param: k });
        }
      }
    } catch { /* ignore */ }
  }
  const data = {
    mixedContent: mixedContent.slice(0, 50),
    insecureRequests: insecureRequests.slice(0, 50),
    missingSecurityHeaders: [],
    corsErrors,
    cspViolations,
    blockedByCsp: cspViolations.length,
    thirdPartyDomains: [...new Set(requests.filter((r) => isThirdParty(r.url, origin)).map((r) => safeDomain(r.url)).filter(Boolean))],
    insecureFormActions: [],
    sensitiveDataInUrl,
    authTokensExposed,
  };
  const fields = (spec && spec !== true && spec.fields) || null;
  return { data: projectFields(data, fields) };
}

export function buildThirdPartySummary(ctx, spec = {}) {
  const requests = ctx.network?.raw ?? [];
  const origin = ctx.origin;
  const byDomain = new Map();
  for (const r of requests) {
    if (!isThirdParty(r.url, origin)) continue;
    const domain = safeDomain(r.url);
    if (!domain) continue;
    const cur = byDomain.get(domain) ?? {
      domain,
      category: classifyThirdPartyDomain(domain),
      requestCount: 0,
      transferSize: 0,
      scriptCount: 0,
      slowestRequest: null,
      largestRequest: null,
      failedRequestCount: 0,
    };
    cur.requestCount += 1;
    cur.transferSize += r.response?.encodedDataLength ?? 0;
    if (r.type === 'Script') cur.scriptCount += 1;
    const dur = (r.finishedAt ?? 0) - (r.startedAt ?? 0);
    if (!cur.slowestRequest || dur > cur.slowestRequest.durationMs) cur.slowestRequest = { url: r.url, durationMs: dur };
    const sz = r.response?.encodedDataLength ?? 0;
    if (!cur.largestRequest || sz > cur.largestRequest.sizeBytes) cur.largestRequest = { url: r.url, sizeBytes: sz };
    if (r.failed || (r.response?.status ?? 0) >= 400) cur.failedRequestCount += 1;
    byDomain.set(domain, cur);
  }
  const items = [...byDomain.values()].sort((a, b) => b.transferSize - a.transferSize);
  const fields = (spec && spec !== true && spec.fields) || null;
  return { items: projectArray(items, fields) };
}

// ─── Issues ───────────────────────────────────────────────────────────────────

function stableIssueId(category, title, evidence) {
  const seed = JSON.stringify([category, title, evidence?.url, evidence?.status]);
  return `${category}_${createHash('sha1').update(seed).digest('hex').slice(0, 10)}`;
}

function makeIssue({ category, severity, title, description, evidence, fixSuggestion, source, recommendedNextAction }) {
  const sev = SEVERITIES.includes(severity) ? severity : 'medium';
  return {
    id: stableIssueId(category, title, evidence),
    category,
    severity: sev,
    title,
    description: description ?? title,
    evidence: evidence ?? {},
    fixSuggestion: fixSuggestion ?? null,
    source: source ?? category,
    recommendedNextAction: recommendedNextAction ?? null,
  };
}

export function buildDevtoolsIssues(ctx) {
  const issues = [];
  // Console errors
  for (const e of (ctx.console?.items ?? []).filter((m) => m.level === 'error').slice(0, 20)) {
    issues.push(makeIssue({
      category: 'console', severity: 'high',
      title: 'Console error',
      description: String(e.message ?? '').slice(0, 240),
      evidence: { message: e.message, source: e.source },
      source: 'console',
      recommendedNextAction: { tool: TOOL_NAME, action: 'query_devtools', preset: 'js_error_debug' },
    }));
  }
  // JS errors
  for (const e of (ctx.jsErrors?.items ?? []).slice(0, 20)) {
    issues.push(makeIssue({
      category: 'js_error', severity: 'high',
      title: e.errorType ? `${e.errorType}: ${e.message ?? ''}`.slice(0, 120) : 'Uncaught JS error',
      evidence: { message: e.message, url: e.url, line: e.line, column: e.column },
      source: 'js_error',
      recommendedNextAction: { tool: TOOL_NAME, action: 'query_devtools', preset: 'js_error_debug' },
    }));
  }
  // Network failures
  const requests = ctx.network?.raw ?? [];
  for (const r of requests.filter((q) => q.failed || (q.response?.status ?? 0) >= 400).slice(0, 20)) {
    const status = r.response?.status ?? 0;
    issues.push(makeIssue({
      category: status >= 400 && /\/api\/|graphql/i.test(r.url ?? '') ? 'api' : 'network',
      severity: status >= 500 ? 'high' : status >= 400 ? 'medium' : 'high',
      title: status ? `Request failed with ${status}` : 'Request failed',
      evidence: { url: r.url, method: r.method, status },
      fixSuggestion: status >= 500 ? 'Check server logs.' : 'Verify request URL and parameters.',
      source: 'network',
      recommendedNextAction: { tool: TOOL_NAME, action: 'query_devtools', preset: 'api_debug' },
    }));
  }
  // GraphQL errors
  for (const g of (ctx.graphql?.items ?? []).filter((x) => x.errors)) {
    issues.push(makeIssue({
      category: 'graphql', severity: 'high',
      title: `GraphQL errors in ${g.operationName ?? 'operation'}`,
      evidence: { url: g.url, errors: g.errors },
      source: 'graphql',
      recommendedNextAction: { tool: TOOL_NAME, action: 'query_devtools', preset: 'graphql_debug' },
    }));
  }
  // Mixed content
  const security = ctx.security?.data;
  if (security?.mixedContent?.length) {
    issues.push(makeIssue({
      category: 'security', severity: 'high',
      title: `${security.mixedContent.length} mixed-content request(s)`,
      evidence: { count: security.mixedContent.length },
      source: 'security',
    }));
  }
  if (security?.authTokensExposed?.length) {
    issues.push(makeIssue({
      category: 'security', severity: 'critical',
      title: 'Auth tokens exposed in URL',
      evidence: { count: security.authTokensExposed.length },
      source: 'security',
    }));
  }
  return issues;
}

export function applyIssueFilters(issues, spec) {
  if (!spec || spec === true) return issues.slice(0, LIMITS.issues.default);
  const where = spec.where ?? {};
  let out = issues.filter((it) => {
    if (where.category && it.category !== where.category) return false;
    if (Array.isArray(where.categoryIn) && !where.categoryIn.includes(it.category)) return false;
    if (where.severity && it.severity !== where.severity) return false;
    if (Array.isArray(where.severityIn) && !where.severityIn.includes(it.severity)) return false;
    return true;
  });
  out.sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0));
  const limit = Math.min(spec.limit ?? LIMITS.issues.default, LIMITS.issues.max);
  out = out.slice(0, limit);
  if (Array.isArray(spec.fields) && spec.fields.length) {
    out = out.map((it) => projectFields(it, spec.fields));
  }
  return out;
}

export function buildDevtoolsRecommendations(ctx, spec = {}) {
  const recs = [];
  const issues = ctx.issuesAll ?? [];
  const includeFixes = spec?.includeFixes !== false;
  const includeNextTool = spec?.includeNextTool !== false;
  // Pick top issues
  for (const it of [...issues].sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0)).slice(0, 5)) {
    recs.push({
      title: it.title,
      severity: it.severity,
      evidence: it.evidence,
      ...(includeFixes && it.fixSuggestion ? { fixSuggestion: it.fixSuggestion } : {}),
      ...(includeNextTool && it.recommendedNextAction ? { suggestedNextAction: it.recommendedNextAction } : {}),
    });
  }
  // Cross-tool hints
  if ((ctx.network?.raw ?? []).some((r) => (r.finishedAt - r.startedAt) > 1500)) {
    recs.push({
      title: 'Investigate slow resources',
      severity: 'medium',
      suggestedNextAction: { tool: 'fileforge_perf_action' },
    });
  }
  return recs;
}

export function buildDevtoolsSummary(ctx, spec = {}) {
  const consoleItems = ctx.console?.items ?? [];
  const requests = ctx.network?.raw ?? [];
  const apiItems = ctx.apiResponses?.raw ?? [];
  const gqlItems = ctx.graphql?.items ?? [];
  const wsItems = ctx.webSockets?.items ?? [];
  const issues = ctx.issuesAll ?? [];
  const slowMs = 1500;
  const failedRequests = requests.filter((r) => r.failed || (r.response?.status ?? 0) >= 400);
  const slowRequests = requests.filter((r) => (r.finishedAt - r.startedAt) > slowMs);
  const apiSlow = apiItems.filter((r) => (r.finishedAt - r.startedAt) > slowMs);
  const apiFailed = apiItems.filter((r) => (r.response?.status ?? 0) >= 400);
  const totalTransferSize = requests.reduce((s, r) => s + (r.response?.encodedDataLength ?? 0), 0);
  const largest = [...requests].sort((a, b) => (b.response?.encodedDataLength ?? 0) - (a.response?.encodedDataLength ?? 0))[0];
  const slowest = [...requests].sort((a, b) => ((b.finishedAt ?? 0) - (b.startedAt ?? 0)) - ((a.finishedAt ?? 0) - (a.startedAt ?? 0)))[0];
  const statusCodeBreakdown = {};
  const typeBreakdown = {};
  const domainBreakdown = {};
  for (const r of requests) {
    const s = r.response?.status ?? 0;
    statusCodeBreakdown[s ? `${Math.floor(s / 100)}xx` : 'unknown'] = (statusCodeBreakdown[s ? `${Math.floor(s / 100)}xx` : 'unknown'] ?? 0) + 1;
    typeBreakdown[r.type ?? 'Other'] = (typeBreakdown[r.type ?? 'Other'] ?? 0) + 1;
    const d = safeDomain(r.url);
    if (d) domainBreakdown[d] = (domainBreakdown[d] ?? 0) + 1;
  }
  const data = {
    consoleMessageCount: consoleItems.length,
    consoleErrorCount: consoleItems.filter((m) => m.level === 'error').length,
    consoleWarningCount: consoleItems.filter((m) => m.level === 'warning').length,
    jsErrorCount: (ctx.jsErrors?.items ?? []).length,
    totalRequests: requests.length,
    failedRequestCount: failedRequests.length,
    slowRequestCount: slowRequests.length,
    apiRequestCount: apiItems.length,
    failedApiCount: apiFailed.length,
    slowApiCount: apiSlow.length,
    graphqlOperationCount: gqlItems.length,
    graphqlErrorCount: gqlItems.filter((g) => g.errors).length,
    totalTransferSize,
    largestRequest: largest ? { url: largest.url, sizeBytes: largest.response?.encodedDataLength ?? 0 } : null,
    slowestRequest: slowest ? { url: slowest.url, durationMs: (slowest.finishedAt ?? 0) - (slowest.startedAt ?? 0) } : null,
    thirdPartyRequestCount: requests.filter((r) => isThirdParty(r.url, ctx.origin)).length,
    webSocketCount: new Set(wsItems.map((w) => w.id)).size,
    webSocketFrameCount: wsItems.length,
    sentFrameCount: wsItems.filter((w) => w.direction === 'sent').length,
    receivedFrameCount: wsItems.filter((w) => w.direction === 'received').length,
    securityIssueCount: issues.filter((i) => i.category === 'security').length,
    issueCount: issues.length,
    recommendedNextTool: failedRequests.length ? 'fileforge_api_action' : slowRequests.length ? 'fileforge_perf_action' : null,
    statusCodeBreakdown,
    typeBreakdown,
    domainBreakdown,
  };
  if (spec && spec !== true && Array.isArray(spec.include)) {
    const out = {};
    for (const k of spec.include) if (k in data) out[k] = data[k];
    return out;
  }
  return data;
}

// ─── Evaluate / Replay safety ─────────────────────────────────────────────────

const DANGEROUS_PATTERNS = [
  /document\.cookie/i,
  /localStorage/i,
  /sessionStorage/i,
  /indexedDB/i,
  /fetch\s*\(\s*[^)]*\bmethod\s*:\s*['"](POST|PUT|PATCH|DELETE)['"]/i,
  /\.submit\s*\(/i,
  /\beval\s*\(/i,
  /new\s+Function\s*\(/i,
  /input\[type=['"]?password/i,
];

export function validateEvaluate(p) {
  if (!p.expression) {
    return { error: createErrorResponse('INVALID_FIELD', 'expression is required for evaluate') };
  }
  if (p.allowDangerous === true) return { ok: true };
  for (const re of DANGEROUS_PATTERNS) {
    if (re.test(p.expression)) {
      return { error: createErrorResponse('EVALUATE_BLOCKED', `Expression matches a dangerous pattern: ${re}. Pass allowDangerous: true to override.`, { pattern: String(re) }) };
    }
  }
  return { ok: true };
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const HIGH_RISK_URL_PATTERNS = [/checkout/i, /payment/i, /\/auth\//i, /login/i, /signup/i];

export function classifyReplayRisk({ method, url }) {
  const m = (method ?? 'GET').toUpperCase();
  if (HIGH_RISK_URL_PATTERNS.some((re) => re.test(url ?? ''))) return 'high';
  if (UNSAFE_METHODS.has(m)) return 'high';
  if (/\/api\/|graphql/i.test(url ?? '')) return 'medium';
  return 'low';
}

export function validateReplay(p, request) {
  const method = (p.overrides?.method ?? request?.method ?? 'GET').toUpperCase();
  const url = p.overrides?.url ?? request?.url ?? '';
  const risk = classifyReplayRisk({ method, url });
  if (risk === 'high' && p.allowUnsafeMethods !== true) {
    return { error: createErrorResponse('REPLAY_BLOCKED', `Replay blocked: ${method} ${url} is high risk. Pass allowUnsafeMethods: true to override.`, { risk, method }) };
  }
  return { ok: true, risk };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleQueryDevtools(p, { rpcClient } = {}) {
  // Resolve preset/query
  const queryRes = resolveDevtoolsQuery({ preset: p.preset, query: p.query });
  if (queryRes.error) return queryRes.error;
  const query = queryRes.query;

  const validation = validateDevtoolsQuery(query);
  if (validation) return validation;

  const tabId = p.tabId ?? 'active';
  const privacy = mergeShallow(
    { redactHeaders: true, redactBodies: false, redactAuthTokens: true, maxBodyChars: LIMITS.bodyChars.default },
    query.privacy ?? {},
  );

  // Auto-start session if requested and not active
  let sessionState = await getSessionState(rpcClient, tabId);
  if (!sessionState.active) {
    if (p.autoStartSession === true) {
      const started = await safeRpc(rpcClient, 'devtools.startSession', { tabId });
      if (!started) return createErrorResponse('CAPTURE_FAILED', 'Auto-start session failed.');
      const waitMs = Math.max(0, Math.min(p.captureForMs ?? 2000, 60000));
      if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
      sessionState = await getSessionState(rpcClient, tabId);
    } else {
      return createErrorResponse('SESSION_NOT_STARTED', 'No active DevTools session. Start a session first or pass autoStartSession: true.', {
        recommendedNextAction: { tool: TOOL_NAME, action: 'start_session', tabId },
      });
    }
  }

  // Page info from network's tabUrl (cheap)
  const netRaw = await safeRpc(rpcClient, 'devtools.getNetwork', { tabId });
  const tabUrl = netRaw?.tabUrl;
  const origin = tabUrl ? safeOrigin(tabUrl) : null;

  const ctx = { rpcClient, tabId, origin, privacy };

  // Run collectors only for requested modules
  if (query.console) ctx.console = await collectConsoleMessages(rpcClient, tabId, query.console === true ? {} : query.console);
  if (query.jsErrors) ctx.jsErrors = await collectJsErrors(rpcClient, tabId, query.jsErrors === true ? {} : query.jsErrors);
  if (query.network || query.performance || query.requestChains || query.harSummary || query.security || query.thirdParties || query.sourceMaps || query.summary || query.issues || query.recommendations) {
    ctx.network = await collectNetworkRequests(rpcClient, tabId, query.network === true ? {} : (query.network ?? {}), { origin, privacy });
  }
  if (query.apiResponses || query.apiInsights || query.summary || query.graphql || query.issues || query.recommendations) {
    ctx.apiResponses = await collectApiResponses(rpcClient, tabId, query.apiResponses === true ? {} : (query.apiResponses ?? {}), { privacy });
  }
  if (query.graphql || query.apiInsights || query.issues || query.recommendations || query.summary) {
    ctx.graphql = await collectGraphqlOperations(rpcClient, tabId, query.graphql === true ? {} : (query.graphql ?? {}), { privacy });
  }
  if (query.performance) ctx.performance = await collectPerformanceMetrics(rpcClient, tabId, query.performance === true ? {} : query.performance, ctx);
  if (query.webSockets || query.summary) ctx.webSockets = await collectWebSocketFrames(rpcClient, tabId, query.webSockets === true ? {} : (query.webSockets ?? {}), { privacy });
  if (query.coverage) ctx.coverage = collectCoverage(ctx, query.coverage === true ? {} : query.coverage);
  if (query.storageSummary) ctx.storageSummary = collectStorageSummary(ctx, query.storageSummary === true ? {} : query.storageSummary);
  if (query.sourceMaps) ctx.sourceMaps = collectSourceMaps(ctx, query.sourceMaps === true ? {} : query.sourceMaps);
  if (query.requestChains) ctx.requestChains = buildRequestChains(ctx, query.requestChains === true ? {} : query.requestChains);
  if (query.apiInsights) ctx.apiInsights = buildApiInsights(ctx, query.apiInsights === true ? {} : query.apiInsights);
  if (query.harSummary) ctx.harSummary = buildHarSummary(ctx, query.harSummary === true ? {} : query.harSummary);
  if (query.security || query.issues || query.recommendations) ctx.security = buildSecuritySummary(ctx, query.security === true ? {} : (query.security ?? {}));
  if (query.thirdParties) ctx.thirdParties = buildThirdPartySummary(ctx, query.thirdParties === true ? {} : query.thirdParties);

  const allIssues = buildDevtoolsIssues(ctx);
  ctx.issuesAll = allIssues;

  // Build response
  const response = {
    session: query.session ? projectFields({
      active: sessionState.active,
      sessionId: sessionState.sessionId,
      startedAt: sessionState.startedAt,
      stoppedAt: null,
      durationMs: sessionState.startedAt ? Date.now() - sessionState.startedAt : null,
      capturedConsoleCount: (ctx.console?.items ?? []).length,
      capturedNetworkCount: (ctx.network?.raw ?? []).length,
      capturedApiResponseCount: (ctx.apiResponses?.raw ?? []).length,
      capturedWebSocketFrameCount: (ctx.webSockets?.items ?? []).length,
    }, query.session === true ? null : query.session?.fields) : undefined,
    page: query.page ? projectFields({
      url: tabUrl, title: null, finalUrl: tabUrl, readyState: null, userAgent: null,
    }, query.page === true ? null : query.page?.fields) : undefined,
    console: query.console ? ctx.console?.items : undefined,
    jsErrors: query.jsErrors ? ctx.jsErrors?.items : undefined,
    network: query.network ? ctx.network?.items : undefined,
    apiResponses: query.apiResponses ? ctx.apiResponses?.items : undefined,
    graphql: query.graphql ? ctx.graphql?.items : undefined,
    performance: query.performance ? ctx.performance?.data : undefined,
    webSockets: query.webSockets ? ctx.webSockets?.items : undefined,
    coverage: query.coverage ? ctx.coverage?.items : undefined,
    storageSummary: query.storageSummary ? ctx.storageSummary?.data : undefined,
    sourceMaps: query.sourceMaps ? ctx.sourceMaps?.items : undefined,
    requestChains: query.requestChains ? ctx.requestChains?.items : undefined,
    apiInsights: query.apiInsights ? ctx.apiInsights?.data : undefined,
    harSummary: query.harSummary ? ctx.harSummary?.data : undefined,
    security: query.security ? ctx.security?.data : undefined,
    thirdParties: query.thirdParties ? ctx.thirdParties?.items : undefined,
    issues: query.issues ? applyIssueFilters(allIssues, query.issues === true ? {} : query.issues) : undefined,
    recommendations: query.recommendations ? buildDevtoolsRecommendations(ctx, query.recommendations === true ? {} : query.recommendations) : undefined,
    summary: query.summary ? buildDevtoolsSummary(ctx, query.summary === true ? {} : query.summary) : undefined,
  };

  // Strip undefineds, attach truncation metadata
  const truncationMetaBag = {};
  for (const [k, v] of Object.entries(response)) {
    if (v === undefined) delete response[k];
  }
  if (ctx.console?.meta?.truncated) truncationMetaBag.console = ctx.console.meta;
  if (ctx.network?.meta?.truncated) truncationMetaBag.network = ctx.network.meta;
  if (ctx.apiResponses?.meta?.truncated) truncationMetaBag.apiResponses = ctx.apiResponses.meta;
  if (ctx.webSockets?.meta?.truncated) truncationMetaBag.webSockets = ctx.webSockets.meta;
  if (ctx.jsErrors?.meta?.truncated) truncationMetaBag.jsErrors = ctx.jsErrors.meta;

  if (p.stopAfterCapture === true) {
    await safeRpc(rpcClient, 'devtools.stopSession', { tabId });
  }

  return createSuccessResponse({
    ...response,
    truncation: Object.keys(truncationMetaBag).length ? truncationMetaBag : undefined,
    meta: { action: 'query_devtools', tabId, url: tabUrl },
  });
}
