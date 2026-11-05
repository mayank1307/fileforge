import { resolveTabId, runInTab } from './contentBridge.js';

export const responsiveModule = {
  async scanLayout({ tabId = 'active', checks = ['overflow', 'overlap'] } = {}) {
    const id = await resolveTabId(tabId);
    const data = await runInTab(
      id,
      (checks) => ({
        overflow: checks.includes('overflow') ? window.__fileforge_inspect.responsive.findOverflow() : undefined,
        overlaps: checks.includes('overlap') || checks.includes('overlaps')
          ? window.__fileforge_inspect.responsive.findOverlaps()
          : undefined,
      }),
      [checks]
    );
    return { ok: true, data: { tabId: id, ...data } };
  },

  async findOverflow({ tabId = 'active' } = {}) {
    const id = await resolveTabId(tabId);
    const overflow = await runInTab(id, () => window.__fileforge_inspect.responsive.findOverflow());
    return { ok: true, data: { tabId: id, overflow } };
  },

  async findOverlaps({ tabId = 'active' } = {}) {
    const id = await resolveTabId(tabId);
    const overlaps = await runInTab(id, () => window.__fileforge_inspect.responsive.findOverlaps());
    return { ok: true, data: { tabId: id, overlaps } };
  },
};
