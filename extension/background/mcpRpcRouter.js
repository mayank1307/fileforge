import { PAIRING_KEY, TOKEN_KEY, mcpBridge } from './mcpBridge.js';
import { runtimeModule } from './modules/runtimeModule.js';
import { browserModule } from './modules/browserModule.js';
import { scrapeModule } from './modules/scrapeModule.js';
import { sqlModule } from './modules/sqlModule.js';
import { devtoolsModule } from './modules/devtoolsModule.js';
import { screenshotModule } from './modules/screenshotModule.js';
import { exportModule } from './modules/exportModule.js';
import { pageModule } from './modules/pageModule.js';
import { accessibilityModule } from './modules/accessibilityModule.js';
import { responsiveModule } from './modules/responsiveModule.js';
import { appModule } from './modules/appModule.js';
import { searchModule } from './modules/searchModule.js';
import { extensionModule } from './modules/extensionModule.js';
import { eyeModule } from './modules/eyeModule.js';

const modules = {
  runtime: runtimeModule,
  browser: browserModule,
  scrape: scrapeModule,
  page: pageModule,
  sql: sqlModule,
  devtools: devtoolsModule,
  visual: screenshotModule,
  a11y: accessibilityModule,
  responsive: responsiveModule,
  app: appModule,
  extension: extensionModule,
  search: searchModule,
  export: exportModule,
  eye: eyeModule,
};

const activeRequests = new Map();
const ANALYTICS_RECENT_LIMIT = 8;
const MCP_EVENT_LIMIT = 1000;
const mcpEvents = [];
const LEGACY_RPC_ALIASES = new Map([
  ['browser.openUrl', 'browser.navigate'],
  ['browser.navigateUrl', 'browser.navigate'],
  ['browser.waitForLoad', 'browser.wait'],
  ['browser.waitForUrl', 'browser.wait'],
  ['browser.waitForIdle', 'browser.wait'],
]);

function actionTypeFromMethod(method = '') {
  const [group = 'unknown', action = 'unknown'] = String(method).split('.');
  return `${group}.${action}`;
}

function resolveLegacyRpc(method, params = {}) {
  const alias = LEGACY_RPC_ALIASES.get(method);
  if (!alias) return { method, params };

  if (method === 'browser.waitForLoad') {
    return { method: alias, params: { ...params, until: 'load' } };
  }
  if (method === 'browser.waitForUrl') {
    return { method: alias, params: { ...params, until: 'url', urlIncludes: params.urlIncludes ?? params.url } };
  }
  if (method === 'browser.waitForIdle') {
    return { method: alias, params: { ...params, until: 'idle' } };
  }
  return { method: alias, params };
}

function publicRequest(entry) {
  return {
    requestId: entry.requestId,
    method: entry.method,
    ok: entry.ok,
    error: entry.error?.message ?? entry.error,
    failure: entry.error,
    startedAt: entry.startedAt,
    durationMs: entry.durationMs,
    actionType: entry.actionType ?? actionTypeFromMethod(entry.method),
    status: entry.status ?? (entry.ok === false ? 'failed' : 'recent'),
  };
}

function sanitizePayload(value, depth = 0) {
  if (value == null) return undefined;
  if (typeof value !== 'object') {
    const text = String(value);
    if (/^data:[^;,]+(;base64)?,/i.test(text)) return `[DATA_URL:${text.length} chars]`;
    if (/(bearer\s+[a-z0-9._~+/=-]{12,}|sk-[a-z0-9_-]{12,}|eyJ[a-z0-9_-]{10,})/i.test(text)) return '[REDACTED]';
    return text.length > 500 ? `${text.slice(0, 500)}...` : text;
  }
  if (depth > 4) return '[MaxDepth]';
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitizePayload(item, depth + 1));
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (/(authorization|cookie|set-cookie|token|secret|apikey|api_key|password|session|jwt|private)/i.test(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitizePayload(child, depth + 1);
    }
  }
  return result;
}

function compactPayload(value) {
  if (value == null) return undefined;
  if (typeof value !== 'object') return String(sanitizePayload(value)).slice(0, 120);
  const keys = Object.keys(value).slice(0, 4);
  if (!keys.length) return '{}';
  return keys.join(', ');
}

function suggestedFixForError(method, error) {
  const text = `${method} ${error ?? ''}`.toLowerCase();
  if (text.includes('selector')) return 'Verify the selector exists, wait for the element, or capture element debug info.';
  if (text.includes('devtools') || text.includes('debugger')) return 'Start an instrumented capture before navigation or retry after closing competing debugger sessions.';
  if (text.includes('tab')) return 'Confirm the tab is still open and pass an explicit tabId when possible.';
  if (text.includes('permission')) return 'Check extension permissions and host permissions for the target URL.';
  return 'Inspect the failed input, retry with a narrower target, or collect a debug bundle for the tab.';
}

function recordMcpEvent(event) {
  mcpEvents.unshift({
    id: `${Date.now()}:${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    actionType: actionTypeFromMethod(event.method),
    ...event,
  });
  mcpEvents.splice(MCP_EVENT_LIMIT);
}

async function getAnalyticsSnapshot() {
  const activeSnapshot = Array.from(activeRequests.values()).map(publicRequest);
  const log = await runtimeModule.requestLog({ limit: MCP_EVENT_LIMIT }).catch(() => ({ data: { entries: [] } }));
  const entries = log?.data?.entries ?? [];
  const completed = entries.length;
  const failed = entries.filter((entry) => entry.ok === false).length;
  const durations = entries.map((entry) => Number(entry.durationMs)).filter((duration) => Number.isFinite(duration));
  const avgDurationMs = durations.length
    ? Math.round(durations.reduce((total, duration) => total + duration, 0) / durations.length)
    : 0;

  const stored = await chrome.storage.local.get([PAIRING_KEY, TOKEN_KEY]).catch(() => ({}));

  return {
    bridgeConnected: mcpBridge.connected,
    pairing: stored[PAIRING_KEY]?.state ?? null,
    hasBridgeToken: Boolean(stored[TOKEN_KEY]),
    activeCalls: activeSnapshot.length,
    connectedMcp: mcpBridge.connected ? 1 : 0,
    completedCalls: completed,
    failedCalls: failed,
    successCalls: completed - failed,
    avgDurationMs,
    activeRequests: activeSnapshot,
    recentRequests: entries.slice(0, ANALYTICS_RECENT_LIMIT).map(publicRequest),
    mcpEvents: mcpEvents.slice(0, 1000),
    actionTypes: Array.from(new Set([
      ...activeSnapshot.map((entry) => entry.actionType ?? actionTypeFromMethod(entry.method)),
      ...entries.map((entry) => entry.actionType ?? actionTypeFromMethod(entry.method)),
      ...mcpEvents.map((entry) => entry.actionType ?? actionTypeFromMethod(entry.method)),
    ])).filter(Boolean).sort(),
    updatedAt: new Date().toISOString(),
  };
}

async function exportMcpJson() {
  const analytics = await getAnalyticsSnapshot();
  const payload = {
    exportedAt: new Date().toISOString(),
    source: 'FileForge extension',
    analytics,
    mcpInOut: mcpEvents,
    activeRequests: Array.from(activeRequests.values()).map(publicRequest),
  };
  const json = JSON.stringify(payload, null, 2);
  const url = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  const filename = `fileforge-mcp-in-out-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const downloadId = await chrome.downloads.download({ url, filename, saveAs: true });
  return { ok: true, data: { downloadId, filename, bytes: json.length } };
}

async function broadcastAnalytics() {
  const analytics = await getAnalyticsSnapshot();
  chrome.runtime.sendMessage({ type: 'fileforge-analytics-update', analytics }).catch(() => null);
  return analytics;
}

// Answer popup status queries
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'fileforge-status') {
    getAnalyticsSnapshot().then(sendResponse);
    return true;
  }
  if (message.type === 'fileforge-export-mcp-json') {
    exportMcpJson().then(sendResponse).catch((err) => {
      sendResponse({ ok: false, error: { code: 'EXPORT_FAILED', message: err.message } });
    });
    return true;
  }
  if (message.type === 'fileforge-save-bridge-token') {
    const token = String(message.token ?? '').trim();
    if (token && !/^[0-9a-f]{64}$/.test(token)) {
      sendResponse({ ok: false, error: { code: 'INVALID_TOKEN', message: 'The bridge token is 64 hex characters. Copy it again from fileforge-pair.' } });
      return false;
    }
    const save = token ? chrome.storage.local.set({ [TOKEN_KEY]: token }) : chrome.storage.local.remove(TOKEN_KEY);
    save.then(() => {
      mcpBridge.reconnect();
      sendResponse({ ok: true });
    }).catch((err) => sendResponse({ ok: false, error: { code: 'SAVE_FAILED', message: err.message } }));
    return true;
  }
  if (message.type === 'fileforge-run-server-tool') {
    mcpBridge.requestServerTool(message.tool, message.params ?? {}).then(sendResponse).catch((err) => {
      sendResponse({ ok: false, error: { code: 'SERVER_TOOL_CALL_FAILED', message: err.message } });
    });
    return true;
  }
});

// Badge: red '!' when MCP bridge is down, 'PAIR' when the server wants the bridge token, clear when connected
async function updateBadge(connected) {
  if (connected) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  const { [PAIRING_KEY]: pairing } = await chrome.storage.local.get(PAIRING_KEY).catch(() => ({}));
  chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  chrome.action.setBadgeText({ text: pairing?.state === 'required' ? 'PAIR' : '!' });
}

mcpBridge.onConnect(() => {
  updateBadge(true);
  broadcastAnalytics();
});
mcpBridge.onDisconnect(() => {
  activeRequests.clear();
  updateBadge(false);
  broadcastAnalytics();
});
updateBadge(mcpBridge.connected);
if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => null);
}

// Handle RPC requests from the MCP server via WebSocket
mcpBridge.onMessage(async (message) => {
  if (message.type !== 'fileforge-mcp-rpc') return;

  recordMcpEvent({
    direction: 'in',
    requestId: message.requestId,
    method: message.method,
    preview: compactPayload(message.params),
    payload: message.params ?? null,
    sanitizedPayload: sanitizePayload(message.params ?? null),
  });
  broadcastAnalytics();

  const response = await handleRpc(message);
  recordMcpEvent({
    direction: 'out',
    requestId: message.requestId,
    method: message.method,
    ok: response?.ok !== false,
    error: response?.error?.message,
    preview: compactPayload(response?.data ?? response?.error),
    payload: sanitizePayload(response?.data ?? response?.error ?? null),
  });
  mcpBridge.send(response);
  broadcastAnalytics();
});

async function handleRpc({ method, params, requestId }) {
  const resolved = resolveLegacyRpc(method, params ?? {});
  const dispatchMethod = resolved.method;
  const dispatchParams = resolved.params ?? {};
  const [group, action] = dispatchMethod.split('.');
  const mod = modules[group];
  const startedAt = Date.now();
  const activeEntry = {
    key: requestId ?? `${method}:${startedAt}`,
    requestId,
    method,
    actionType: actionTypeFromMethod(method),
    status: 'waiting',
    startedAt: new Date(startedAt).toISOString(),
  };
  activeRequests.set(activeEntry.key, activeEntry);
  broadcastAnalytics();

  if (!mod) {
    const response = { ok: false, error: { code: 'UNKNOWN_MODULE', message: `No module: ${group}` }, requestId };
    await finishRequest(activeEntry, response.error.message, startedAt, false);
    return response;
  }

  const handler = mod[action];
  if (!handler) {
    const response = { ok: false, error: { code: 'UNKNOWN_METHOD', message: `No method: ${method}` }, requestId };
    await finishRequest(activeEntry, response.error.message, startedAt, false);
    return response;
  }

  try {
    const result = await handler(dispatchParams);
    await finishRequest(activeEntry, result?.error?.message, startedAt, result?.ok !== false, dispatchParams, result);
    return { ...result, requestId };
  } catch (err) {
    await finishRequest(activeEntry, err.message, startedAt, false, dispatchParams, null, err);
    return { ok: false, error: { code: 'HANDLER_ERROR', message: err.message }, requestId };
  }
}

async function finishRequest(activeEntry, error, startedAt, ok, params = {}, result = null, thrown = null) {
  activeRequests.delete(activeEntry.key);
  const tabId = params?.tabId ?? result?.data?.tabId ?? result?.tabId;
  const url = params?.url ?? result?.data?.url ?? result?.data?.tabUrl ?? result?.url;
  await runtimeModule.recordRequest({
    requestId: activeEntry.requestId,
    method: activeEntry.method,
    actionType: activeEntry.actionType,
    status: ok ? 'recent' : 'failed',
    ok,
    error: error ? {
      message: error,
      name: thrown?.name,
      stack: thrown?.stack,
      suggestedFix: suggestedFixForError(activeEntry.method, error),
    } : undefined,
    inputPreview: sanitizePayload(params),
    tabId,
    url,
    fallbackUsed: result?.fallbacksUsed ?? result?.data?.fallbacksUsed,
    retryStatus: ok ? 'not-needed' : 'not-retried',
    startedAt: activeEntry.startedAt,
    durationMs: Date.now() - startedAt,
  }).catch(() => null);
  broadcastAnalytics();
}
