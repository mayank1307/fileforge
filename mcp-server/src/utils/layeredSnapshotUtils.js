function dataOf(response) {
  return response?.data ?? response;
}

function hasValue(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function compactText(text, maxLength) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
  return {
    length: normalized.length,
    truncated: normalized.length > maxLength,
    sample: normalized.slice(0, maxLength),
  };
}

async function collectLayer({ name, label, collect, pick, transform = (value) => value }) {
  try {
    const response = await collect();
    if (response?.ok === false) {
      return {
        name,
        status: 'failed',
        warning: `${label} failed: ${response.error?.message ?? 'Unknown error'}`,
        error: response.error ?? { message: 'Unknown error' },
      };
    }
    const data = dataOf(response);
    const value = pick ? pick(data) : data;
    if (!hasValue(value)) {
      return {
        name,
        status: 'empty',
        warning: `${label} returned no useful data.`,
        data,
      };
    }
    return {
      name,
      status: 'ok',
      data: transform(value, data),
    };
  } catch (err) {
    return {
      name,
      status: 'failed',
      warning: `${label} failed: ${err.message}`,
      error: { message: err.message },
    };
  }
}

function layerMap(layers) {
  return Object.fromEntries(layers.map((layer) => [layer.name, layer.data]));
}

function summarizeLayeredSnapshot(data) {
  return {
    tabId: data.tabId,
    snapshotStatus: data.snapshotStatus,
    availableLayers: data.availableLayers,
    failedLayers: data.failedLayers,
    emptyLayers: data.emptyLayers,
  };
}

async function maybeStoreLayeredSnapshot({ store, data, project }) {
  if (!store) return { data };
  const { maybeStoreResult } = await import('./resultUtils.js');
  return maybeStoreResult({
    store,
    prefix: 'page_snapshot',
    tool: 'fileforge_page_get_layered_snapshot',
    url: data.layers.route?.href,
    project,
    data,
    summary: summarizeLayeredSnapshot(data),
  });
}

export async function collectLayeredSnapshot(rpcClient, {
  tabId = 'active',
  depth = 6,
  maxHtmlLength = 200000,
  textSampleLimit = 5000,
  includeScreenshotFallback = false,
  store = false,
  project = 'default',
} = {}) {
  const layers = await Promise.all([
    collectLayer({
      name: 'rawHtml',
      label: 'Raw HTML',
      collect: () => rpcClient.send('page.getHtml', { tabId, maxLength: maxHtmlLength }),
      pick: (data) => data?.html,
      transform: (_html, data) => ({ length: data.length, truncated: data.truncated, sample: data.html }),
    }),
    collectLayer({
      name: 'renderedDom',
      label: 'Rendered DOM snapshot',
      collect: () => rpcClient.send('page.getDomSnapshot', { tabId, depth }),
      pick: (data) => data?.snapshot,
    }),
    collectLayer({
      name: 'accessibilityTree',
      label: 'Accessibility tree',
      collect: () => rpcClient.send('page.getAccessibilityTree', { tabId }),
      pick: (data) => data?.tree,
    }),
    collectLayer({
      name: 'visibleText',
      label: 'Visible text',
      collect: () => rpcClient.send('page.getText', { tabId }),
      pick: (data) => data?.text,
      transform: (text) => compactText(text, textSampleLimit),
    }),
    collectLayer({
      name: 'interactiveElements',
      label: 'Interactive elements',
      collect: () => rpcClient.send('page.getInteractiveElements', { tabId, includeSelectors: true }),
      pick: (data) => data?.elements,
    }),
    collectLayer({
      name: 'forms',
      label: 'Forms',
      collect: () => rpcClient.send('page.getForms', { tabId }),
      pick: (data) => data?.forms,
    }),
    collectLayer({
      name: 'framework',
      label: 'Framework hints',
      collect: () => rpcClient.send('app.detectFramework', { tabId }),
      pick: (data) => data?.frameworks,
    }),
    collectLayer({
      name: 'route',
      label: 'Route state',
      collect: () => rpcClient.send('app.getRouteInfo', { tabId }),
      pick: (data) => data?.route,
    }),
    includeScreenshotFallback
      ? collectLayer({
        name: 'screenshot',
        label: 'Screenshot fallback',
        collect: () => rpcClient.send('visual.captureScreenshot', { tabId, format: 'png', project, name: 'snapshot-fallback' }),
        pick: (data) => data?.screenshot,
      })
      : Promise.resolve({ name: 'screenshot', status: 'skipped' }),
  ]);

  const usableLayers = layers.filter((layer) => layer.status === 'ok');
  const failedLayers = layers.filter((layer) => layer.status === 'failed');
  const emptyLayers = layers.filter((layer) => layer.status === 'empty');
  const warnings = layers.filter((layer) => layer.warning).map((layer) => layer.warning);
  const snapshotStatus = failedLayers.length === 0 && emptyLayers.length === 0
    ? 'complete'
    : usableLayers.length > 0
      ? 'partial'
      : 'failed';

  const data = {
    tabId,
    snapshotStatus,
    availableLayers: usableLayers.map((layer) => layer.name),
    failedLayers: failedLayers.map((layer) => ({ layer: layer.name, reason: layer.error?.message ?? layer.error?.code ?? 'Unknown error' })),
    emptyLayers: emptyLayers.map((layer) => layer.name),
    layers: layerMap(usableLayers),
  };

  const stored = await maybeStoreLayeredSnapshot({
    store,
    project,
    data,
  });

  return {
    ok: snapshotStatus !== 'failed',
    ...stored,
    warnings,
    meta: { tool: 'fileforge_page_get_layered_snapshot', tabId },
  };
}

export function shouldFallbackToLayeredSnapshot(response) {
  if (response?.ok === false) return true;
  const data = dataOf(response);
  return !hasValue(data?.snapshot);
}
