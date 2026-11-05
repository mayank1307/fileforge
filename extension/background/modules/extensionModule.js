import { resolveTab, runInTab } from './contentBridge.js';
import { runtimeModule } from './runtimeModule.js';

function manifestSummary() {
  const manifest = chrome.runtime.getManifest();
  return {
    manifestVersion: manifest.manifest_version,
    name: manifest.name,
    version: manifest.version,
    permissions: manifest.permissions ?? [],
    hostPermissions: manifest.host_permissions ?? [],
    contentScripts: manifest.content_scripts ?? [],
    background: manifest.background ?? null,
    action: manifest.action ?? null,
  };
}

function redactStorageMap(values = {}) {
  const result = {};
  for (const [key, value] of Object.entries(values)) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    const sensitive = /(token|secret|apikey|api_key|password|session|jwt|private|cookie)/i.test(key) || /(bearer\s+[a-z0-9._~+/=-]{12,}|sk-[a-z0-9_-]{12,}|eyJ[a-z0-9_-]{10,})/i.test(text);
    result[key] = {
      value: sensitive ? '[REDACTED]' : value,
      preview: sensitive ? `${text.slice(0, 4)}...[REDACTED:${text.length}]` : undefined,
      canReveal: sensitive,
      size: text.length,
      type: Array.isArray(value) ? 'array' : typeof value,
    };
  }
  return result;
}

async function storageArea(areaName) {
  const area = chrome.storage?.[areaName];
  if (!area) return { supported: false, entries: {} };
  const values = await area.get(null);
  return { supported: true, entries: redactStorageMap(values), count: Object.keys(values).length };
}

async function revealStorageValue({ area = 'local', key } = {}) {
  if (!key) return { ok: false, error: { code: 'MISSING_KEY', message: 'key is required.' } };
  const storage = chrome.storage?.[area];
  if (!storage) return { ok: false, error: { code: 'UNSUPPORTED_STORAGE_AREA', message: `No chrome.storage.${area} area is available.` } };
  const values = await storage.get(key);
  if (!(key in values)) return { ok: false, error: { code: 'VALUE_NOT_FOUND', message: `No value found for ${area}.${key}.` } };
  await runtimeModule.recordReveal({
    tool: 'fileforge_extension_reveal_storage_value',
    location: `${area}.${key}`,
    namespace: `chrome.storage.${area}`,
    key,
  });
  return {
    ok: true,
    data: {
      location: `${area}.${key}`,
      namespace: `chrome.storage.${area}`,
      key,
      value: values[key],
      revealedAt: new Date().toISOString(),
      revealPolicy: 'explicit-agent-request',
    },
  };
}

export const extensionModule = {
  async inspectManifest() {
    return { ok: true, data: { status: 'complete', manifest: manifestSummary() } };
  },

  async inspectPermissions() {
    const manifest = manifestSummary();
    return {
      ok: true,
      data: {
        status: 'complete',
        extensionId: chrome.runtime.id,
        permissions: manifest.permissions,
        hostPermissions: manifest.hostPermissions,
        broadHostAccess: manifest.hostPermissions.includes('<all_urls>'),
        contentScriptMatches: manifest.contentScripts.flatMap((script) => script.matches ?? []),
      },
    };
  },

  async inspectStorage({ area = 'all' } = {}) {
    const data = {
      status: 'complete',
      extensionId: chrome.runtime.id,
      local: area === 'local' || area === 'all' ? await storageArea('local') : undefined,
      sync: area === 'sync' || area === 'all' ? await storageArea('sync') : undefined,
      session: area === 'session' || area === 'all' ? await storageArea('session') : undefined,
    };
    return { ok: true, data };
  },

  async revealStorageValue(params = {}) {
    return revealStorageValue(params);
  },

  async inspectServiceWorker() {
    const status = await runtimeModule.status();
    return {
      ok: true,
      data: {
        status: 'complete',
        extensionId: chrome.runtime.id,
        serviceWorker: {
          running: true,
          script: chrome.runtime.getManifest().background?.service_worker,
          type: chrome.runtime.getManifest().background?.type,
        },
        runtime: status.data,
      },
    };
  },

  async inspectInjection({ tabId = 'active', selectors = [] } = {}) {
    const { id, url: tabUrl } = await resolveTab(tabId);
    const result = await runInTab(id, (selectorsArg) => {
      const bridgePresent = Boolean(window.__fileforge_inspect);
      return {
        href: location.href,
        title: document.title,
        bridgePresent,
        selectors: selectorsArg.map((selector) => ({
          selector,
          found: Boolean(document.querySelector(selector)),
          count: document.querySelectorAll(selector).length,
        })),
        fileforgeNodes: Array.from(document.querySelectorAll('[data-fileforge], [id*="fileforge" i], [class*="fileforge" i]')).slice(0, 50).map((el) => ({
          tag: el.tagName.toLowerCase(),
          id: el.id || undefined,
          className: typeof el.className === 'string' ? el.className : undefined,
          text: (el.textContent ?? '').trim().slice(0, 120),
        })),
      };
    }, [selectors]);
    return {
      ok: true,
      data: {
        status: result.bridgePresent ? 'complete' : 'partial',
        tabId: id,
        tabUrl,
        ...result,
        warnings: result.bridgePresent ? [] : ['FileForge content bridge was not detected on this page.'],
        fallbacksUsed: result.bridgePresent ? [] : ['selector scan', 'DOM node scan'],
      },
    };
  },

  async collectErrors() {
    const log = await runtimeModule.requestLog({ limit: 100, failuresOnly: true, includeDetails: true });
    return { ok: true, data: { status: 'complete', extensionId: chrome.runtime.id, failures: log.data?.entries ?? [], summary: log.data?.summary } };
  },

  async runExtensionCheck({ tabId = 'active', selectors = [] } = {}) {
    const [manifest, permissions, serviceWorker, storage, injection, errors] = await Promise.all([
      extensionModule.inspectManifest(),
      extensionModule.inspectPermissions(),
      extensionModule.inspectServiceWorker(),
      extensionModule.inspectStorage({ area: 'all' }),
      extensionModule.inspectInjection({ tabId, selectors }),
      extensionModule.collectErrors(),
    ]);
    const warnings = [
      ...(injection.data?.warnings ?? []),
      ...((errors.data?.summary?.failures ?? 0) ? [`${errors.data.summary.failures} recent extension/MCP failures found.`] : []),
    ];
    return {
      ok: true,
      data: {
        status: warnings.length ? 'partial' : 'complete',
        manifest: manifest.data,
        permissions: permissions.data,
        serviceWorker: serviceWorker.data,
        storage: storage.data,
        injection: injection.data,
        errors: errors.data,
        warnings,
        summary: {
          extensionId: chrome.runtime.id,
          bridgePresent: Boolean(injection.data?.bridgePresent),
          storageEntries: (storage.data?.local?.count ?? 0) + (storage.data?.sync?.count ?? 0) + (storage.data?.session?.count ?? 0),
          failures: errors.data?.summary?.failures ?? 0,
        },
      },
    };
  },
};
