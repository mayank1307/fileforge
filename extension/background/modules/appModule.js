import { resolveTab, runInTab } from './contentBridge.js';

export const appModule = {
  async detectFramework({ tabId = 'active' } = {}) {
    const { id, url: tabUrl } = await resolveTab(tabId);
    const frameworks = await runInTab(id, () => window.__fileforge_inspect.framework.detect());
    return { ok: true, data: { tabId: id, tabUrl, frameworks } };
  },

  async getNextData({ tabId = 'active' } = {}) {
    const { id, url: tabUrl } = await resolveTab(tabId);
    const nextData = await runInTab(id, () => window.__fileforge_inspect.framework.getNextData());
    return { ok: true, data: { tabId: id, tabUrl, nextData } };
  },

  async getRouteInfo({ tabId = 'active' } = {}) {
    const { id, url: tabUrl } = await resolveTab(tabId);
    const route = await runInTab(id, () => ({
      href: location.href,
      origin: location.origin,
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      title: document.title,
    }));
    return { ok: true, data: { tabId: id, tabUrl, route } };
  },

  async getClientStorage({ tabId = 'active' } = {}) {
    const { id, url: tabUrl } = await resolveTab(tabId);
    const storage = await runInTab(id, () => window.__fileforge_inspect.framework.getClientStorage());
    return { ok: true, data: { tabId: id, tabUrl, ...storage } };
  },

  async getFeatureFlags({ tabId = 'active' } = {}) {
    const { id, url: tabUrl } = await resolveTab(tabId);
    const flags = await runInTab(id, () => window.__fileforge_inspect.framework.getFeatureFlags());
    return { ok: true, data: { tabId: id, tabUrl, flags } };
  },

  async getReactTreeHint({ tabId = 'active' } = {}) {
    const { id, url: tabUrl } = await resolveTab(tabId);
    const result = await runInTab(id, () => {
      const root = document.querySelector('#root, #app, [data-reactroot]');
      if (!root) {
        return { hint: null, reactDetected: false, reason: 'No React root element found (tried #root, #app, [data-reactroot])', fallback: ['route', 'dom', 'a11y'] };
      }
      const fiberKey = Object.keys(root).find((k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      if (!fiberKey) {
        return { hint: null, reactDetected: 'possible', reason: 'React root element found but no fiber key — likely a production build or React <16', rootSelector: root.id ? `#${root.id}` : root.tagName.toLowerCase(), fallback: ['route', 'dom', 'a11y'] };
      }
      return { hint: { rootSelector: root.id ? `#${root.id}` : root.tagName.toLowerCase(), fiberKey }, reactDetected: true, reason: null, fallback: [] };
    });
    return {
      ok: true,
      data: {
        status: result.hint ? 'complete' : 'partial',
        tabId: id,
        tabUrl,
        ...result,
        unavailableLayers: result.hint ? [] : [{ layer: 'reactTree', reason: result.reason ?? 'React tree hint unavailable' }],
        fallbacksUsed: result.fallback ?? [],
        warnings: result.hint ? [] : [result.reason ?? 'React tree hint unavailable; use DOM/accessibility/route fallbacks.'],
      },
    };
  },
};
