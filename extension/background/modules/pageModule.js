import { resolveTabId, runInTab } from './contentBridge.js';

// ── Page State Store (for wait_for_page_change / compare_snapshots) ───────────
const PAGE_STATE_TTL_MS = 10 * 60 * 1000;
const MAX_PAGE_STATES = 50;
const _pageStateStore = new Map();

function _storePageState(data) {
  const stateId = `page_state_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  if (_pageStateStore.size >= MAX_PAGE_STATES) {
    _pageStateStore.delete(_pageStateStore.keys().next().value);
  }
  _pageStateStore.set(stateId, { ...data, stateId, storedAt: new Date().toISOString(), expiresAt: Date.now() + PAGE_STATE_TTL_MS });
  return stateId;
}

function _getPageState(stateId) {
  const s = _pageStateStore.get(stateId);
  if (!s) return null;
  if (Date.now() > s.expiresAt) { _pageStateStore.delete(stateId); return null; }
  return s;
}

// Track hidden elements per tab for restore
const hiddenElementsMap = new Map();
// Track element watches per tab
const elementWatches = new Map();

export const pageModule = {
  async getHtml({ tabId = 'active', maxLength = 200000 } = {}) {
    const id = await resolveTabId(tabId);
    const html = await runInTab(id, (maxLength) => {
      const raw = document.documentElement?.outerHTML ?? '';
      return {
        length: raw.length,
        truncated: raw.length > maxLength,
        html: raw.slice(0, maxLength),
      };
    }, [maxLength]);
    return { ok: true, data: { tabId: id, ...html } };
  },

  async getText({ tabId = 'active' } = {}) {
    const id = await resolveTabId(tabId);
    const text = await runInTab(id, () => document.body?.innerText ?? '');
    return { ok: true, data: { tabId: id, text } };
  },

  async getDomSnapshot({ tabId = 'active', depth = 10 } = {}) {
    const id = await resolveTabId(tabId);
    const snapshot = await runInTab(id, (depth) => window.__fileforge_inspect.dom.getSnapshot(depth), [depth]);
    return { ok: true, data: { tabId: id, snapshot } };
  },

  async getAccessibilityTree({ tabId = 'active' } = {}) {
    const id = await resolveTabId(tabId);
    const tree = await runInTab(id, () => window.__fileforge_inspect.accessibility.getTree());
    return { ok: true, data: { tabId: id, tree } };
  },

  async getInteractiveElements({ tabId = 'active', includeSelectors = true } = {}) {
    const id = await resolveTabId(tabId);
    const elements = await runInTab(
      id,
      (includeSelectors) => {
        const items = window.__fileforge_inspect.dom.getInteractiveElements();
        return includeSelectors ? items : items.map(({ selector: _selector, ...item }) => item);
      },
      [includeSelectors]
    );
    return { ok: true, data: { tabId: id, elements } };
  },

  async getForms({ tabId = 'active' } = {}) {
    const id = await resolveTabId(tabId);
    const forms = await runInTab(id, () => window.__fileforge_inspect.dom.getForms());
    return { ok: true, data: { tabId: id, forms } };
  },

  async waitForSelector({ tabId = 'active', selector, timeoutMs = 10000 } = {}) {
    const id = await resolveTabId(tabId);
    const found = await runInTab(
      id,
      (selector, timeoutMs) =>
        new Promise((resolve) => {
          if (document.querySelector(selector)) return resolve(true);
          const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) {
              observer.disconnect();
              clearTimeout(timer);
              resolve(true);
            }
          });
          const timer = setTimeout(() => {
            observer.disconnect();
            resolve(false);
          }, timeoutMs);
          observer.observe(document.documentElement, { childList: true, subtree: true });
        }),
      [selector, timeoutMs]
    );
    return found
      ? { ok: true, data: { tabId: id, selector, found: true } }
      : { ok: false, error: { code: 'SELECTOR_TIMEOUT', message: `Selector not found: ${selector}` } };
  },

  async click({ tabId = 'active', selector } = {}) {
    const id = await resolveTabId(tabId);
    const result = await runInTab(
      id,
      (selector) => {
        const el = document.querySelector(selector);
        if (!el) return { ok: false, message: `Selector not found: ${selector}` };
        el.click();
        return { ok: true };
      },
      [selector]
    );
    if (!result?.ok) return { ok: false, error: { code: 'SELECTOR_NOT_FOUND', message: result?.message } };
    return { ok: true, data: { tabId: id, selector, clicked: true } };
  },

  async fill({ tabId = 'active', selector, value } = {}) {
    const id = await resolveTabId(tabId);
    const result = await runInTab(
      id,
      (selector, value) => {
        const el = document.querySelector(selector);
        if (!el) return { ok: false, message: `Selector not found: ${selector}` };
        el.focus();

        const isContentEditable =
          el.isContentEditable ||
          el.getAttribute('contenteditable') === 'true' ||
          el.getAttribute('contenteditable') === '';

        if (isContentEditable) {
          // Place caret in element, select all existing content, then insert text via
          // execCommand so React/Polymer (YouTube, Instagram, Slate, Lexical, Draft)
          // sees the beforeinput/input events with InputEvent semantics.
          const range = document.createRange();
          range.selectNodeContents(el);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          let inserted = false;
          try {
            inserted = document.execCommand('insertText', false, value);
          } catch (_) {}
          if (!inserted) {
            // Fallback: dispatch InputEvent so frameworks register the change.
            try {
              el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
              el.textContent = value;
              el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
            } catch (_) {
              el.textContent = value;
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, mode: 'contenteditable' };
        }

        // Standard <input> / <textarea> path. Use the native setter so React's
        // synthetic event system picks up the change (React tracks the last
        // value seen by the input via a hidden property).
        const proto = el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) {
          setter.call(el, value);
        } else {
          el.value = value;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, mode: 'value' };
      },
      [selector, value]
    );
    if (!result?.ok) return { ok: false, error: { code: 'SELECTOR_NOT_FOUND', message: result?.message } };
    return { ok: true, data: { tabId: id, selector, filled: true, mode: result.mode } };
  },

  async scroll({ tabId = 'active', selector, direction = 'down', amount = 500 } = {}) {
    const id = await resolveTabId(tabId);
    const result = await runInTab(
      id,
      (selector, direction, amount) => {
        const target = selector ? document.querySelector(selector) : window;
        if (!target) return { ok: false, message: `Selector not found: ${selector}` };

        const isWindow = target === window;
        const before = isWindow
          ? { x: window.scrollX, y: window.scrollY }
          : { x: target.scrollLeft, y: target.scrollTop };
        const maxTop = isWindow
          ? document.documentElement.scrollHeight
          : target.scrollHeight;

        if (direction === 'top' || direction === 'bottom') {
          const options = { top: direction === 'top' ? 0 : maxTop, behavior: 'smooth' };
          if (isWindow) window.scrollTo(options);
          else target.scrollTo(options);
        } else {
          const delta = direction === 'up' ? -Number(amount || 0) : Number(amount || 0);
          const options = { top: delta, behavior: 'smooth' };
          if (isWindow) window.scrollBy(options);
          else target.scrollBy(options);
        }

        const after = isWindow
          ? { x: window.scrollX, y: window.scrollY }
          : { x: target.scrollLeft, y: target.scrollTop };
        return { ok: true, before, after };
      },
      [selector, direction, amount]
    );
    if (!result?.ok) return { ok: false, error: { code: 'SELECTOR_NOT_FOUND', message: result?.message } };
    return { ok: true, data: { tabId: id, selector, direction, amount, before: result.before, after: result.after } };
  },

  async reveal({ tabId = 'active', selector } = {}) {
    const id = await resolveTabId(tabId);
    const result = await runInTab(
      id,
      (selector) => {
        const el = document.querySelector(selector);
        if (!el) return { ok: false, message: `Selector not found: ${selector}` };
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
        return { ok: true };
      },
      [selector]
    );
    if (!result?.ok) return { ok: false, error: { code: 'SELECTOR_NOT_FOUND', message: result?.message } };
    return { ok: true, data: { tabId: id, selector, revealed: true } };
  },

  // === Phase 6: Element Debug Helpers ===

  async getElementDebugInfo({ tabId = 'active', selector } = {}) {
    const id = await resolveTabId(tabId);
    const info = await runInTab(
      id,
      (selector) => window.__fileforge_inspect.dom.getElementDebugInfo(selector),
      [selector]
    );
    if (!info?.found) {
      return {
        ok: false,
        error: {
          code: 'SELECTOR_NOT_FOUND',
          message: info?.suggestion ?? `Selector not found: ${selector}`,
          candidates: info?.candidates,
        },
        data: info,
      };
    }
    return { ok: true, data: { tabId: id, ...info } };
  },

  async hideElements({ tabId = 'active', selectors = [] } = {}) {
    const id = await resolveTabId(tabId);
    const result = await runInTab(
      id,
      (selectors) => {
        const hidden = [];
        const warnings = [];
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length === 0) {
            warnings.push(`No elements found for: ${selector}`);
            continue;
          }
          for (const el of elements) {
            // Store original styles for restoration
            const prevDisplay = el.style.display;
            const prevVisibility = el.style.visibility;
            el.dataset.fileforgeHiddenDisplay = prevDisplay;
            el.dataset.fileforgeHiddenVisibility = prevVisibility;
            el.dataset.fileforgeHidden = 'true';
            el.style.display = 'none';
            hidden.push({
              selector,
              tag: el.tagName.toLowerCase(),
              id: el.id || undefined,
            });
          }
        }
        // Track total count for status
        const totalHidden = document.querySelectorAll('[data-fileforge-hidden="true"]').length;
        return { hidden, totalHidden, warnings };
      },
      [selectors]
    );

    // Track in background for restore
    const existing = hiddenElementsMap.get(id) ?? [];
    existing.push(...(result.hidden ?? []));
    hiddenElementsMap.set(id, existing);

    return {
      ok: true,
      data: {
        tabId: id,
        hidden: result.hidden,
        totalHidden: result.totalHidden,
      },
      warnings: result.warnings?.length ? result.warnings : undefined,
    };
  },

  async restoreHiddenElements({ tabId = 'active' } = {}) {
    const id = await resolveTabId(tabId);
    const result = await runInTab(id, () => {
      const hiddenEls = document.querySelectorAll('[data-fileforge-hidden="true"]');
      const restored = [];
      for (const el of hiddenEls) {
        el.style.display = el.dataset.fileforgeHiddenDisplay ?? '';
        el.style.visibility = el.dataset.fileforgeHiddenVisibility ?? '';
        delete el.dataset.fileforgeHidden;
        delete el.dataset.fileforgeHiddenDisplay;
        delete el.dataset.fileforgeHiddenVisibility;
        restored.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || undefined,
        });
      }
      return { restored, count: restored.length };
    });

    hiddenElementsMap.delete(id);

    return {
      ok: true,
      data: {
        tabId: id,
        restored: result.restored,
        count: result.count,
      },
    };
  },

  async watchElement({ tabId = 'active', selector, watchId, timeoutMs = 30000 } = {}) {
    const id = await resolveTabId(tabId);
    const wId = watchId ?? `watch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Capture initial state
    const initial = await runInTab(
      id,
      (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          visible: style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0,
          text: (el.innerText || '').trim().slice(0, 500),
          box: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          html: el.outerHTML.slice(0, 2000),
          display: style.display,
          opacity: style.opacity,
          timestamp: new Date().toISOString(),
        };
      },
      [selector]
    );

    if (!initial) {
      return {
        ok: false,
        error: { code: 'SELECTOR_NOT_FOUND', message: `Element not found: ${selector}` },
      };
    }

    const watch = {
      watchId: wId,
      tabId: id,
      selector,
      initial,
      startedAt: new Date().toISOString(),
      timeoutMs,
      status: 'watching',
      changes: [],
    };

    elementWatches.set(wId, watch);

    // Set up polling (lightweight, runs every 500ms)
    const pollInterval = setInterval(async () => {
      try {
        const current = await runInTab(
          id,
          (selector) => {
            const el = document.querySelector(selector);
            if (!el) return { gone: true, timestamp: new Date().toISOString() };
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return {
              visible: style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0,
              text: (el.innerText || '').trim().slice(0, 500),
              box: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              },
              display: style.display,
              opacity: style.opacity,
              timestamp: new Date().toISOString(),
            };
          },
          [selector]
        );

        const prev = watch.changes.length ? watch.changes[watch.changes.length - 1].current : watch.initial;
        const changed = current.gone ||
          current.visible !== prev.visible ||
          current.text !== prev.text ||
          current.box?.width !== prev.box?.width ||
          current.box?.height !== prev.box?.height ||
          current.box?.x !== prev.box?.x ||
          current.box?.y !== prev.box?.y;

        if (changed) {
          watch.changes.push({ before: prev, current, detectedAt: new Date().toISOString() });
        }
      } catch (_) {
        // Tab closed or unavailable — stop watching
        clearInterval(pollInterval);
        watch.status = 'error';
        watch.error = 'Tab closed or unavailable';
      }
    }, 500);

    // Auto-timeout
    setTimeout(() => {
      clearInterval(pollInterval);
      if (watch.status === 'watching') {
        watch.status = 'timeout';
        watch.endedAt = new Date().toISOString();
      }
    }, timeoutMs);

    // Store cleanup ref
    watch._interval = pollInterval;

    return {
      ok: true,
      data: {
        watchId: wId,
        tabId: id,
        selector,
        initial,
        status: 'watching',
        timeoutMs,
      },
    };
  },

  async getWatchStatus({ watchId } = {}) {
    const watch = elementWatches.get(watchId);
    if (!watch) {
      return {
        ok: false,
        error: { code: 'WATCH_NOT_FOUND', message: `No watch with ID: ${watchId}` },
      };
    }

    return {
      ok: true,
      data: {
        watchId: watch.watchId,
        tabId: watch.tabId,
        selector: watch.selector,
        status: watch.status,
        startedAt: watch.startedAt,
        endedAt: watch.endedAt,
        changeCount: watch.changes.length,
        changes: watch.changes,
        initial: watch.initial,
        error: watch.error,
      },
    };
  },

  async captureElementChange({ watchId, tabId = 'active', selector } = {}) {
    const id = await resolveTabId(tabId);

    // If watchId provided, use the watch data
    if (watchId) {
      const watch = elementWatches.get(watchId);
      if (!watch) {
        return {
          ok: false,
          error: { code: 'WATCH_NOT_FOUND', message: `No watch with ID: ${watchId}` },
        };
      }

      // Stop the watch
      if (watch._interval) clearInterval(watch._interval);
      watch.status = 'captured';
      watch.endedAt = new Date().toISOString();

      return {
        ok: true,
        data: {
          watchId: watch.watchId,
          tabId: watch.tabId,
          selector: watch.selector,
          initial: watch.initial,
          changes: watch.changes,
          changeCount: watch.changes.length,
          status: 'captured',
          startedAt: watch.startedAt,
          endedAt: watch.endedAt,
          durationMs: new Date(watch.endedAt) - new Date(watch.startedAt),
        },
      };
    }

    // If no watchId, capture current state vs selector
    if (!selector) {
      return {
        ok: false,
        error: { code: 'MISSING_PARAMS', message: 'Provide either watchId or selector.' },
      };
    }

    const current = await runInTab(
      id,
      (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          visible: style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0,
          text: (el.innerText || '').trim().slice(0, 500),
          box: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          html: el.outerHTML.slice(0, 2000),
          display: style.display,
          opacity: style.opacity,
          timestamp: new Date().toISOString(),
        };
      },
      [selector]
    );

    if (!current) {
      return {
        ok: false,
        error: { code: 'SELECTOR_NOT_FOUND', message: `Element not found: ${selector}` },
      };
    }

    return {
      ok: true,
      data: {
        tabId: id,
        selector,
        snapshot: current,
        capturedAt: new Date().toISOString(),
      },
    };
  },

  // === Phase 4: Reader And Content Clarity Tools ===

  async extractArticle({ tabId = 'active', maxTextLength = 50000 } = {}) {
    const id = await resolveTabId(tabId);
    const article = await runInTab(
      id,
      (maxTextLength) => window.__fileforge_inspect.dom.extractArticle({ maxTextLength }),
      [maxTextLength]
    );
    if (!article) {
      return {
        ok: false,
        error: { code: 'EXTRACTION_FAILED', message: 'Article extraction returned null.' },
      };
    }
    return { ok: true, data: { tabId: id, ...article } };
  },

  // ── QA / Debugging actions ────────────────────────────────────────────────

  async assert({ tabId = 'active', assertions = [], timeoutMs } = {}) {
    const id = await resolveTabId(tabId);
    if (!Array.isArray(assertions) || assertions.length === 0) {
      return { ok: false, error: { code: 'INVALID_ARGUMENT', message: 'assertions array is required and must not be empty', path: 'assertions' } };
    }
    const results = await runInTab(id, (a) => window.__fileforge_inspect.qa.runAssertions(a), [assertions]);
    const passed = results.filter((r) => r.ok).length;
    const failed = results.length - passed;
    return {
      ok: failed === 0,
      schemaVersion: 'page.assert.v1',
      timestamp: new Date().toISOString(),
      passed, failed, results,
    };
  },

  async smokeTest({ tabId = 'active', checks } = {}) {
    const id = await resolveTabId(tabId);
    const DEFAULT_CHECKS = ['page_loaded', 'no_blank_screen', 'has_visible_text', 'no_obvious_error_text', 'no_broken_images', 'no_horizontal_overflow'];
    const effectiveChecks = Array.isArray(checks) && checks.length > 0 ? checks : DEFAULT_CHECKS;
    const { results, summary } = await runInTab(id, (c) => window.__fileforge_inspect.qa.runSmokeTest(c), [effectiveChecks]);
    const passed = results.filter((r) => r.ok).length;
    const failed = results.length - passed;
    const snapshot = await runInTab(id, () => window.__fileforge_inspect.qa.getPageSnapshot());
    const stateId = _storePageState(snapshot);
    return {
      ok: failed === 0,
      schemaVersion: 'page.smoke_test.v1',
      timestamp: new Date().toISOString(),
      passed, failed, checks: results, summary, stateId,
    };
  },

  async findErrors({ tabId = 'active', includeHidden = false, maxMatches = 50 } = {}) {
    const id = await resolveTabId(tabId);
    const matches = await runInTab(id, (opts) => window.__fileforge_inspect.qa.findVisibleErrors(opts), [{ includeHidden, maxMatches }]);
    const highestSeverity = matches.length === 0 ? null : matches.some((m) => m.severity === 'high') ? 'high' : matches.some((m) => m.severity === 'medium') ? 'medium' : 'low';
    return {
      ok: true,
      schemaVersion: 'page.find_errors.v1',
      timestamp: new Date().toISOString(),
      errorsFound: matches.length > 0,
      matches,
      summary: { totalMatches: matches.length, highestSeverity },
    };
  },

  async checkBrokenImages({ tabId = 'active', includeHidden = false } = {}) {
    const id = await resolveTabId(tabId);
    const result = await runInTab(id, (opts) => window.__fileforge_inspect.qa.checkBrokenImages(opts), [{ includeHidden }]);
    return {
      ok: true,
      schemaVersion: 'page.check_broken_images.v1',
      timestamp: new Date().toISOString(),
      ...result,
    };
  },

  async checkLinks({ tabId = 'active', mode = 'extract_only', includeExternal = true, includeHidden = false } = {}) {
    const id = await resolveTabId(tabId);
    if (!['extract_only', 'validate_same_origin', 'validate_all'].includes(mode)) {
      return { ok: false, error: { code: 'UNSUPPORTED_MODE', message: `Unknown mode: "${mode}". Use extract_only, validate_same_origin, or validate_all.`, path: 'mode' } };
    }
    const result = await runInTab(id, (opts) => window.__fileforge_inspect.qa.checkLinks(opts), [{ includeExternal, includeHidden }]);
    return {
      ok: true,
      schemaVersion: 'page.check_links.v1',
      timestamp: new Date().toISOString(),
      mode,
      ...result,
    };
  },

  async checkLayout({ tabId = 'active', checks } = {}) {
    const id = await resolveTabId(tabId);
    const DEFAULT_CHECKS = ['horizontal_overflow', 'zero_size_clickables', 'overlapping_clickables', 'modal_blockers', 'offscreen_fixed_elements', 'tiny_text', 'hidden_focusable_elements'];
    const effectiveChecks = Array.isArray(checks) && checks.length > 0 ? checks : DEFAULT_CHECKS;
    const result = await runInTab(id, (c) => window.__fileforge_inspect.qa.checkLayout(c), [effectiveChecks]);
    return {
      ok: true,
      schemaVersion: 'page.check_layout.v1',
      timestamp: new Date().toISOString(),
      issuesFound: result.issues.length > 0,
      ...result,
    };
  },

  async debugSelector({ tabId = 'active', selector } = {}) {
    if (!selector) return { ok: false, error: { code: 'INVALID_ARGUMENT', message: 'selector is required', path: 'selector' } };
    const id = await resolveTabId(tabId);
    const result = await runInTab(id, (s) => window.__fileforge_inspect.qa.debugSelector(s), [selector]);
    return {
      ...(result.ok !== false ? { ok: true } : {}),
      schemaVersion: 'page.debug_selector.v1',
      timestamp: new Date().toISOString(),
      ...result,
    };
  },

  async debugClickability({ tabId = 'active', selector } = {}) {
    if (!selector) return { ok: false, error: { code: 'INVALID_ARGUMENT', message: 'selector is required', path: 'selector' } };
    const id = await resolveTabId(tabId);
    const result = await runInTab(id, (s) => window.__fileforge_inspect.qa.debugClickability(s), [selector]);
    return {
      schemaVersion: 'page.debug_clickability.v1',
      timestamp: new Date().toISOString(),
      ...result,
    };
  },

  async captureBundle({ tabId = 'active', include, maxTextChars = 6000, maxElements = 100 } = {}) {
    const id = await resolveTabId(tabId);
    const bundle = await runInTab(id, (opts) => window.__fileforge_inspect.qa.captureBundle(opts), [{ include, maxTextChars, maxElements }]);
    const snapshot = bundle._snapshot ?? {};
    delete bundle._snapshot;
    const stateId = _storePageState(snapshot);
    const debugBundleId = `debug_${Math.random().toString(36).slice(2, 10)}`;
    return {
      ok: true,
      schemaVersion: 'page.debug_bundle.v1',
      timestamp: new Date().toISOString(),
      debugBundleId, stateId,
      ...bundle,
      summary: {
        errorsFound: (bundle.errors?.length ?? 0) > 0,
        layoutIssues: bundle.layoutIssues?.length ?? 0,
        brokenImages: bundle.brokenImages?.count ?? 0,
        interactiveElements: bundle.interactiveElements?.count ?? 0,
        forms: bundle.forms?.length ?? 0,
      },
      recoverySuggestions: (bundle.errors?.length ?? 0) > 0
        ? [{ action: 'find_errors', reason: 'Inspect visible errors in detail' }]
        : (bundle.layoutIssues?.length ?? 0) > 0
          ? [{ action: 'check_layout', reason: 'Inspect layout issues' }]
          : [],
    };
  },

  async waitForPageChange({ tabId = 'active', previousStateId, previousUrl, previousTextHash, timeoutMs = 10000, changeTypes } = {}) {
    const id = await resolveTabId(tabId);
    const watchTypes = new Set(changeTypes ?? ['url', 'title', 'visibleText', 'interactiveElements']);

    let baseline;
    if (previousStateId) {
      baseline = _getPageState(previousStateId);
      if (!baseline) return { ok: false, error: { code: 'STATE_NOT_FOUND', message: `No state found: ${previousStateId}` }, changed: false };
    } else {
      baseline = await runInTab(id, () => window.__fileforge_inspect.qa.getPageSnapshot());
      if (previousUrl) baseline.url = previousUrl;
      if (previousTextHash) baseline.hashes.visibleText = previousTextHash;
    }

    const startedAt = Date.now();
    return new Promise((resolve) => {
      const poll = setInterval(async () => {
        try {
          const current = await runInTab(id, () => window.__fileforge_inspect.qa.getPageSnapshot());
          const changed = [];
          if (watchTypes.has('url') && current.url !== baseline.url) changed.push('url');
          if (watchTypes.has('title') && current.title !== baseline.title) changed.push('title');
          if (watchTypes.has('visibleText') && current.hashes.visibleText !== baseline.hashes.visibleText) changed.push('visibleText');
          if (watchTypes.has('interactiveElements') && current.hashes.interactiveElements !== baseline.hashes.interactiveElements) changed.push('interactiveElements');
          if (watchTypes.has('dom') && current.hashes.visibleText !== baseline.hashes.visibleText) changed.push('dom');

          if (changed.length > 0) {
            clearInterval(poll);
            const newStateId = _storePageState(current);
            resolve({ ok: true, schemaVersion: 'page.wait_for_page_change.v1', timestamp: new Date().toISOString(), changed: true, changeTypes: changed, before: { url: baseline.url, title: baseline.title }, after: { url: current.url, title: current.title }, newStateId });
          } else if (Date.now() - startedAt >= timeoutMs) {
            clearInterval(poll);
            resolve({ ok: false, error: { code: 'TIMEOUT', message: `No page change within ${timeoutMs}ms` }, changed: false });
          }
        } catch {
          clearInterval(poll);
          resolve({ ok: true, schemaVersion: 'page.wait_for_page_change.v1', timestamp: new Date().toISOString(), changed: true, changeTypes: ['navigation'], before: { url: baseline.url }, after: { url: 'navigating' }, newStateId: null });
        }
      }, 500);
    });
  },

  async compareSnapshots({ beforeStateId, afterStateId } = {}) {
    if (!beforeStateId || !afterStateId) return { ok: false, error: { code: 'INVALID_ARGUMENT', message: 'beforeStateId and afterStateId are required' } };
    const before = _getPageState(beforeStateId);
    const after = _getPageState(afterStateId);
    if (!before) return { ok: false, error: { code: 'STATE_NOT_FOUND', message: `State not found: ${beforeStateId}` } };
    if (!after) return { ok: false, error: { code: 'STATE_NOT_FOUND', message: `State not found: ${afterStateId}` } };

    const urlChanged = before.url !== after.url;
    const titleChanged = before.title !== after.title;
    const textChanged = before.hashes?.visibleText !== after.hashes?.visibleText;
    const elementsChanged = before.hashes?.interactiveElements !== after.hashes?.interactiveElements;

    const beforeEls = new Map((before.elements ?? []).map((e) => [e.selector, e]));
    const afterEls = new Map((after.elements ?? []).map((e) => [e.selector, e]));
    const addedElements = [...afterEls.values()].filter((e) => !beforeEls.has(e.selector));
    const removedElements = [...beforeEls.values()].filter((e) => !afterEls.has(e.selector));

    const newErrors = (after.errors ?? []).filter((e) => !(before.errors ?? []).some((b) => b.text === e.text));
    const resolvedErrors = (before.errors ?? []).filter((e) => !(after.errors ?? []).some((a) => a.text === e.text));

    const changed = urlChanged || titleChanged || textChanged || elementsChanged;
    return {
      ok: true,
      schemaVersion: 'page.compare_snapshots.v1',
      timestamp: new Date().toISOString(),
      changed,
      beforeStateId, afterStateId,
      changes: { urlChanged, titleChanged, visibleTextChanged: textChanged, interactiveElementsChanged: elementsChanged, formsChanged: before.formCount !== after.formCount, newErrors, resolvedErrors, addedElements: addedElements.slice(0, 20), removedElements: removedElements.slice(0, 20) },
    };
  },

  async compareVisibleVsArticle({ tabId = 'active', maxTextLength = 50000 } = {}) {
    const id = await resolveTabId(tabId);

    // Get both visible text and article-extracted text
    const [visibleResult, articleResult] = await Promise.all([
      runInTab(id, () => {
        const text = (document.body?.innerText || '').trim();
        return {
          text,
          length: text.length,
          wordCount: text.split(/\s+/).filter(Boolean).length,
        };
      }),
      runInTab(
        id,
        (maxTextLength) => window.__fileforge_inspect.dom.extractArticle({ maxTextLength }),
        [maxTextLength]
      ),
    ]);

    if (!visibleResult || !articleResult) {
      return {
        ok: false,
        error: { code: 'COMPARISON_FAILED', message: 'Could not extract both visible and article text.' },
      };
    }

    const visibleText = visibleResult.text || '';
    const articleText = articleResult.text || '';

    // Compute comparison metrics
    const visibleWords = visibleText.split(/\s+/).filter(Boolean);
    const articleWords = articleText.split(/\s+/).filter(Boolean);

    const visibleLines = visibleText.split('\n').filter((l) => l.trim());
    const articleLines = articleText.split('\n').filter((l) => l.trim());

    // Find text only in visible (noise — nav, footer, ads, etc.)
    const articleSet = new Set(articleLines.map((l) => l.trim().toLowerCase()));
    const visibleSet = new Set(visibleLines.map((l) => l.trim().toLowerCase()));

    const noiseLines = visibleLines.filter((l) => !articleSet.has(l.trim().toLowerCase()));
    const missingLines = articleLines.filter((l) => !visibleSet.has(l.trim().toLowerCase()));

    const ratioArticleToVisible = visibleResult.wordCount > 0
      ? Math.round((articleResult.wordCount / visibleResult.wordCount) * 100) / 100
      : 0;

    // Content clarity score: higher = cleaner page (article is most of visible text)
    const clarityScore = Math.min(100, Math.round(ratioArticleToVisible * 100));

    // Diagnosis
    const diagnosis = [];
    if (clarityScore < 30) {
      diagnosis.push('Very low content clarity — article text is a small fraction of visible page. This page may be navigation-heavy, a dashboard, or a SPA shell.');
    } else if (clarityScore < 60) {
      diagnosis.push('Moderate content clarity — significant non-article content is visible (nav, sidebar, footer, ads).');
    } else {
      diagnosis.push('Good content clarity — article text dominates the visible page.');
    }

    if (noiseLines.length > 50) {
      diagnosis.push(`${noiseLines.length} visible lines are NOT in the article extraction (likely navigation, ads, footer, sidebar).`);
    }
    if (missingLines.length > 10) {
      diagnosis.push(`${missingLines.length} article lines are NOT in the visible text (elements may be hidden, collapsed, or lazy-loaded).`);
    }
    if (articleResult.extraction?.layer === 'fallback') {
      diagnosis.push('Article extraction fell back to body — no semantic article container was found.');
    }

    return {
      ok: true,
      data: {
        tabId: id,
        url: articleResult.url,
        visible: {
          wordCount: visibleResult.wordCount,
          lineCount: visibleLines.length,
          textLength: visibleResult.length,
          textSample: visibleText.slice(0, 1000),
        },
        article: {
          title: articleResult.title,
          byline: articleResult.byline,
          wordCount: articleResult.wordCount,
          lineCount: articleLines.length,
          textLength: articleResult.textLength,
          textSample: articleText.slice(0, 1000),
          extraction: articleResult.extraction,
        },
        comparison: {
          ratioArticleToVisible,
          clarityScore,
          noiseLineCount: noiseLines.length,
          missingLineCount: missingLines.length,
          noiseSample: noiseLines.slice(0, 20).map((l) => l.trim().slice(0, 120)),
          missingSample: missingLines.slice(0, 20).map((l) => l.trim().slice(0, 120)),
        },
        diagnosis,
      },
    };
  },
};
