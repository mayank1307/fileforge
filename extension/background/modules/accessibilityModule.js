import { resolveTabId, runInTab } from './contentBridge.js';

export const accessibilityModule = {
  async audit({ tabId = 'active', standard = 'wcag2aa' } = {}) {
    const id = await resolveTabId(tabId);
    const data = await runInTab(
      id,
      (standard) => ({
        standard,
        tree: window.__fileforge_inspect.accessibility.getTree(),
        contrastIssues: window.__fileforge_inspect.accessibility.checkContrast(),
        headings: window.__fileforge_inspect.accessibility.getHeadingOrder(),
        findings: window.__fileforge_inspect.accessibility.getFindings(),
      }),
      [standard]
    );
    return { ok: true, data: { tabId: id, ...data } };
  },

  async getTree({ tabId = 'active' } = {}) {
    const id = await resolveTabId(tabId);
    const tree = await runInTab(id, () => window.__fileforge_inspect.accessibility.getTree());
    return { ok: true, data: { tabId: id, tree } };
  },

  async checkKeyboard({ tabId = 'active' } = {}) {
    const id = await resolveTabId(tabId);
    const focusable = await runInTab(
      id,
      () => window.__fileforge_inspect.dom.getInteractiveElements().map((el, index) => ({ index, ...el }))
    );
    return { ok: true, data: { tabId: id, focusable } };
  },

  async checkContrast({ tabId = 'active' } = {}) {
    const id = await resolveTabId(tabId);
    const issues = await runInTab(id, () => window.__fileforge_inspect.accessibility.checkContrast());
    return { ok: true, data: { tabId: id, issues } };
  },
};
