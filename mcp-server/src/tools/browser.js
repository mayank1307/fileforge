import { registry } from '../registry.js';
import { collectCapture, openInstrumentedTab } from '../utils/browserCaptureUtils.js';
import { maybeStoreResult } from '../utils/resultUtils.js';

// ─── Query Context Constants ──────────────────────────────────────────────────

const MAX_LIMIT = 100;

const ALLOWED_TAB_FIELDS = new Set([
  'id', 'url', 'title', 'status', 'windowId', 'isActive',
  'isPinned', 'isAudible', 'isMuted', 'incognito', 'canGoBack', 'canGoForward',
]);
const ALLOWED_WINDOW_FIELDS = new Set(['id', 'focused', 'tabCount', 'incognito', 'type', 'state']);
const ALLOWED_SUMMARY_FIELDS = new Set([
  'totalTabs', 'activeTabId', 'focusedWindowId', 'hasLoadingTabs',
  'duplicateUrlGroups', 'likelySearchTabs', 'likelySocialTabs', 'likelyVideoTabs',
]);
const ALLOWED_WHERE_FILTERS = new Set([
  'id', 'windowId', 'urlIncludes', 'titleIncludes', 'status',
  'isActive', 'isPinned', 'isAudible', 'isMuted',
]);
const ALLOWED_QUERY_SECTIONS = new Set(['activeTab', 'tabs', 'windows', 'summary', 'privacy']);

const SENSITIVE_URL_RE = /\/(login|signin|sign-in|auth|oauth|checkout|payment|billing|account|settings|password|reset|token)/i;
const SOCIAL_URL_RE = /\b(instagram\.com|facebook\.com|twitter\.com|x\.com|tiktok\.com|snapchat\.com|linkedin\.com|reddit\.com|pinterest\.com)\b/i;
const SEARCH_URL_RE = /\b(google\.com\/search|bing\.com\/search|duckduckgo\.com|search\.yahoo\.com|ecosia\.org)\b/i;
const VIDEO_URL_RE = /\b(youtube\.com|youtu\.be|netflix\.com|vimeo\.com|twitch\.tv|hulu\.com|disneyplus\.com)\b/i;

const DEFAULT_TAB_FIELDS = ['id', 'url', 'title', 'status', 'windowId', 'isActive'];
const DEFAULT_ACTIVE_TAB_FIELDS = ['id', 'url', 'title', 'status', 'windowId', 'isActive'];

// ─── Presets ──────────────────────────────────────────────────────────────────

const PRESETS = {
  // Fast: active tab + 25 tabs + essential summary. No navigation fields (cheap).
  basic: {
    activeTab: { fields: DEFAULT_ACTIVE_TAB_FIELDS },
    tabs: { fields: DEFAULT_TAB_FIELDS, limit: 25 },
    summary: { include: ['totalTabs', 'activeTabId', 'focusedWindowId', 'hasLoadingTabs'] },
  },
  // Fastest: just the active tab. Use before single-tab operations.
  active_only: {
    activeTab: { fields: DEFAULT_ACTIVE_TAB_FIELDS },
  },
  // Automation sweet spot: active tab with navigation + compact tabs + summary.
  // canGoBack/canGoForward populated if a DevTools session is already open.
  snapshot: {
    activeTab: { fields: ['id', 'url', 'title', 'status', 'windowId', 'canGoBack', 'canGoForward'] },
    tabs: { fields: DEFAULT_TAB_FIELDS, limit: 20 },
    summary: { include: ['totalTabs', 'activeTabId', 'focusedWindowId', 'hasLoadingTabs'] },
  },
  // Just the tab list + minimal summary. Replaces the old list_tabs action.
  tabs_compact: {
    tabs: { fields: DEFAULT_TAB_FIELDS, limit: 50 },
    summary: { include: ['totalTabs', 'activeTabId', 'focusedWindowId', 'hasLoadingTabs'] },
  },
  // Active tab with navigation state. Use before go_back / go_forward.
  navigation_state: {
    activeTab: { fields: ['id', 'url', 'title', 'status', 'canGoBack', 'canGoForward'] },
    summary: { include: ['activeTabId', 'hasLoadingTabs'] },
  },
  // Find duplicate tabs.
  dedupe_state: {
    tabs: { fields: ['id', 'url', 'title', 'windowId', 'isActive'], limit: 100 },
    summary: { include: ['totalTabs', 'activeTabId', 'duplicateUrlGroups'] },
  },
  // Everything: use for debugging or session recovery.
  recovery_state: {
    activeTab: true,
    tabs: { fields: DEFAULT_TAB_FIELDS, limit: 75 },
    windows: true,
    summary: {
      include: [
        'totalTabs', 'activeTabId', 'focusedWindowId', 'hasLoadingTabs',
        'duplicateUrlGroups', 'likelySearchTabs', 'likelySocialTabs',
      ],
    },
  },
};

// ─── Action Aliases ───────────────────────────────────────────────────────────
// Maps old snake_case names and camelCase dot-notation to current canonical names.

const ACTION_ALIASES = {
  // merged → navigate
  open_url: 'navigate',
  navigate_url: 'navigate',
  'browser.openUrl': 'navigate',
  'browser.navigateUrl': 'navigate',
  // merged → history
  go_back: 'history',
  go_forward: 'history',
  'browser.goBack': 'history',
  'browser.goForward': 'history',
  // merged → wait
  wait_for_load: 'wait',
  wait_for_url: 'wait',
  wait_for_idle: 'wait',
  'browser.waitForLoad': 'wait',
  'browser.waitForUrl': 'wait',
  'browser.waitForIdle': 'wait',
  // unchanged camelCase aliases
  'browser.activateTab': 'activate_tab',
  'browser.closeTab': 'close_tab',
  'browser.reloadTab': 'reload_tab',
  'browser.queryContext': 'query_context',
  'browser.closeTabsMatching': 'close_tabs_matching',
};

// ─── Query Helpers ────────────────────────────────────────────────────────────

function normalizeActionName(action) {
  return ACTION_ALIASES[action] ?? action;
}

function validateQuery(query) {
  if (!query || typeof query !== 'object') return null;

  for (const section of Object.keys(query)) {
    if (!ALLOWED_QUERY_SECTIONS.has(section)) {
      return { code: 'INVALID_SECTION', message: `Unknown query section: "${section}"`, path: `query.${section}` };
    }
  }

  if (query.tabs && typeof query.tabs === 'object') {
    const { fields, where, limit } = query.tabs;
    if (fields) {
      for (let i = 0; i < fields.length; i++) {
        if (!ALLOWED_TAB_FIELDS.has(fields[i])) {
          return {
            code: 'INVALID_FIELD',
            message: `Field '${fields[i]}' is not allowed in tabs.fields`,
            path: `query.tabs.fields[${i}]`,
            allowedFields: [...ALLOWED_TAB_FIELDS],
          };
        }
      }
    }
    if (where) {
      for (const key of Object.keys(where)) {
        if (!ALLOWED_WHERE_FILTERS.has(key)) {
          return {
            code: 'INVALID_FILTER',
            message: `Filter '${key}' is not allowed in tabs.where`,
            path: `query.tabs.where.${key}`,
            allowedFilters: [...ALLOWED_WHERE_FILTERS],
          };
        }
      }
    }
    if (limit != null && limit > MAX_LIMIT) {
      return {
        code: 'LIMIT_EXCEEDED',
        message: `tabs.limit (${limit}) exceeds maximum of ${MAX_LIMIT}`,
        path: 'query.tabs.limit',
        maxLimit: MAX_LIMIT,
      };
    }
  }

  if (query.activeTab && typeof query.activeTab === 'object' && query.activeTab.fields) {
    for (let i = 0; i < query.activeTab.fields.length; i++) {
      if (!ALLOWED_TAB_FIELDS.has(query.activeTab.fields[i])) {
        return {
          code: 'INVALID_FIELD',
          message: `Field '${query.activeTab.fields[i]}' is not allowed in activeTab.fields`,
          path: `query.activeTab.fields[${i}]`,
          allowedFields: [...ALLOWED_TAB_FIELDS],
        };
      }
    }
  }

  if (query.windows && typeof query.windows === 'object' && query.windows.fields) {
    for (let i = 0; i < query.windows.fields.length; i++) {
      if (!ALLOWED_WINDOW_FIELDS.has(query.windows.fields[i])) {
        return {
          code: 'INVALID_FIELD',
          message: `Field '${query.windows.fields[i]}' is not allowed in windows.fields`,
          path: `query.windows.fields[${i}]`,
          allowedFields: [...ALLOWED_WINDOW_FIELDS],
        };
      }
    }
  }

  if (query.summary && typeof query.summary === 'object' && query.summary.include) {
    for (let i = 0; i < query.summary.include.length; i++) {
      if (!ALLOWED_SUMMARY_FIELDS.has(query.summary.include[i])) {
        return {
          code: 'INVALID_FIELD',
          message: `Field '${query.summary.include[i]}' is not allowed in summary.include`,
          path: `query.summary.include[${i}]`,
          allowedFields: [...ALLOWED_SUMMARY_FIELDS],
        };
      }
    }
  }

  return null;
}

function applyTabFilters(tabs, where) {
  if (!where) return tabs;
  return tabs.filter((tab) => {
    if (where.id != null && tab.id !== where.id) return false;
    if (where.windowId != null && tab.windowId !== where.windowId) return false;
    if (where.urlIncludes && !tab.url?.includes(where.urlIncludes)) return false;
    if (where.titleIncludes && !tab.title?.includes(where.titleIncludes)) return false;
    if (where.status && tab.status !== where.status) return false;
    if (where.isActive != null && tab.isActive !== where.isActive) return false;
    if (where.isPinned != null && tab.isPinned !== where.isPinned) return false;
    if (where.isAudible != null && tab.isAudible !== where.isAudible) return false;
    if (where.isMuted != null && tab.isMuted !== where.isMuted) return false;
    return true;
  });
}

function projectFields(obj, fields, allowedSet) {
  if (!obj) return null;
  const effectiveFields = fields ?? [...allowedSet];
  const result = {};
  for (const field of effectiveFields) {
    if (allowedSet.has(field) && Object.prototype.hasOwnProperty.call(obj, field)) {
      result[field] = obj[field];
    }
  }
  return result;
}

function redactSensitiveTabData(tab, redact) {
  if (!redact || !tab) return tab;
  if (!tab.url || !SENSITIVE_URL_RE.test(tab.url)) return tab;
  return { ...tab, url: 'redacted', title: 'redacted', sensitive: true };
}

function buildSummary(tabs, windows, activeTabId, focusedWindowId, summaryQuery) {
  const include = summaryQuery === true
    ? [...ALLOWED_SUMMARY_FIELDS]
    : (summaryQuery?.include ?? [...ALLOWED_SUMMARY_FIELDS]);
  const includeSet = new Set(include);
  const summary = {};

  if (includeSet.has('totalTabs')) summary.totalTabs = tabs.length;
  if (includeSet.has('activeTabId')) summary.activeTabId = activeTabId;
  if (includeSet.has('focusedWindowId')) summary.focusedWindowId = focusedWindowId;
  if (includeSet.has('hasLoadingTabs')) summary.hasLoadingTabs = tabs.some((t) => t.status === 'loading');

  if (includeSet.has('duplicateUrlGroups')) {
    const urlMap = new Map();
    for (const tab of tabs) {
      if (!tab.url || tab.url === 'redacted') continue;
      const group = urlMap.get(tab.url) ?? [];
      group.push(tab.id);
      urlMap.set(tab.url, group);
    }
    summary.duplicateUrlGroups = [...urlMap.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([url, ids]) => ({ url, tabIds: ids }));
  }

  if (includeSet.has('likelySearchTabs')) {
    summary.likelySearchTabs = tabs.filter((t) => t.url && SEARCH_URL_RE.test(t.url)).map((t) => t.id);
  }
  if (includeSet.has('likelySocialTabs')) {
    summary.likelySocialTabs = tabs.filter((t) => t.url && SOCIAL_URL_RE.test(t.url)).map((t) => t.id);
  }
  if (includeSet.has('likelyVideoTabs')) {
    summary.likelyVideoTabs = tabs.filter((t) => t.url && VIDEO_URL_RE.test(t.url)).map((t) => t.id);
  }

  return summary;
}

function resolveBrowserContextQuery(rawData, query) {
  const { tabs: allTabs, windows: allWindows, activeTabId, focusedWindowId } = rawData;
  const privacy = query.privacy ?? {};
  const redactSensitive = privacy.redactSensitiveUrls !== false;

  const result = {};

  if (query.activeTab != null) {
    const activeTabRaw = allTabs.find((t) => t.id === activeTabId) ?? null;
    if (activeTabRaw) {
      const fields = query.activeTab === true ? DEFAULT_ACTIVE_TAB_FIELDS : (query.activeTab.fields ?? DEFAULT_ACTIVE_TAB_FIELDS);
      const projected = projectFields(activeTabRaw, fields, ALLOWED_TAB_FIELDS);
      result.activeTab = redactSensitiveTabData(projected, redactSensitive);
    } else {
      result.activeTab = null;
    }
  }

  if (query.tabs != null) {
    const tabsQuery = query.tabs === true ? {} : query.tabs;
    let filtered = applyTabFilters(allTabs, tabsQuery.where);

    if (tabsQuery.sortBy) {
      const dir = tabsQuery.sortOrder === 'desc' ? -1 : 1;
      filtered = [...filtered].sort((a, b) => dir * String(a[tabsQuery.sortBy] ?? '').localeCompare(String(b[tabsQuery.sortBy] ?? '')));
    }

    const limit = Math.min(tabsQuery.limit ?? 25, MAX_LIMIT);
    filtered = filtered.slice(0, limit);

    const fields = tabsQuery.fields ?? DEFAULT_TAB_FIELDS;
    result.tabs = filtered.map((t) => redactSensitiveTabData(projectFields(t, fields, ALLOWED_TAB_FIELDS), redactSensitive));
  }

  if (query.windows != null) {
    const windowsQuery = query.windows === true ? {} : query.windows;
    const fields = windowsQuery.fields ?? [...ALLOWED_WINDOW_FIELDS];
    result.windows = allWindows.map((w) => projectFields(w, fields, ALLOWED_WINDOW_FIELDS));
  }

  if (query.summary != null) {
    const summaryTabs = result.tabs ?? allTabs;
    result.summary = buildSummary(summaryTabs, allWindows, activeTabId, focusedWindowId, query.summary);
  }

  return result;
}

// ─── Tool Definition ──────────────────────────────────────────────────────────

const tools = [
  {
    name: 'fileforge_browser_action',
    description: 'Control browser tabs and read browser state. Use query_context to read state; navigate/history/wait for tab control.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'navigate', 'open_url_with_capture',
            'activate_tab', 'close_tab', 'reload_tab',
            'history', 'wait',
            'query_context', 'close_tabs_matching',
          ],
          description: 'The browser action to perform.',
        },

        // ── query_context ──────────────────────────────────────────────────
        preset: {
          type: 'string',
          enum: ['basic', 'active_only', 'snapshot', 'tabs_compact', 'navigation_state', 'dedupe_state', 'recovery_state'],
          description: 'Preset for query_context. "snapshot" is the automation sweet spot (active tab + nav + compact tabs). "basic" is cheaper (no nav fields).',
        },
        query: {
          type: 'object',
          description: 'Fine-grained projection for query_context. Sections: activeTab, tabs, windows, summary, privacy. Merged on top of preset.',
        },

        // ── shared ────────────────────────────────────────────────────────
        tabId: { type: 'string', description: 'Tab ID or "active". Omit in navigate for smart URL-reuse behaviour.' },
        url: { type: 'string', description: 'URL for navigate or open_url_with_capture.' },
        active: { type: 'boolean', description: 'Focus the tab after navigate / open.', default: true },
        newTab: { type: 'boolean', description: 'Force a new tab in navigate even if an existing tab has the same URL.', default: false },
        bypassCache: { type: 'boolean', default: false },

        // ── history ───────────────────────────────────────────────────────
        direction: { type: 'string', enum: ['back', 'forward'], description: 'Direction for history action.', default: 'back' },

        // ── wait ──────────────────────────────────────────────────────────
        until: { type: 'string', enum: ['load', 'url', 'idle'], description: 'Condition to wait for.', default: 'load' },
        urlIncludes: { type: 'string', description: 'URL substring — required for wait(until="url") and close_tabs_matching.' },
        timeoutMs: { type: 'number', default: 15000 },
        idleMs: { type: 'number', description: 'Quiet period before considering tab idle.', default: 1500 },

        // ── close_tabs_matching ───────────────────────────────────────────
        titleIncludes: { type: 'string', description: 'Title substring for close_tabs_matching.' },
        keepActiveTab: { type: 'boolean', description: 'Protect active tab from close_tabs_matching.', default: true },
        dryRun: { type: 'boolean', description: 'Simulate without closing.', default: false },

        // ── open_url_with_capture ─────────────────────────────────────────
        keepOpen: { type: 'boolean', description: 'Leave tab open after capture.', default: false },
        includeApiBodies: { type: 'boolean', default: false },
        includePerformance: { type: 'boolean', default: true },
        includeScreenshot: { type: 'boolean', default: false },
        includeHar: { type: 'boolean', default: true },
        settleMs: { type: 'number', default: 500 },
        networkIdleMs: { type: 'number', default: 500 },
        networkIdleTimeoutMs: { type: 'number', default: 5000 },
        store: { type: 'boolean', default: true },
        project: { type: 'string', default: 'default' },
      },
      required: ['action'],
    },

    handler: async (p, { rpcClient }) => {
      const action = normalizeActionName(p.action);

      switch (action) {

        case 'navigate': {
          if (!p.url) throw new Error('url is required for navigate');
          const isLegacyNavigateUrl = p.action === 'navigate_url' || p.action === 'browser.navigateUrl';
          const tabId = p.tabId ?? (isLegacyNavigateUrl ? 'active' : undefined);
          const data = await rpcClient.send('browser.navigate', {
            url: p.url, tabId, newTab: p.newTab ?? false, active: p.active ?? true,
          });
          return { ok: true, data, meta: { tool: 'fileforge_browser_action', action } };
        }

        case 'open_url_with_capture': {
          if (!p.url) throw new Error('url is required for open_url_with_capture');
          const { tabId, idle } = await openInstrumentedTab(rpcClient, p.url, p);
          try {
            const data = { ...(await collectCapture(rpcClient, tabId, p)), idle };
            const stored = maybeStoreResult({
              store: p.store ?? true,
              prefix: 'browser_capture',
              tool: 'fileforge_browser_action_capture',
              url: data.url ?? p.url,
              project: p.project ?? 'default',
              data,
              summary: {
                url: data.url ?? p.url, tabId, idle,
                capture: data.capture, har: data.har?.summary,
                screenshot: data.screenshot?.screenshot,
              },
            });
            return { ok: true, ...stored, meta: { tool: 'fileforge_browser_action', action, url: data.url ?? p.url } };
          } finally {
            if (!p.keepOpen) {
              await rpcClient.send('devtools.stopSession', { tabId }).catch(() => null);
              await rpcClient.send('browser.closeTab', { tabId }).catch(() => null);
            }
          }
        }

        case 'activate_tab': {
          if (!p.tabId) throw new Error('tabId is required for activate_tab');
          const data = await rpcClient.send('browser.activateTab', p);
          return { ok: true, data, meta: { tool: 'fileforge_browser_action', action } };
        }

        case 'close_tab': {
          if (!p.tabId) throw new Error('tabId is required for close_tab');
          const data = await rpcClient.send('browser.closeTab', p);
          return { ok: true, data, meta: { tool: 'fileforge_browser_action', action } };
        }

        case 'reload_tab': {
          const data = await rpcClient.send('browser.reloadTab', { tabId: p.tabId, bypassCache: p.bypassCache ?? false });
          return { ok: true, data, meta: { tool: 'fileforge_browser_action', action } };
        }

        case 'history': {
          const isLegacyForward = p.action === 'go_forward' || p.action === 'browser.goForward';
          const direction = p.direction ?? (isLegacyForward ? 'forward' : 'back');
          const data = await rpcClient.send('browser.history', { tabId: p.tabId, direction });
          return { ok: true, data, meta: { tool: 'fileforge_browser_action', action } };
        }

        case 'wait': {
          const legacyUntil = { wait_for_load: 'load', wait_for_url: 'url', wait_for_idle: 'idle',
            'browser.waitForLoad': 'load', 'browser.waitForUrl': 'url', 'browser.waitForIdle': 'idle' };
          const until = p.until ?? legacyUntil[p.action] ?? 'load';
          if (until === 'url' && !p.urlIncludes) throw new Error('urlIncludes is required when until="url"');
          const data = await rpcClient.send('browser.wait', {
            tabId: p.tabId, until, urlIncludes: p.urlIncludes,
            timeoutMs: p.timeoutMs ?? 15000, idleMs: p.idleMs ?? 1500,
            networkIdleMs: p.networkIdleMs, networkIdleTimeoutMs: p.networkIdleTimeoutMs, settleMs: p.settleMs,
          });
          return { ok: true, data, meta: { tool: 'fileforge_browser_action', action } };
        }

        case 'query_context': {
          const presetQuery = p.preset ? PRESETS[p.preset] : null;
          if (p.preset && !presetQuery) {
            return {
              ok: false,
              error: { code: 'INVALID_PRESET', message: `Unknown preset: "${p.preset}"`, allowedPresets: Object.keys(PRESETS) },
              meta: { tool: 'fileforge_browser_action', action },
            };
          }

          const effectiveQuery = p.query
            ? { ...presetQuery, ...p.query }
            : (presetQuery ?? PRESETS.basic);

          const validationError = validateQuery(effectiveQuery);
          if (validationError) {
            return { ok: false, error: validationError, meta: { tool: 'fileforge_browser_action', action } };
          }

          const privacy = effectiveQuery.privacy ?? {};
          const activeTabFields = effectiveQuery.activeTab === true
            ? DEFAULT_ACTIVE_TAB_FIELDS
            : (effectiveQuery.activeTab?.fields ?? DEFAULT_ACTIVE_TAB_FIELDS);
          const includeNavigation = effectiveQuery.activeTab != null
            && (activeTabFields.includes('canGoBack') || activeTabFields.includes('canGoForward'));

          const rawResult = await rpcClient.send('browser.getRawContext', {
            includeIncognito: privacy.includeIncognito ?? false,
            includeNavigation,
          });

          if (!rawResult?.ok) {
            return {
              ok: false,
              error: rawResult?.error ?? { code: 'RAW_CONTEXT_FAILED', message: 'Failed to fetch browser context' },
              meta: { tool: 'fileforge_browser_action', action },
            };
          }

          const resolved = resolveBrowserContextQuery(rawResult.data, effectiveQuery);
          return {
            ok: true,
            schemaVersion: 'browser.context.v1',
            timestamp: new Date().toISOString(),
            ...resolved,
            meta: { tool: 'fileforge_browser_action', action, preset: p.preset ?? null },
          };
        }

        case 'close_tabs_matching': {
          const data = await rpcClient.send('browser.closeTabsMatching', {
            urlIncludes: p.urlIncludes,
            titleIncludes: p.titleIncludes,
            keepActiveTab: p.keepActiveTab ?? true,
            dryRun: p.dryRun ?? false,
          });
          return { ok: true, data, meta: { tool: 'fileforge_browser_action', action } };
        }

        default:
          throw new Error(`Unknown action: ${p.action}`);
      }
    },
  },
];

registry.registerMany(tools);
export {
  tools, normalizeActionName, validateQuery, applyTabFilters,
  projectFields, buildSummary, redactSensitiveTabData, resolveBrowserContextQuery,
  PRESETS, ALLOWED_TAB_FIELDS, ALLOWED_WINDOW_FIELDS, ALLOWED_SUMMARY_FIELDS, MAX_LIMIT,
};
