import { sanitizeHar, summarizeHar } from './privacyUtils.js';

const ACTIVATE_SETTLE_MS = 80;

export function dataOf(response) {
  return response?.data ?? response;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const VIEWPORT_PRESETS = {
  desktop: { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false },
  tablet: { width: 768, height: 1024, deviceScaleFactor: 2, mobile: true },
  mobile: { width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
};

export function resolveViewport(viewport) {
  if (!viewport) return undefined;
  if (typeof viewport === 'string') return VIEWPORT_PRESETS[viewport] ? { label: viewport, ...VIEWPORT_PRESETS[viewport] } : { label: viewport };
  return { label: viewport.label, ...viewport };
}

function requestStatus(request) {
  return request.response?.status ?? 0;
}

function isThirdParty(request, pageUrl) {
  try {
    return new URL(request.url).origin !== new URL(pageUrl).origin;
  } catch {
    return false;
  }
}

function requestBytes(request) {
  return request.encodedDataLength ?? request.response?.encodedDataLength ?? 0;
}

export function summarizeCapture({ url, network, consoleData, jsErrors, apiResponses }) {
  const requests = network?.requests ?? [];
  const failedRequests = requests.filter((request) => request.failed || requestStatus(request) >= 400);
  const consoleEntries = consoleData?.entries ?? [];
  const consoleIssues = consoleEntries.filter((entry) => ['error', 'warning'].includes(entry.level));
  const errors = jsErrors?.errors ?? [];
  const apiFailures = (apiResponses?.responses ?? []).filter((request) => request.failed || requestStatus(request) >= 400);
  const thirdPartyScripts = requests.filter((request) => request.type === 'Script' && isThirdParty(request, url));

  return {
    requests: requests.length,
    failedRequests: failedRequests.length,
    thirdPartyScripts: thirdPartyScripts.length,
    totalTransferBytes: requests.reduce((total, request) => total + requestBytes(request), 0),
    consoleIssues: consoleIssues.length,
    jsErrors: errors.length,
    apiResponses: apiResponses?.responses?.length ?? 0,
    apiFailures: apiFailures.length,
    topFailures: failedRequests.slice(0, 20).map((request) => ({
      url: request.url,
      method: request.method,
      status: requestStatus(request) || undefined,
      type: request.type,
      failed: Boolean(request.failed),
    })),
  };
}

export async function waitForNetworkIdle(rpcClient, tabId, { idleMs = 500, timeoutMs = 5000 } = {}) {
  const started = Date.now();
  let lastCount = -1;
  let stableSince = Date.now();

  while (Date.now() - started < timeoutMs) {
    const network = dataOf(await rpcClient.send('devtools.getNetwork', { tabId }).catch(() => null));
    const count = network?.requests?.length ?? 0;
    if (count !== lastCount) {
      lastCount = count;
      stableSince = Date.now();
    }
    if (Date.now() - stableSince >= idleMs) return { idle: true, requests: count };
    await sleep(Math.min(150, idleMs));
  }

  return { idle: false, requests: lastCount };
}

// Chrome can only capture the visible tab, and capture actions refuse any other (TAB_NOT_VISIBLE). A tab FileForge
// opened in the background is its own to show, so bring it forward for the capture and put the user's tab back.
export async function captureOwnedTab(rpcClient, method, params) {
  const context = dataOf(await rpcClient.send('browser.getRawContext', { includeNavigation: false }).catch(() => null));
  const previousTabId = context?.activeTabId != null ? String(context.activeTabId) : null;
  const tabId = String(params.tabId);
  await rpcClient.send('browser.activateTab', { tabId });
  try {
    await sleep(ACTIVATE_SETTLE_MS);
    return await rpcClient.send(method, params);
  } finally {
    if (previousTabId && previousTabId !== tabId) await rpcClient.send('browser.activateTab', { tabId: previousTabId }).catch(() => null);
  }
}

export async function openInstrumentedTab(rpcClient, url, {
  active = false,
  timeoutMs = 15000,
  settleMs = 500,
  networkIdleMs = 500,
  networkIdleTimeoutMs = 5000,
  viewport,
} = {}) {
  let previousActiveTabId = null;
  if (!active) {
    const context = dataOf(await rpcClient.send('browser.getRawContext', { includeNavigation: false }).catch(() => null));
    if (context?.activeTabId != null) previousActiveTabId = String(context.activeTabId);
  }

  const opened = await rpcClient.send('browser.navigate', { url: 'about:blank', active, newTab: true });
  if (!opened?.ok) throw new Error(opened?.error?.message ?? 'Could not open tab.');
  const tabId = String(opened.data.id);
  const viewportConfig = resolveViewport(viewport);

  await rpcClient.send('devtools.startSession', { tabId });
  if (viewportConfig?.width && viewportConfig?.height) {
    await rpcClient.send('devtools.setViewport', { tabId, ...viewportConfig }).catch(() => null);
  }
  await rpcClient.send('devtools.clearSession', { tabId });
  await rpcClient.send('browser.navigate', { tabId, url, active });
  await rpcClient.send('browser.wait', { tabId, until: 'load', timeoutMs }).catch(() => null);
  const idle = await waitForNetworkIdle(rpcClient, tabId, { idleMs: networkIdleMs, timeoutMs: networkIdleTimeoutMs }).catch((err) => ({ idle: false, error: err.message }));
  if (settleMs > 0) await sleep(settleMs);
  if (!active && previousActiveTabId && previousActiveTabId !== tabId) {
    await rpcClient.send('browser.activateTab', { tabId: previousActiveTabId }).catch(() => null);
  }

  return { tabId, idle };
}

export async function navigateInstrumentedTab(rpcClient, tabId, url, {
  timeoutMs = 15000,
  settleMs = 500,
  networkIdleMs = 500,
  networkIdleTimeoutMs = 5000,
} = {}) {
  await rpcClient.send('devtools.clearSession', { tabId }).catch(() => null);
  // active: false leaves the window's active tab alone; browser.navigate would otherwise focus this one.
  await rpcClient.send('browser.navigate', { tabId, url, active: false });
  await rpcClient.send('browser.wait', { tabId, until: 'load', timeoutMs }).catch(() => null);
  const idle = await waitForNetworkIdle(rpcClient, tabId, { idleMs: networkIdleMs, timeoutMs: networkIdleTimeoutMs }).catch((err) => ({ idle: false, error: err.message }));
  if (settleMs > 0) await sleep(settleMs);
  return { tabId, idle };
}

export async function collectCapture(rpcClient, tabId, {
  includeApiBodies = false,
  includePerformance = true,
  includeScreenshot = false,
  includeHar = true,
  project = 'default',
  run,
  url,
  viewport,
} = {}) {
  const [
    route,
    network,
    consoleData,
    jsErrors,
    apiResponses,
    performance,
    screenshot,
    har,
  ] = await Promise.all([
    rpcClient.send('app.getRouteInfo', { tabId }).then(dataOf).catch((err) => ({ error: err.message })),
    rpcClient.send('devtools.getNetwork', { tabId }).then(dataOf).catch((err) => ({ error: err.message })),
    rpcClient.send('devtools.getConsole', { tabId }).then(dataOf).catch((err) => ({ error: err.message })),
    rpcClient.send('devtools.getJsErrors', { tabId }).then(dataOf).catch((err) => ({ error: err.message })),
    rpcClient.send('devtools.getApiResponses', { tabId, includeBodies: includeApiBodies }).then(dataOf).catch((err) => ({ error: err.message })),
    includePerformance ? rpcClient.send('devtools.getPerformance', { tabId }).then(dataOf).catch((err) => ({ error: err.message })) : Promise.resolve(undefined),
    includeScreenshot ? captureOwnedTab(rpcClient, 'visual.captureScreenshot', { tabId, format: 'png', project, run, url, viewport }).then(dataOf).catch((err) => ({ error: err.message })) : Promise.resolve(undefined),
    includeHar ? rpcClient.send('devtools.exportHar', { tabId }).then(dataOf).catch((err) => ({ error: err.message })) : Promise.resolve(undefined),
  ]);
  const finalUrl = route?.route?.href ?? route?.url ?? url;
  const collected = { route, network, console: consoleData, jsErrors, apiResponses, performance, screenshot, har };
  const unavailableLayers = Object.entries(collected)
    .filter(([, value]) => value?.error)
    .map(([layer, value]) => ({ layer, reason: value.error }));
  const status = unavailableLayers.length ? 'partial' : 'complete';

  return {
    status,
    tabId,
    url: finalUrl,
    route,
    network,
    console: consoleData,
    jsErrors,
    apiResponses,
    performance,
    screenshot,
    har: har?.har ? { summary: summarizeHar(sanitizeHar(har.har)) } : har,
    unavailableLayers,
    fallbacksUsed: unavailableLayers.length ? ['partial capture summary'] : [],
    warnings: unavailableLayers.map((item) => `${item.layer} unavailable: ${item.reason}`),
    capture: summarizeCapture({ url: finalUrl, network, consoleData, jsErrors, apiResponses }),
  };
}

export async function openUrlWithCapture(rpcClient, url, options = {}) {
  const { tabId, idle } = await openInstrumentedTab(rpcClient, url, options);
  try {
    const capture = await collectCapture(rpcClient, tabId, options);
    return { ...capture, idle };
  } catch (err) {
    if (!options.keepOpen) {
      await rpcClient.send('devtools.stopSession', { tabId }).catch(() => null);
      await rpcClient.send('browser.closeTab', { tabId }).catch(() => null);
    }
    throw err;
  }
}
