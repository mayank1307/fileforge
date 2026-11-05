async function queryActiveTab() {
  // Service workers have no "current window" when Chrome is unfocused
  // (e.g. calls arriving from a terminal), so fall back progressively.
  let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
    const win = windows.find((w) => w.focused) ?? windows.at(-1);
    if (win) [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  }
  return tab ?? null;
}

async function resolveTabId(tabId) {
  if (!tabId || tabId === 'active') {
    const tab = await queryActiveTab();
    return tab?.id ?? null;
  }
  return Number(tabId);
}

function normalizeTab(t) {
  return {
    id: t.id,
    url: t.url,
    title: t.title,
    status: t.status,
    windowId: t.windowId,
    isActive: t.active,
    isPinned: t.pinned,
    isAudible: t.audible ?? false,
    isMuted: t.mutedInfo?.muted ?? false,
    incognito: t.incognito,
  };
}

export const browserModule = {
  async getActiveTab() {
    const tab = await queryActiveTab();
    if (!tab) {
      return { ok: false, error: { code: 'NO_ACTIVE_TAB', message: 'No active tab found in any normal Chrome window.' } };
    }
    return { ok: true, data: normalizeTab(tab) };
  },

  // ─── navigate: merged open_url + navigate_url ─────────────────────────────
  async navigate({ url, tabId, newTab = false, active = true }) {
    if (tabId != null && tabId !== '') {
      const id = await resolveTabId(tabId);
      const tab = await chrome.tabs.update(id, { url, ...(active ? { active } : {}) });
      return { ok: true, data: { id: tab.id, url: tab.url, status: tab.status } };
    }
    if (!newTab) {
      const allTabs = await chrome.tabs.query({});
      const existing = allTabs.find((t) => t.url === url);
      if (existing) {
        const tab = await chrome.tabs.update(existing.id, { active });
        return { ok: true, data: { id: tab.id, url: tab.url, reused: true } };
      }
    }
    const tab = await chrome.tabs.create({ url, active });
    return { ok: true, data: { id: tab.id, url: tab.url } };
  },

  async activateTab({ tabId }) {
    const id = await resolveTabId(tabId);
    await chrome.tabs.update(id, { active: true });
    return { ok: true, data: { tabId: id } };
  },

  async closeTab({ tabId }) {
    const id = await resolveTabId(tabId);
    await chrome.tabs.remove(id);
    return { ok: true, data: { tabId: id } };
  },

  async reloadTab({ tabId, bypassCache = false }) {
    const id = await resolveTabId(tabId);
    await chrome.tabs.reload(id, { bypassCache });
    return { ok: true, data: { tabId: id } };
  },

  // ─── history: merged go_back + go_forward ────────────────────────────────
  async history({ tabId, direction = 'back' }) {
    const id = await resolveTabId(tabId);
    if (direction === 'forward') {
      await chrome.tabs.goForward(id);
    } else {
      await chrome.tabs.goBack(id);
    }
    return { ok: true, data: { tabId: id, direction } };
  },

  // ─── wait: merged wait_for_load + wait_for_url + wait_for_idle ───────────
  async wait({ tabId, until = 'load', urlIncludes, timeoutMs = 15000, idleMs = 1500 } = {}) {
    const id = await resolveTabId(tabId);

    if (until === 'load') {
      const tab = await chrome.tabs.get(id);
      if (tab.status === 'complete') return { ok: true, data: { tabId: id, status: 'complete' } };
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          reject(new Error(`wait load timeout after ${timeoutMs}ms`));
        }, timeoutMs);
        function listener(updatedId, info) {
          if (updatedId === id && info.status === 'complete') {
            clearTimeout(timer);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve({ ok: true, data: { tabId: id, status: 'complete' } });
          }
        }
        chrome.tabs.onUpdated.addListener(listener);
      });
    }

    if (until === 'url') {
      if (!urlIncludes) throw new Error('urlIncludes is required when until="url"');
      const tab = await chrome.tabs.get(id);
      if (tab.url?.includes(urlIncludes)) return { ok: true, data: { tabId: id, url: tab.url, matched: true } };
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          reject(new Error(`wait url timeout: "${urlIncludes}" not seen within ${timeoutMs}ms`));
        }, timeoutMs);
        function listener(updatedId, _info, updatedTab) {
          if (updatedId !== id) return;
          if (updatedTab.url?.includes(urlIncludes)) {
            clearTimeout(timer);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve({ ok: true, data: { tabId: id, url: updatedTab.url, matched: true } });
          }
        }
        chrome.tabs.onUpdated.addListener(listener);
      });
    }

    if (until === 'idle') {
      return new Promise((resolve, reject) => {
        let idleTimer = null;
        const deadline = setTimeout(() => {
          clearTimeout(idleTimer);
          chrome.tabs.onUpdated.removeListener(listener);
          reject(new Error(`wait idle timeout after ${timeoutMs}ms`));
        }, timeoutMs);
        function settle() {
          clearTimeout(deadline);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve({ ok: true, data: { tabId: id, idle: true } });
        }
        function listener(updatedId) {
          if (updatedId === id) {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(settle, idleMs);
          }
        }
        chrome.tabs.onUpdated.addListener(listener);
        idleTimer = setTimeout(settle, idleMs);
      });
    }

    throw new Error(`Unknown until value: "${until}". Use "load", "url", or "idle".`);
  },

  // ─── getRawContext ────────────────────────────────────────────────────────
  async getRawContext({ includeIncognito = false, includeNavigation = false } = {}) {
    const [allTabs, allWindows, [activeTab]] = await Promise.all([
      chrome.tabs.query({}),
      chrome.windows.getAll({}),
      chrome.tabs.query({ active: true, currentWindow: true }),
    ]);

    // canGoBack/canGoForward: only for active tab, only if debugger already attached (non-intrusive)
    let navState = { canGoBack: null, canGoForward: null };
    if (includeNavigation && activeTab?.id) {
      try {
        const targets = await chrome.debugger.getTargets();
        const isAttached = targets.some((t) => t.tabId === activeTab.id && t.attached);
        if (isAttached) {
          const history = await chrome.debugger.sendCommand(
            { tabId: activeTab.id },
            'Page.getNavigationHistory',
          );
          navState = {
            canGoBack: history.currentIndex > 0,
            canGoForward: history.currentIndex < history.entries.length - 1,
          };
        }
      } catch { /* CDP unavailable — leave null */ }
    }

    const tabs = allTabs
      .filter((t) => includeIncognito || !t.incognito)
      .map((t) => {
        const base = normalizeTab(t);
        const isActive = t.id === activeTab?.id;
        return {
          ...base,
          canGoBack: isActive ? navState.canGoBack : null,
          canGoForward: isActive ? navState.canGoForward : null,
        };
      });

    const windows = allWindows.map((w) => ({
      id: w.id,
      focused: w.focused,
      tabCount: allTabs.filter((t) => t.windowId === w.id && (includeIncognito || !t.incognito)).length,
      incognito: w.incognito,
      type: w.type,
      state: w.state,
    }));

    return {
      ok: true,
      data: {
        tabs,
        windows,
        activeTabId: activeTab?.id ?? null,
        focusedWindowId: allWindows.find((w) => w.focused)?.id ?? null,
      },
    };
  },

  // ─── closeTabsMatching ────────────────────────────────────────────────────
  async closeTabsMatching({ urlIncludes, titleIncludes, keepActiveTab = true, dryRun = false } = {}) {
    const [allTabs, [activeTab]] = await Promise.all([
      chrome.tabs.query({}),
      chrome.tabs.query({ active: true, currentWindow: true }),
    ]);
    const activeTabId = activeTab?.id ?? null;
    const closed = [];
    const skipped = [];

    for (const tab of allTabs) {
      const matchesUrl = !urlIncludes || tab.url?.includes(urlIncludes);
      const matchesTitle = !titleIncludes || tab.title?.includes(titleIncludes);
      if (!matchesUrl || !matchesTitle) continue;
      if (keepActiveTab && tab.id === activeTabId) {
        skipped.push({ id: tab.id, reason: 'active_tab_protected' });
        continue;
      }
      if (!dryRun) await chrome.tabs.remove(tab.id).catch(() => null);
      closed.push(tab.id);
    }

    return { ok: true, data: { closed, skipped, dryRun } };
  },
};
