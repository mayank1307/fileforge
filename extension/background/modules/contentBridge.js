const CONTENT_BRIDGE_FILE = 'content/mcpContentBridge.js';

export async function resolveTabId(tabId) {
  if (!tabId || tabId === 'active') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id ?? null;
  }
  return Number(tabId);
}

export async function resolveTab(tabId) {
  if (!tabId || tabId === 'active') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return { id: tab?.id ?? null, url: tab?.url ?? null, title: tab?.title ?? null };
  }
  const id = Number(tabId);
  const tab = await chrome.tabs.get(id).catch(() => null);
  return { id, url: tab?.url ?? null, title: tab?.title ?? null };
}

export async function ensureContentBridge(tabId) {
  const [probe] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => typeof window.__fileforge_scrape === 'function' && Boolean(window.__fileforge_inspect),
  });

  if (probe?.result) return;

  await chrome.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_BRIDGE_FILE],
  });
}

export async function runInTab(tabId, func, args = []) {
  await ensureContentBridge(tabId);
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
  });
  return result?.result;
}
