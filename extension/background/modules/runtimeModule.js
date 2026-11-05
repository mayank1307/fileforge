import { BUILD_ID } from '../buildInfo.js';

export const runtimeModule = {
  async status() {
    const manifest = chrome.runtime.getManifest();
    return {
      ok: true,
      data: {
        extensionId: chrome.runtime.id,
        version: manifest.version,
        buildId: BUILD_ID,
        status: 'connected',
      },
    };
  },

  async recordRequest(entry) {
    const key = 'fileforgeRequestLog';
    const existing = await chrome.storage.local.get(key);
    const entries = [entry, ...(existing[key] ?? [])].slice(0, 1000);
    await chrome.storage.local.set({ [key]: entries });
    return { ok: true, data: { entries: entries.length } };
  },

  async requestLog({ limit = 50, failuresOnly = false, includeDetails = true } = {}) {
    const key = 'fileforgeRequestLog';
    const existing = await chrome.storage.local.get(key);
    let entries = existing[key] ?? [];
    if (failuresOnly) entries = entries.filter((entry) => entry.ok === false);
    const sliced = entries.slice(0, limit).map((entry) => {
      if (includeDetails) return entry;
      return {
        requestId: entry.requestId,
        method: entry.method,
        actionType: entry.actionType,
        status: entry.status,
        ok: entry.ok,
        error: entry.error?.message ?? entry.error,
        startedAt: entry.startedAt,
        durationMs: entry.durationMs,
        tabId: entry.tabId,
        url: entry.url,
      };
    });
    const failures = entries.filter((entry) => entry.ok === false);
    return {
      ok: true,
      data: {
        entries: sliced,
        summary: {
          total: entries.length,
          failures: failures.length,
          topFailures: failures.slice(0, 20).map((entry) => ({
            method: entry.method,
            error: entry.error?.message ?? entry.error,
            suggestedFix: entry.error?.suggestedFix,
            startedAt: entry.startedAt,
            tabId: entry.tabId,
            url: entry.url,
          })),
        },
      },
    };
  },

  async recordReveal(entry) {
    const key = 'fileforgeRevealLog';
    const existing = await chrome.storage.local.get(key);
    const entries = [{ ...entry, timestamp: new Date().toISOString() }, ...(existing[key] ?? [])].slice(0, 250);
    await chrome.storage.local.set({ [key]: entries });
    return { ok: true, data: { entries: entries.length } };
  },
};
