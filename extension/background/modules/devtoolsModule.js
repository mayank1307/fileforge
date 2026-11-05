// CDP sessions per tab
const _sessions = new Map();

function computeMetricsFromTiming(timing) {
  if (!timing || timing.error) return null;
  const nav = timing.navigation?.[0] ?? {};
  const paint = timing.paint ?? [];
  const lcp = timing.largestContentfulPaint?.length
    ? Math.max(...timing.largestContentfulPaint.map((e) => e.startTime ?? e.renderTime ?? 0))
    : null;
  const fcp = paint.find((p) => p.name === 'first-contentful-paint')?.startTime ?? null;
  const fp = paint.find((p) => p.name === 'first-paint')?.startTime ?? null;
  const cls = (timing.layoutShift ?? [])
    .filter((e) => !e.hadRecentInput)
    .reduce((sum, e) => sum + (e.value ?? 0), 0);
  const tbt = (timing.longTasks ?? [])
    .reduce((sum, e) => sum + Math.max(0, (e.duration ?? 0) - 50), 0);
  return {
    lcp: lcp != null ? Math.round(lcp) : null,
    fcp: fcp != null ? Math.round(fcp) : null,
    fp: fp != null ? Math.round(fp) : null,
    cls: parseFloat(cls.toFixed(3)),
    tbt: Math.round(tbt),
    ttfb: nav.responseStart != null ? Math.round(nav.responseStart - (nav.fetchStart ?? 0)) : null,
    domContentLoaded: nav.domContentLoadedEventEnd != null ? Math.round(nav.domContentLoadedEventEnd) : null,
    load: nav.loadEventEnd != null ? Math.round(nav.loadEventEnd) : null,
    longTaskCount: timing.longTasks?.length ?? 0,
  };
}

async function resolveTabId(tabId) {
  if (!tabId || tabId === 'active') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id ?? null;
  }
  return Number(tabId);
}

async function resolveTab(tabId) {
  if (!tabId || tabId === 'active') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return { id: tab?.id ?? null, url: tab?.url ?? null };
  }
  const id = Number(tabId);
  const tab = await chrome.tabs.get(id).catch(() => null);
  return { id, url: tab?.url ?? null };
}

export const devtoolsModule = {
  async startSession({ tabId = 'active' } = {}) {
    const id = await resolveTabId(tabId);
    if (_sessions.has(id)) return { ok: true, data: { tabId: id, status: 'already-attached' } };
    await chrome.debugger.attach({ tabId: id }, '1.3');
    await chrome.debugger.sendCommand({ tabId: id }, 'Network.enable');
    await chrome.debugger.sendCommand({ tabId: id }, 'Console.enable');
    await chrome.debugger.sendCommand({ tabId: id }, 'Runtime.enable');
    await chrome.debugger.sendCommand({ tabId: id }, 'Performance.enable').catch(() => {});
    _sessions.set(id, {
      network: [],
      requests: new Map(),
      console: [],
      errors: [],
      websockets: [],
      startedAt: Date.now(),
    });
    return { ok: true, data: { tabId: id, status: 'attached' } };
  },

  async stopSession({ tabId = 'active' } = {}) {
    const id = await resolveTabId(tabId);
    await chrome.debugger.detach({ tabId: id });
    _sessions.delete(id);
    return { ok: true, data: { tabId: id, status: 'detached' } };
  },

  async clearSession({ tabId = 'active' } = {}) {
    const id = await resolveTabId(tabId);
    const session = _sessions.get(id);
    if (!session) return { ok: true, data: { tabId: id, cleared: false } };
    session.network = [];
    session.requests = new Map();
    session.console = [];
    session.errors = [];
    session.websockets = [];
    session.startedAt = Date.now();
    return { ok: true, data: { tabId: id, cleared: true } };
  },

  async setViewport({ tabId = 'active', width = 1440, height = 1200, deviceScaleFactor = 1, mobile = false } = {}) {
    const id = await resolveTabId(tabId);
    await chrome.debugger.sendCommand({ tabId: id }, 'Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile,
    });
    await chrome.debugger.sendCommand({ tabId: id }, 'Emulation.setTouchEmulationEnabled', {
      enabled: Boolean(mobile),
    }).catch(() => {});
    return { ok: true, data: { tabId: id, viewport: { width, height, deviceScaleFactor, mobile } } };
  },

  async getNetwork({ tabId = 'active', filter = {} } = {}) {
    const { id, url: tabUrl } = await resolveTab(tabId);
    const session = _sessions.get(id);
    let requests = Array.from(session?.requests.values() ?? []);
    if (filter.urlContains) requests = requests.filter((r) => r.url?.includes(filter.urlContains));
    if (filter.types?.length) requests = requests.filter((r) => filter.types.includes(r.type));
    if (filter.statusGte != null) requests = requests.filter((r) => (r.response?.status ?? 0) >= filter.statusGte);
    return { ok: true, data: { tabId: id, tabUrl, requests, events: session?.network ?? [] } };
  },

  async getApiResponses({ tabId = 'active', includeBodies = true } = {}) {
    const id = await resolveTabId(tabId);
    const session = _sessions.get(id);
    const requests = Array.from(session?.requests.values() ?? [])
      .filter((request) => ['XHR', 'Fetch'].includes(request.type) || /\/api\/|graphql/i.test(request.url ?? ''));
    if (includeBodies) {
      for (const request of requests) {
        if (!request.response || request.body) continue;
        try {
          const body = await chrome.debugger.sendCommand({ tabId: id }, 'Network.getResponseBody', { requestId: request.requestId });
          request.body = body;
        } catch (err) {
          request.bodyError = err.message;
        }
      }
    }
    return { ok: true, data: { tabId: id, responses: requests } };
  },

  async getConsole({ tabId = 'active' } = {}) {
    const id = await resolveTabId(tabId);
    const session = _sessions.get(id);
    return { ok: true, data: { tabId: id, sessionActive: Boolean(session), entries: session?.console ?? [] } };
  },

  async getJsErrors({ tabId = 'active' } = {}) {
    const id = await resolveTabId(tabId);
    const session = _sessions.get(id);
    return { ok: true, data: { tabId: id, errors: session?.errors ?? [] } };
  },

  async getPerformance({ tabId = 'active' } = {}) {
    const id = await resolveTabId(tabId);
    const metrics = await chrome.debugger.sendCommand({ tabId: id }, 'Performance.getMetrics').catch(() => null);
    const timing = await chrome.scripting.executeScript({
      target: { tabId: id },
      func: () => ({
        navigation: performance.getEntriesByType('navigation').map((entry) => entry.toJSON()),
        paint: performance.getEntriesByType('paint').map((entry) => entry.toJSON()),
        largestContentfulPaint: performance.getEntriesByType('largest-contentful-paint').map((entry) => entry.toJSON()),
        layoutShift: performance.getEntriesByType('layout-shift').map((entry) => entry.toJSON()),
        longTasks: performance.getEntriesByType('longtask').map((entry) => entry.toJSON()),
        events: performance.getEntriesByType('event').slice(0, 250).map((entry) => entry.toJSON()),
        resources: performance.getEntriesByType('resource').slice(0, 250).map((entry) => entry.toJSON()),
      }),
    }).then(([result]) => result?.result).catch((err) => ({ error: err.message }));
    const { url: tabUrl } = await resolveTab(tabId);
    return { ok: true, data: { tabId: id, tabUrl, metrics, computedMetrics: computeMetricsFromTiming(timing), timing } };
  },

  async getWebSockets({ tabId = 'active' } = {}) {
    const id = await resolveTabId(tabId);
    const session = _sessions.get(id);
    return { ok: true, data: { tabId: id, websockets: session?.websockets ?? [] } };
  },

  async evaluate({ tabId = 'active', expression } = {}) {
    if (typeof expression !== 'string' || !expression.trim()) {
      return { ok: false, error: { code: 'BAD_REQUEST', message: 'expression is required' } };
    }
    const id = await resolveTabId(tabId);
    if (!id) return { ok: false, error: { code: 'NO_TAB', message: 'No active tab' } };
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: id },
        world: 'MAIN',
        func: (src) => {
          try {
            // Wrap so bare expressions and statement bodies both work.
            const fn = new Function(`"use strict"; return (async () => { return (${src}); })();`);
            return Promise.resolve(fn()).then(
              (value) => ({ ok: true, value: value === undefined ? null : value }),
              (err) => ({ ok: false, error: { message: String(err?.message ?? err), stack: String(err?.stack ?? '') } })
            );
          } catch (err) {
            // Fallback: treat input as a statement block (no implicit return).
            try {
              const fn = new Function(`"use strict"; return (async () => { ${src} })();`);
              return Promise.resolve(fn()).then(
                (value) => ({ ok: true, value: value === undefined ? null : value }),
                (err2) => ({ ok: false, error: { message: String(err2?.message ?? err2), stack: String(err2?.stack ?? '') } })
              );
            } catch (err2) {
              return { ok: false, error: { message: String(err2?.message ?? err2), stack: String(err2?.stack ?? '') } };
            }
          }
        },
        args: [expression],
      });
      const result = injection?.result;
      if (!result) return { ok: false, error: { code: 'NO_RESULT', message: 'evaluate returned nothing' } };
      if (result.ok === false) return { ok: false, error: { code: 'EVAL_ERROR', message: result.error?.message, details: result.error } };
      return { ok: true, data: { tabId: id, value: result.value } };
    } catch (err) {
      return { ok: false, error: { code: 'EVAL_FAILED', message: String(err?.message ?? err) } };
    }
  },

  async replayRequest({ tabId = 'active', requestId, overrides = {} } = {}) {
    const id = await resolveTabId(tabId);
    const session = _sessions.get(id);
    const request = session?.requests.get(requestId);
    if (!request) return { ok: false, error: { code: 'REQUEST_NOT_FOUND', message: `No captured request: ${requestId}` } };
    const replay = await chrome.scripting.executeScript({
      target: { tabId: id },
      func: async (request, overrides) => {
        const response = await fetch(overrides.url || request.url, {
          method: overrides.method || request.method || 'GET',
          headers: overrides.headers || request.requestHeaders || {},
          body: overrides.body || request.postData,
          credentials: 'include',
        });
        return { status: response.status, statusText: response.statusText, headers: Object.fromEntries(response.headers.entries()), text: await response.text() };
      },
      args: [request, overrides],
    });
    return { ok: true, data: { requestId, replay: replay[0]?.result } };
  },

  async exportHar({ tabId = 'active' } = {}) {
    const id = await resolveTabId(tabId);
    const tab = await chrome.tabs.get(id);
    const session = _sessions.get(id);
    const entries = Array.from(session?.requests.values() ?? []).map((request) => {
      let queryString = [];
      try {
        queryString = Array.from(new URL(request.url).searchParams.entries()).map(([name, value]) => ({ name, value }));
      } catch (_) {}
      const elapsed = request.finishedAt && request.startedAt ? Math.max(0, request.finishedAt - request.startedAt) : 0;
      return {
        startedDateTime: new Date(request.wallTime ? request.wallTime * 1000 : Date.now()).toISOString(),
        time: elapsed,
        request: {
          method: request.method,
          url: request.url,
          httpVersion: 'HTTP/1.1',
          headers: Object.entries(request.requestHeaders ?? {}).map(([name, value]) => ({ name, value: String(value) })),
          queryString,
          cookies: [],
          headersSize: -1,
          bodySize: request.postData?.length ?? 0,
          postData: request.postData ? { mimeType: request.requestHeaders?.['Content-Type'] ?? '', text: request.postData } : undefined,
        },
        response: {
          status: request.response?.status ?? 0,
          statusText: request.response?.statusText ?? '',
          httpVersion: request.response?.protocol ?? 'HTTP/1.1',
          headers: (request.response?.headers ? Object.entries(request.response.headers) : []).map(([name, value]) => ({ name, value: String(value) })),
          cookies: [],
          content: {
            size: request.response?.encodedDataLength ?? 0,
            mimeType: request.response?.mimeType ?? '',
            text: request.body?.body,
            encoding: request.body?.base64Encoded ? 'base64' : undefined,
          },
          redirectURL: '',
          headersSize: -1,
          bodySize: request.response?.encodedDataLength ?? -1,
        },
        cache: {},
        timings: { send: 0, wait: elapsed, receive: 0 },
      };
    });
    return { ok: true, data: { har: { log: { version: '1.2', creator: { name: 'FileForge', version: chrome.runtime.getManifest().version }, pages: [{ id: String(id), title: tab.title, startedDateTime: new Date(session?.startedAt ?? Date.now()).toISOString(), pageTimings: {} }], entries } } } };
  },
};

// Capture CDP events
chrome.debugger.onEvent.addListener(({ tabId }, method, params) => {
  const session = _sessions.get(tabId);
  if (!session) return;

  if (method === 'Network.requestWillBeSent') {
    const headers = params.request?.headers ?? {};
    session.requests.set(params.requestId, {
      requestId: params.requestId,
      loaderId: params.loaderId,
      url: params.request?.url,
      method: params.request?.method,
      requestHeaders: headers,
      postData: params.request?.postData,
      type: params.type,
      wallTime: params.wallTime,
      startedAt: Date.now(),
      initiator: params.initiator,
    });
    session.network.push({ type: 'request', ...params, timestamp: Date.now() });
  } else if (method === 'Network.responseReceived') {
    const request = session.requests.get(params.requestId) ?? { requestId: params.requestId };
    request.response = params.response;
    request.type = params.type ?? request.type;
    session.requests.set(params.requestId, request);
    session.network.push({ type: 'response', ...params, timestamp: Date.now() });
  } else if (method === 'Network.loadingFinished') {
    const request = session.requests.get(params.requestId);
    if (request) {
      request.finishedAt = Date.now();
      request.encodedDataLength = params.encodedDataLength;
    }
  } else if (method === 'Network.loadingFailed') {
    const request = session.requests.get(params.requestId) ?? { requestId: params.requestId };
    request.failed = params;
    request.finishedAt = Date.now();
    session.requests.set(params.requestId, request);
  } else if (method === 'Console.messageAdded') {
    session.console.push({ ...params.message, timestamp: Date.now() });
  } else if (method === 'Runtime.exceptionThrown') {
    session.errors.push({ ...params.exceptionDetails, timestamp: Date.now() });
  } else if (method.startsWith('Network.webSocket')) {
    session.websockets.push({ method, ...params, timestamp: Date.now() });
  }
});
