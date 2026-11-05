import { isSensitiveUrl, redactSensitiveTabData, REDACTED_TAB_VALUE } from './privacyUtils.js';

function sameOrigin(activeUrl, dataUrl) {
  // A match would reveal the origin of a redacted URL.
  if (!activeUrl || !dataUrl || isSensitiveUrl(activeUrl) || isSensitiveUrl(dataUrl)) return null;
  try {
    return new URL(activeUrl).origin === new URL(dataUrl).origin;
  } catch {
    return null;
  }
}

// The provenance block index.js adds to every tool response. It lets an agent see where the data came from
// (data_from_*), what the user was looking at (active_*), how the call was made, and whether the result was
// stored. It reaches the agent on every call, whatever the tool, so sensitive tabs are always redacted here.
export function buildSourceBlock({ tool, timestamp, params, result, activeTab }) {
  const dataUrl = result?.meta?.url ?? params?.url ?? null;
  const visibleTab = redactSensitiveTabData(activeTab);
  return {
    tool,
    timestamp,
    active_url: visibleTab?.url ?? null,
    active_tab_title: visibleTab?.title ?? null,
    active_tab_id: activeTab?.id != null ? String(activeTab.id) : null,
    // May differ from the active tab.
    data_from_url: isSensitiveUrl(dataUrl) ? REDACTED_TAB_VALUE : dataUrl,
    data_from_tab: params?.tabId ?? 'active',
    same_origin: sameOrigin(activeTab?.url, dataUrl),
    params_provided: Object.keys(params ?? {}),
    stored: Boolean(result?.ref),
    ref: result?.ref ?? null,
    project: params?.project ?? result?.meta?.project ?? 'default',
    bridge_connected: activeTab !== null,
  };
}
