const MAX_EVENTS = 2000;

const _state = {
  sessionId: null,
  startedAt: null,
  watchedTabs: new Map(),   // tabId → { url, title, attached }
  events: [],               // ring buffer, newest first
  lockedTabId: null,
  tripwires: new Map(),     // id → { id, label, condition, firedAt, firedEventId }
  autoTrack: false,
  watchAll: false,          // true only when start_watch was called with all: true
  identity: null,           // string to scan request bodies/URLs for
};

async function attachTab(tab) {
  if (!tab?.id || !tab.url?.startsWith('http')) return null;
  let attached = true;
  try {
    await chrome.debugger.attach({ tabId: tab.id }, '1.3');
  } catch (err) {
    if (!err.message?.includes('already')) return { tabId: tab.id, url: tab.url, status: 'failed', error: err.message };
    attached = false;
  }
  try {
    await chrome.debugger.sendCommand({ tabId: tab.id }, 'Network.enable');
    await chrome.debugger.sendCommand({ tabId: tab.id }, 'Runtime.enable');
    await chrome.debugger.sendCommand({ tabId: tab.id }, 'DOM.enable').catch(() => {});
  } catch { /* best-effort */ }
  _state.watchedTabs.set(tab.id, { url: tab.url, title: tab.title, attached });
  return { tabId: tab.id, url: tab.url, status: attached ? 'watching' : 'piggybacked' };
}

function pushEvent(event) {
  _state.events.unshift(event);
  if (_state.events.length > MAX_EVENTS) _state.events.length = MAX_EVENTS;
  for (const tw of _state.tripwires.values()) {
    if (!tw.firedAt && matchesTripwire(tw.condition, event)) {
      tw.firedAt = new Date().toISOString();
      tw.firedEventId = event.id;
    }
  }
}

function matchesTripwire(condition, event) {
  const { match, scope } = condition;
  if (!match) return false;

  if (scope) {
    const url = event.url ?? '';
    const scopeRe = new RegExp(scope.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'), 'i');
    if (!scopeRe.test(url)) return false;
  }

  const statusMatch = match.match(/^status\s*>=\s*(\d+)/i);
  if (statusMatch) {
    const threshold = parseInt(statusMatch[1], 10);
    return (event.status ?? 0) >= threshold;
  }

  const consoleMatch = match.match(/^console\s+contains\s+(.+)/i);
  if (consoleMatch) {
    const term = consoleMatch[1].trim().toLowerCase();
    return String(event.text ?? '').toLowerCase().includes(term);
  }

  const urlMatch = match.match(/^url\s+matches\s+(.+)/i);
  if (urlMatch) {
    try {
      return new RegExp(urlMatch[1].trim(), 'i').test(event.url ?? '');
    } catch { return false; }
  }

  const typeMatch = match.match(/^type\s+is\s+(\S+)/i);
  if (typeMatch) {
    return event.type === typeMatch[1].trim();
  }

  return false;
}

export const eyeModule = {
  async scan() {
    const tabs = await chrome.tabs.query({});
    const snapshots = await Promise.all(tabs.map(async (tab) => {
      const snap = {
        tabId: tab.id,
        title: tab.title ?? '',
        url: tab.url ?? '',
        status: tab.status,
        audible: tab.audible ?? false,
        pinned: tab.pinned ?? false,
        watching: _state.watchedTabs.has(tab.id),
        locked: tab.id === _state.lockedTabId,
      };
      return snap;
    }));
    return { ok: true, data: { tabs: snapshots, total: snapshots.length } };
  },

  async startWatch({ tabs: tabIds, all = false } = {}) {
    if (!tabIds?.length && all !== true) {
      return { ok: false, error: { code: 'WATCH_TARGET_REQUIRED', message: 'Pass tabs (tab IDs) or all: true to watch every open tab.' } };
    }
    const allTabs = await chrome.tabs.query({});
    const targets = tabIds?.length
      ? allTabs.filter((t) => tabIds.includes(t.id))
      : allTabs.filter((t) => t.url?.startsWith('http'));

    _state.sessionId = crypto.randomUUID();
    _state.startedAt = new Date().toISOString();
    _state.events = [];
    _state.watchedTabs.clear();
    _state.lockedTabId = null;
    _state.watchAll = !tabIds?.length;
    _state.autoTrack = false;

    const results = [];
    for (const tab of targets) {
      const r = await attachTab(tab);
      if (r) results.push(r);
    }

    return {
      ok: true,
      data: {
        sessionId: _state.sessionId,
        startedAt: _state.startedAt,
        watchedCount: _state.watchedTabs.size,
        tabs: results,
      },
    };
  },

  async stopWatch() {
    const detached = [];
    for (const [tabId, info] of _state.watchedTabs) {
      if (!info.attached) continue;
      try {
        await chrome.debugger.detach({ tabId });
        detached.push(tabId);
      } catch { /* tab may have closed */ }
    }
    const summary = {
      sessionId: _state.sessionId,
      startedAt: _state.startedAt,
      stoppedAt: new Date().toISOString(),
      eventCount: _state.events.length,
      detachedTabs: detached,
    };
    _state.watchedTabs.clear();
    _state.sessionId = null;
    _state.startedAt = null;
    _state.events = [];
    _state.tripwires.clear();
    _state.lockedTabId = null;
    _state.watchAll = false;
    _state.autoTrack = false;
    return { ok: true, data: summary };
  },

  async getFeed({ filter = {}, limit = 100 } = {}) {
    let events = [..._state.events];
    if (filter.tabId != null) events = events.filter((e) => e.tabId === Number(filter.tabId));
    if (filter.type) events = events.filter((e) => e.type === filter.type);
    if (filter.severity) {
      const levels = { error: 3, warn: 2, info: 1 };
      const minLevel = levels[filter.severity] ?? 1;
      events = events.filter((e) => (levels[e.severity] ?? 1) >= minLevel);
    }
    if (filter.since) {
      const since = new Date(filter.since).getTime();
      events = events.filter((e) => new Date(e.ts).getTime() >= since);
    }
    return {
      ok: true,
      data: {
        sessionId: _state.sessionId,
        total: _state.events.length,
        filtered: events.length,
        events: events.slice(0, limit),
      },
    };
  },

  async lockTarget({ tabId } = {}) {
    if (!tabId) return { ok: false, error: { code: 'BAD_REQUEST', message: 'tabId is required' } };
    const id = Number(tabId);
    _state.lockedTabId = id;
    try {
      await chrome.debugger.sendCommand({ tabId: id }, 'Page.enable');
    } catch { /* may not be attached yet — screenshot will fail gracefully */ }
    const tab = await chrome.tabs.get(id).catch(() => null);
    return { ok: true, data: { lockedTabId: id, url: tab?.url ?? null, title: tab?.title ?? null } };
  },

  async unlockTarget() {
    const prev = _state.lockedTabId;
    _state.lockedTabId = null;
    return { ok: true, data: { unlockedTabId: prev } };
  },

  async setTripwire({ tripwire } = {}) {
    if (!tripwire?.match) {
      return { ok: false, error: { code: 'BAD_REQUEST', message: 'tripwire.match is required' } };
    }
    const id = crypto.randomUUID();
    _state.tripwires.set(id, {
      id,
      label: tripwire.label ?? tripwire.match,
      condition: { match: tripwire.match, scope: tripwire.scope ?? null },
      firedAt: null,
      firedEventId: null,
    });
    return { ok: true, data: { id, label: tripwire.label ?? tripwire.match } };
  },

  async getTripwires() {
    return { ok: true, data: { tripwires: Array.from(_state.tripwires.values()) } };
  },

  async clearTripwire({ tripwireId } = {}) {
    if (!tripwireId) return { ok: false, error: { code: 'BAD_REQUEST', message: 'tripwireId is required' } };
    const existed = _state.tripwires.delete(tripwireId);
    return { ok: true, data: { deleted: existed, tripwireId } };
  },

  async getStatus() {
    return {
      ok: true,
      data: {
        active: _state.sessionId !== null,
        sessionId: _state.sessionId,
        startedAt: _state.startedAt,
        watchedTabCount: _state.watchedTabs.size,
        watchedTabs: Array.from(_state.watchedTabs.entries()).map(([tabId, info]) => ({ tabId, ...info })),
        lockedTabId: _state.lockedTabId,
        eventCount: _state.events.length,
        tripwireCount: _state.tripwires.size,
        tripwiresFired: Array.from(_state.tripwires.values()).filter((t) => t.firedAt).length,
        watchAll: _state.watchAll,
        autoTrack: _state.autoTrack,
        identity: _state.identity,
      },
    };
  },

  async autoTrack({ enabled = true } = {}) {
    if (enabled && !_state.watchAll) {
      return { ok: false, error: { code: 'WATCH_ALL_REQUIRED', message: 'auto_track attaches to every new tab, so it needs a watch started with all: true.' } };
    }
    _state.autoTrack = Boolean(enabled);
    if (_state.autoTrack && _state.sessionId) {
      // Attach any current http tabs we are not yet watching
      const tabs = await chrome.tabs.query({});
      const newlyAttached = [];
      for (const tab of tabs) {
        if (_state.watchedTabs.has(tab.id)) continue;
        if (!tab.url?.startsWith('http')) continue;
        const r = await attachTab(tab);
        if (r) newlyAttached.push(r);
      }
      return { ok: true, data: { enabled: true, newlyAttached } };
    }
    return { ok: true, data: { enabled: _state.autoTrack } };
  },

  async watchPerson({ identity, clear = false } = {}) {
    if (clear) {
      const prev = _state.identity;
      _state.identity = null;
      return { ok: true, data: { cleared: true, previous: prev } };
    }
    if (!identity) {
      return { ok: false, error: { code: 'BAD_REQUEST', message: 'identity is required (or pass clear: true)' } };
    }
    _state.identity = String(identity);
    return { ok: true, data: { identity: _state.identity } };
  },

  async openIncognito({ url, urls, windowId, focused = true } = {}) {
    if (windowId != null) {
      const win = await chrome.windows.get(Number(windowId)).catch(() => null);
      if (!win) return { ok: false, error: { code: 'NOT_FOUND', message: `Window ${windowId} not found` } };
      if (!win.incognito) return { ok: false, error: { code: 'NOT_INCOGNITO', message: `Window ${windowId} is not incognito` } };
      const tab = await chrome.tabs.create({ windowId: Number(windowId), url: url ?? undefined });
      return { ok: true, data: { windowId: win.id, tab: { id: tab.id, url: tab.url ?? tab.pendingUrl ?? null, index: tab.index } } };
    }
    const createUrls = Array.isArray(urls) && urls.length ? urls : (url ? [url] : undefined);
    try {
      const win = await chrome.windows.create({ incognito: true, focused: Boolean(focused), url: createUrls });
      const tabs = (win.tabs ?? []).map((t) => ({ id: t.id, url: t.url ?? t.pendingUrl ?? null, index: t.index, active: t.active }));
      return { ok: true, data: { windowId: win.id, incognito: win.incognito, tabCount: tabs.length, tabs } };
    } catch (err) {
      const msg = err?.message ?? String(err);
      const hint = /incognito/i.test(msg)
        ? 'Enable "Allow in incognito" for FileForge at chrome://extensions, and ensure incognito is not disabled by policy.'
        : null;
      return { ok: false, error: { code: 'INCOGNITO_OPEN_FAILED', message: msg, ...(hint ? { hint } : {}) } };
    }
  },

  async listIncognito() {
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal', 'popup'] });
    const incognitoWindows = windows.filter((w) => w.incognito).map((w) => ({
      windowId: w.id,
      focused: w.focused,
      state: w.state,
      type: w.type,
      tabCount: (w.tabs ?? []).length,
      tabs: (w.tabs ?? []).map((t) => ({
        tabId: t.id,
        url: t.url ?? '',
        title: t.title ?? '',
        active: t.active,
        pinned: t.pinned ?? false,
        audible: t.audible ?? false,
        index: t.index,
      })),
    }));
    const tabCount = incognitoWindows.reduce((acc, w) => acc + w.tabCount, 0);
    return { ok: true, data: { windowCount: incognitoWindows.length, tabCount, windows: incognitoWindows } };
  },

  async closeIncognito({ windowId, tabId, all = false } = {}) {
    if (all) {
      const windows = await chrome.windows.getAll({ populate: false });
      const targets = windows.filter((w) => w.incognito);
      const closed = [];
      for (const w of targets) {
        try { await chrome.windows.remove(w.id); closed.push(w.id); } catch { /* ignore */ }
      }
      return { ok: true, data: { closedWindowIds: closed, count: closed.length } };
    }
    if (windowId != null) {
      const win = await chrome.windows.get(Number(windowId)).catch(() => null);
      if (!win) return { ok: false, error: { code: 'NOT_FOUND', message: `Window ${windowId} not found` } };
      if (!win.incognito) return { ok: false, error: { code: 'NOT_INCOGNITO', message: `Window ${windowId} is not incognito` } };
      await chrome.windows.remove(Number(windowId));
      return { ok: true, data: { closedWindowId: Number(windowId) } };
    }
    if (tabId != null) {
      const tab = await chrome.tabs.get(Number(tabId)).catch(() => null);
      if (!tab) return { ok: false, error: { code: 'NOT_FOUND', message: `Tab ${tabId} not found` } };
      if (!tab.incognito) return { ok: false, error: { code: 'NOT_INCOGNITO', message: `Tab ${tabId} is not incognito` } };
      await chrome.tabs.remove(Number(tabId));
      return { ok: true, data: { closedTabId: Number(tabId), windowId: tab.windowId } };
    }
    return { ok: false, error: { code: 'BAD_REQUEST', message: 'Pass windowId, tabId, or all: true' } };
  },

  async getReport() {
    const events = _state.events;
    const domains = new Map();
    const errorsByTab = new Map();
    const errorsByType = new Map();
    let firstError = null;
    let first5xx = null;
    let firstJsException = null;
    let firstTripwireFire = null;
    let identityHits = 0;
    let lockedScreenshots = 0;

    for (const e of events) {
      if (e.url) {
        try {
          const host = new URL(e.url).hostname;
          domains.set(host, (domains.get(host) ?? 0) + 1);
        } catch { /* ignore non-URLs */ }
      }
      if (e.severity === 'error') {
        const key = e.tabId ?? 'unknown';
        errorsByTab.set(key, (errorsByTab.get(key) ?? 0) + 1);
        errorsByType.set(e.type, (errorsByType.get(e.type) ?? 0) + 1);
        if (!firstError) firstError = e;
      }
      if (e.type === 'net_response' && (e.status ?? 0) >= 500 && !first5xx) first5xx = e;
      if (e.type === 'js_error' && !firstJsException) firstJsException = e;
      if (e.screenshot) lockedScreenshots += 1;
      if (e.target_hit) identityHits += 1;
    }
    for (const tw of _state.tripwires.values()) {
      if (tw.firedAt && (!firstTripwireFire || tw.firedAt < firstTripwireFire.firedAt)) {
        firstTripwireFire = tw;
      }
    }

    const topDomains = Array.from(domains.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([host, count]) => ({ host, count }));

    return {
      ok: true,
      data: {
        sessionId: _state.sessionId,
        startedAt: _state.startedAt,
        eventCount: events.length,
        topDomains,
        errorsByTab: Array.from(errorsByTab.entries()).map(([tabId, count]) => ({ tabId, count })),
        errorsByType: Array.from(errorsByType.entries()).map(([type, count]) => ({ type, count })),
        timeline: {
          firstError: firstError ? { id: firstError.id, ts: firstError.ts, type: firstError.type } : null,
          first5xx: first5xx ? { id: first5xx.id, ts: first5xx.ts, url: first5xx.url, status: first5xx.status } : null,
          firstJsException: firstJsException ? { id: firstJsException.id, ts: firstJsException.ts, text: firstJsException.text } : null,
          firstTripwireFire: firstTripwireFire ? { id: firstTripwireFire.id, label: firstTripwireFire.label, firedAt: firstTripwireFire.firedAt } : null,
        },
        tripwires: {
          total: _state.tripwires.size,
          fired: Array.from(_state.tripwires.values()).filter((t) => t.firedAt).length,
          summary: Array.from(_state.tripwires.values()).map((t) => ({ id: t.id, label: t.label, firedAt: t.firedAt })),
        },
        identity: _state.identity ? { value: _state.identity, hits: identityHits } : null,
        lockedTarget: { tabId: _state.lockedTabId, screenshotCount: lockedScreenshots },
      },
    };
  },
};

function scanForIdentity(text) {
  if (!_state.identity || !text) return false;
  try {
    return String(text).toLowerCase().includes(_state.identity.toLowerCase());
  } catch {
    return false;
  }
}

function tagIdentity(event, foundIn) {
  if (!event) return;
  event.target_hit = true;
  event.identity_context = { identity: _state.identity, foundIn };
}

// Tap into CDP events for all watched tabs
chrome.debugger.onEvent.addListener(async ({ tabId }, method, params) => {
  if (!_state.watchedTabs.has(tabId)) return;

  const tabInfo = _state.watchedTabs.get(tabId);
  const ts = new Date().toISOString();
  const id = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
  let event = null;

  if (method === 'Network.requestWillBeSent') {
    event = {
      id, tabId, ts, type: 'net_request', severity: 'info',
      url: params.request?.url,
      method: params.request?.method,
      requestId: params.requestId,
    };
    if (_state.identity) {
      if (scanForIdentity(params.request?.url)) tagIdentity(event, 'url');
      else if (scanForIdentity(params.request?.postData)) tagIdentity(event, 'request_body');
    }
  } else if (method === 'Network.responseReceived') {
    const status = params.response?.status ?? 0;
    event = {
      id, tabId, ts, type: 'net_response',
      severity: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
      url: params.response?.url,
      status,
      requestId: params.requestId,
    };
  } else if (method === 'Network.loadingFailed') {
    event = {
      id, tabId, ts, type: 'net_fail', severity: 'error',
      url: tabInfo?.url,
      requestId: params.requestId,
      text: params.errorText,
    };
  } else if (method === 'Runtime.consoleAPICalled') {
    const level = params.type;
    event = {
      id, tabId, ts, type: 'console',
      severity: level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'info',
      level,
      text: (params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' '),
      url: tabInfo?.url,
    };
    if (_state.identity && scanForIdentity(event.text)) tagIdentity(event, 'console');
  } else if (method === 'Runtime.exceptionThrown') {
    event = {
      id, tabId, ts, type: 'js_error', severity: 'error',
      url: tabInfo?.url,
      text: params.exceptionDetails?.text ?? params.exceptionDetails?.exception?.description ?? 'Unknown error',
    };
    if (_state.identity && scanForIdentity(event.text)) tagIdentity(event, 'js_error');
    // Lock target: capture screenshot at the moment of the error
    if (tabId === _state.lockedTabId) {
      try {
        const shot = await chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', { format: 'jpeg', quality: 60 });
        event.screenshot = `data:image/jpeg;base64,${shot.data}`;
      } catch { /* non-fatal */ }
    }
  } else if (method === 'DOM.documentUpdated') {
    event = {
      id, tabId, ts, type: 'dom_update', severity: 'info',
      url: tabInfo?.url,
    };
  } else if (method.startsWith('Network.webSocket')) {
    event = {
      id, tabId, ts, type: 'ws_frame', severity: 'info',
      wsMethod: method,
      url: params.url ?? tabInfo?.url,
    };
  }

  if (event) pushEvent(event);
});

// Clean up watched tabs if they are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  _state.watchedTabs.delete(tabId);
  if (_state.lockedTabId === tabId) _state.lockedTabId = null;
});

// Auto-track: attach newly-created tabs / re-attach on URL change to http.
chrome.tabs.onCreated.addListener(async (tab) => {
  if (!_state.autoTrack || !_state.sessionId) return;
  // Wait for the tab to have a URL — sometimes onCreated fires before URL is known.
  setTimeout(async () => {
    const fresh = await chrome.tabs.get(tab.id).catch(() => null);
    if (fresh?.url?.startsWith('http') && !_state.watchedTabs.has(tab.id)) {
      await attachTab(fresh);
    }
  }, 500);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!_state.autoTrack || !_state.sessionId) return;
  if (changeInfo.url && tab.url?.startsWith('http') && !_state.watchedTabs.has(tabId)) {
    await attachTab(tab);
  }
});
