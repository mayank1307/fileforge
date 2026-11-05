import { registry } from '../registry.js';
import { collectLayeredSnapshot, shouldFallbackToLayeredSnapshot } from '../utils/layeredSnapshotUtils.js';
import { maybeStoreResult } from '../utils/resultUtils.js';

// ─── Action Aliases ───────────────────────────────────────────────────────────

const ACTION_ALIASES = {
  // camelCase dot-notation → snake_case
  'page.getText': 'get_text',
  'page.getDomSnapshot': 'get_dom_snapshot',
  'page.getLayeredSnapshot': 'get_layered_snapshot',
  'page.getAccessibilityTree': 'get_accessibility_tree',
  'page.getInteractiveElements': 'get_interactive_elements',
  'page.getForms': 'get_forms',
  'page.waitForSelector': 'wait_for_selector',
  'page.click': 'click',
  'page.fill': 'fill',
  'page.scroll': 'scroll',
  'page.reveal': 'reveal',
  'page.screenshot': 'screenshot',
  'page.extractArticle': 'extract_article',
  'page.getElementDebugInfo': 'get_element_debug_info',
  'page.hideElements': 'hide_elements',
  'page.restoreHiddenElements': 'restore_hidden_elements',
  'page.compareVisibleVsArticle': 'compare_visible_vs_article',
  'page.queryPage': 'query_page',
  // new QA actions
  'page.assert': 'assert',
  'page.smokeTest': 'smoke_test',
  'page.findErrors': 'find_errors',
  'page.checkBrokenImages': 'check_broken_images',
  'page.checkLinks': 'check_links',
  'page.checkLayout': 'check_layout',
  'page.debugSelector': 'debug_selector',
  'page.debugClickability': 'debug_clickability',
  'page.captureDebugBundle': 'capture_debug_bundle',
  'page.waitForPageChange': 'wait_for_page_change',
  'page.compareSnapshots': 'compare_snapshots',
};

function normalizeActionName(action) {
  return ACTION_ALIASES[action] ?? action;
}

// ─── Capabilities ─────────────────────────────────────────────────────────────

const pageCapabilities = {
  tool: 'fileforge_page_interaction',
  actions: {
    get_text: { description: 'Get visible text from a page or selector.', risk: 'low', flags: { read: true, browser: true } },
    get_dom_snapshot: { description: 'Snapshot the DOM tree.', risk: 'low', flags: { read: true, browser: true, artifact: true } },
    get_layered_snapshot: { description: 'Layered DOM snapshot with screenshots.', risk: 'medium', flags: { read: true, browser: true, artifact: true } },
    get_accessibility_tree: { description: 'Get the page accessibility tree.', risk: 'low', flags: { read: true, browser: true, artifact: true } },
    get_interactive_elements: { description: 'List interactive elements on the page.', risk: 'low', flags: { read: true, browser: true } },
    get_forms: { description: 'Extract forms on the page.', risk: 'low', flags: { read: true, browser: true } },
    wait_for_selector: { description: 'Wait for a selector to appear.', risk: 'low', flags: { browser: true } },
    click: { description: 'Click a selector.', risk: 'medium', flags: { write: true, browser: true } },
    fill: { description: 'Fill a form field.', risk: 'medium', flags: { write: true, browser: true } },
    scroll: { description: 'Scroll the page.', risk: 'low', flags: { browser: true } },
    reveal: { description: 'Scroll a selector into view.', risk: 'low', flags: { browser: true } },
    get_element_debug_info: { description: 'Debug info for an element.', risk: 'low', flags: { read: true, browser: true } },
    hide_elements: { description: 'Hide elements matching selectors.', risk: 'medium', flags: { write: true, browser: true } },
    restore_hidden_elements: { description: 'Restore previously hidden elements.', risk: 'low', flags: { write: true, browser: true } },
    extract_article: { description: 'Extract the article-style main content.', risk: 'low', flags: { read: true, browser: true, artifact: true } },
    compare_visible_vs_article: { description: 'Compare visible text against extracted article.', risk: 'low', flags: { read: true, browser: true } },
    // QA / debugging
    assert: { description: 'Run assertions against page state (url, title, text, selectors, inputs).', risk: 'low', flags: { read: true, browser: true } },
    smoke_test: { description: 'Quick health check: loaded, text, interactives, errors, images, layout.', risk: 'low', flags: { read: true, browser: true } },
    find_errors: { description: 'Find visible error text patterns on the page.', risk: 'low', flags: { read: true, browser: true } },
    check_broken_images: { description: 'Detect broken or unloaded images.', risk: 'low', flags: { read: true, browser: true } },
    check_links: { description: 'Inspect all anchor links for missing hrefs, javascript:, external, etc.', risk: 'low', flags: { read: true, browser: true } },
    check_layout: { description: 'Detect layout issues: overflow, zero-size clickables, overlapping elements, modals.', risk: 'low', flags: { read: true, browser: true } },
    debug_selector: { description: 'Debug a CSS selector: match count, visibility, alternatives, warnings.', risk: 'low', flags: { read: true, browser: true } },
    debug_clickability: { description: 'Check why an element can or cannot be clicked.', risk: 'low', flags: { read: true, browser: true } },
    capture_debug_bundle: { description: 'One-call diagnostic bundle: page info, errors, layout, images, links, screenshot.', risk: 'low', flags: { read: true, browser: true, artifact: true } },
    wait_for_page_change: { description: 'Poll until page state changes (url, title, text, elements) or timeout.', risk: 'low', flags: { browser: true } },
    compare_snapshots: { description: 'Compare two stored page state snapshots by stateId.', risk: 'low', flags: { read: true } },
  },
};

// ─── Tool Definition ──────────────────────────────────────────────────────────

const tools = [
  {
    name: 'fileforge_page_interaction',
    description: 'Interact with the DOM, extract page info, run QA checks, and debug failures (click, fill, assert, smoke_test, debug_clickability, capture_debug_bundle, etc.)',
    capabilities: pageCapabilities,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            // existing
            'get_text', 'get_dom_snapshot', 'get_layered_snapshot',
            'get_accessibility_tree', 'get_interactive_elements', 'get_forms',
            'wait_for_selector', 'click', 'fill', 'scroll', 'reveal',
            'get_element_debug_info', 'hide_elements', 'restore_hidden_elements',
            'extract_article', 'compare_visible_vs_article',
            // QA / debugging
            'assert', 'smoke_test', 'find_errors',
            'check_broken_images', 'check_links', 'check_layout',
            'debug_selector', 'debug_clickability',
            'capture_debug_bundle', 'wait_for_page_change', 'compare_snapshots',
          ],
          description: 'The page action to perform.',
        },

        // ── shared ────────────────────────────────────────────────────────
        tabId: { type: 'string', default: 'active' },
        store: { type: 'boolean', default: false },
        selector: { type: 'string', description: 'CSS selector.' },
        selectors: { type: 'array', items: { type: 'string' } },
        timeoutMs: { type: 'number', default: 10000 },

        // ── existing params ───────────────────────────────────────────────
        depth: { type: 'number', description: 'Depth for DOM snapshot' },
        fallback: { type: 'boolean', default: true },
        maxHtmlLength: { type: 'number', default: 200000 },
        textSampleLimit: { type: 'number', default: 5000 },
        includeScreenshotFallback: { type: 'boolean', default: false },
        project: { type: 'string', default: 'default' },
        includeSelectors: { type: 'boolean', default: true },
        value: { type: 'string', description: 'Value to fill' },
        direction: { type: 'string', enum: ['up', 'down', 'top', 'bottom'], default: 'down' },
        amount: { type: 'number', default: 500 },
        maxTextLength: { type: 'number', default: 50000 },

        // ── assert ────────────────────────────────────────────────────────
        assertions: {
          type: 'array',
          description: 'List of assertions. Each has: type, value?, selector?, text?, count?.',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: [
                  'url_equals', 'url_includes', 'url_matches',
                  'title_equals', 'title_includes',
                  'text_visible', 'text_not_visible',
                  'selector_exists', 'selector_not_exists',
                  'selector_visible', 'selector_hidden',
                  'selector_enabled', 'selector_disabled', 'selector_count',
                  'input_value_equals', 'checkbox_checked', 'checkbox_unchecked',
                  'page_ready_state', 'no_visible_errors', 'no_broken_images', 'no_horizontal_overflow',
                ],
              },
              value: { type: 'string' },
              selector: { type: 'string' },
              text: { type: 'string' },
              count: { type: 'number' },
            },
            required: ['type'],
          },
        },

        // ── smoke_test / check_layout ─────────────────────────────────────
        checks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific checks to run (smoke_test or check_layout). Defaults apply if omitted.',
        },

        // ── find_errors / check_broken_images ─────────────────────────────
        includeHidden: { type: 'boolean', default: false, description: 'Include hidden elements in find_errors / check_broken_images / check_links.' },
        maxMatches: { type: 'number', default: 50, description: 'Max matches for find_errors.' },

        // ── check_links ───────────────────────────────────────────────────
        mode: { type: 'string', enum: ['extract_only', 'validate_same_origin', 'validate_all'], default: 'extract_only', description: 'Link checking mode.' },
        includeExternal: { type: 'boolean', default: true },

        // ── capture_debug_bundle ──────────────────────────────────────────
        include: {
          type: 'array',
          items: { type: 'string' },
          description: 'Bundle sections: pageInfo, viewport, visibleText, interactiveElements, forms, screenshot, errors, layoutIssues, brokenImages, links.',
        },
        maxTextChars: { type: 'number', default: 6000 },
        maxElements: { type: 'number', default: 100 },

        // ── wait_for_page_change ──────────────────────────────────────────
        previousStateId: { type: 'string', description: 'stateId from a previous query_page / smoke_test / capture_debug_bundle.' },
        previousUrl: { type: 'string' },
        previousTextHash: { type: 'string' },
        changeTypes: {
          type: 'array',
          items: { type: 'string', enum: ['url', 'title', 'visibleText', 'dom', 'interactiveElements'] },
          description: 'Which change types to watch. Defaults to all.',
        },

        // ── compare_snapshots ─────────────────────────────────────────────
        beforeStateId: { type: 'string' },
        afterStateId: { type: 'string' },
      },
      required: ['action'],
    },

    handler: async (p, { rpcClient }) => {
      const action = normalizeActionName(p.action);
      const meta = { tool: 'fileforge_page_interaction', action };

      switch (action) {

        // ── existing actions ───────────────────────────────────────────────

        case 'get_text': {
          const data = await rpcClient.send('page.getText', p);
          return { ok: true, data, meta };
        }
        case 'get_dom_snapshot': {
          if (p.depth === undefined) p.depth = 10;
          const data = await rpcClient.send('page.getDomSnapshot', p);
          if (p.fallback !== false && shouldFallbackToLayeredSnapshot(data)) {
            const fallback = await collectLayeredSnapshot(rpcClient, p);
            return { ...fallback, warnings: ['Rendered DOM snapshot was empty; returned layered snapshot fallback.', ...(fallback.warnings ?? [])], meta };
          }
          return { ok: true, data, meta };
        }
        case 'get_layered_snapshot': {
          if (p.depth === undefined) p.depth = 6;
          const fallback = await collectLayeredSnapshot(rpcClient, p);
          return { ...fallback, meta };
        }
        case 'get_accessibility_tree': {
          const data = await rpcClient.send('page.getAccessibilityTree', p);
          return { ok: true, data, meta };
        }
        case 'get_interactive_elements': {
          if (p.includeSelectors === undefined) p.includeSelectors = true;
          const data = await rpcClient.send('page.getInteractiveElements', p);
          return { ok: true, data, meta };
        }
        case 'get_forms': {
          const data = await rpcClient.send('page.getForms', p);
          return { ok: true, data, meta };
        }
        case 'wait_for_selector': {
          if (!p.selector) throw new Error('selector is required for wait_for_selector');
          const data = await rpcClient.send('page.waitForSelector', p);
          return { ok: true, data, meta };
        }
        case 'click': {
          if (!p.selector) throw new Error('selector is required for click');
          const data = await rpcClient.send('page.click', p);
          return { ok: true, data, meta };
        }
        case 'fill': {
          if (!p.selector || p.value === undefined) throw new Error('selector and value are required for fill');
          const data = await rpcClient.send('page.fill', p);
          return { ok: true, data, meta };
        }
        case 'scroll': {
          const response = await rpcClient.send('page.scroll', p);
          if (!response?.ok) return { ...response, meta };
          return { ok: true, data: response.data ?? response, meta };
        }
        case 'reveal': {
          if (!p.selector) throw new Error('selector is required for reveal');
          const data = await rpcClient.send('page.reveal', p);
          return { ok: true, data, meta };
        }
        case 'get_element_debug_info': {
          if (!p.selector) throw new Error('selector is required for get_element_debug_info');
          const response = await rpcClient.send('page.getElementDebugInfo', p);
          if (!response?.ok) return { ...response, meta };
          return { ok: true, data: response.data, meta };
        }
        case 'hide_elements': {
          if (!p.selectors) throw new Error('selectors array is required for hide_elements');
          const response = await rpcClient.send('page.hideElements', p);
          if (!response?.ok) return { ...response, meta };
          return { ok: true, data: response.data, warnings: response.warnings, meta };
        }
        case 'restore_hidden_elements': {
          const response = await rpcClient.send('page.restoreHiddenElements', p);
          if (!response?.ok) return { ...response, meta };
          return { ok: true, data: response.data, meta };
        }
        case 'extract_article': {
          const response = await rpcClient.send('page.extractArticle', p);
          if (!response?.ok) return { ...response, meta };
          const data = response.data ?? response;
          const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'article', tool: 'fileforge_page_interaction_extract', url: data.url, data, summary: { title: data.title, byline: data.byline, wordCount: data.wordCount, readingTime: data.readingTime, confidence: data.extraction?.confidence, layer: data.extraction?.layer } });
          return { ok: true, ...stored, data: stored.data ?? data, meta };
        }
        case 'compare_visible_vs_article': {
          const response = await rpcClient.send('page.compareVisibleVsArticle', p);
          if (!response?.ok) return { ...response, meta };
          const data = response.data ?? response;
          const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'content_clarity', tool: 'fileforge_page_interaction_compare', url: data.url, data, summary: { clarityScore: data.comparison?.clarityScore, visibleWords: data.visible?.wordCount, articleWords: data.article?.wordCount, noiseLines: data.comparison?.noiseLineCount, missingLines: data.comparison?.missingLineCount, diagnosis: data.diagnosis } });
          return { ok: true, ...stored, data: stored.data ?? data, meta };
        }

        // ── QA / debugging actions ─────────────────────────────────────────

        case 'assert': {
          if (!p.assertions?.length) return { ok: false, error: { code: 'INVALID_ARGUMENT', message: 'assertions array is required', path: 'assertions' }, meta };
          const result = await rpcClient.send('page.assert', p);
          return { ...result, meta };
        }

        case 'smoke_test': {
          const result = await rpcClient.send('page.smokeTest', p);
          return { ...result, meta };
        }

        case 'find_errors': {
          const result = await rpcClient.send('page.findErrors', p);
          return { ...result, meta };
        }

        case 'check_broken_images': {
          const result = await rpcClient.send('page.checkBrokenImages', p);
          return { ...result, meta };
        }

        case 'check_links': {
          const result = await rpcClient.send('page.checkLinks', p);
          return { ...result, meta };
        }

        case 'check_layout': {
          const result = await rpcClient.send('page.checkLayout', p);
          return { ...result, meta };
        }

        case 'debug_selector': {
          if (!p.selector) return { ok: false, error: { code: 'INVALID_ARGUMENT', message: 'selector is required for debug_selector', path: 'selector' }, meta };
          const result = await rpcClient.send('page.debugSelector', p);
          return { ...result, meta };
        }

        case 'debug_clickability': {
          if (!p.selector) return { ok: false, error: { code: 'INVALID_ARGUMENT', message: 'selector is required for debug_clickability', path: 'selector' }, meta };
          const result = await rpcClient.send('page.debugClickability', p);
          return { ...result, meta };
        }

        case 'capture_debug_bundle': {
          const bundleResult = await rpcClient.send('page.captureBundle', p);
          let screenshot = null;
          if ((p.include ?? []).includes('screenshot') || p.include == null) {
            const screenshotResult = await rpcClient.send('visual.captureScreenshot', { tabId: p.tabId }).catch(() => null);
            if (screenshotResult?.ok) {
              screenshot = { included: true, dataUrl: screenshotResult.data?.dataUrl };
            }
          }
          return { ...bundleResult, ...(screenshot ? { screenshot } : {}), meta };
        }

        case 'wait_for_page_change': {
          const result = await rpcClient.send('page.waitForPageChange', p);
          return { ...result, meta };
        }

        case 'compare_snapshots': {
          if (!p.beforeStateId || !p.afterStateId) {
            return { ok: false, error: { code: 'INVALID_ARGUMENT', message: 'beforeStateId and afterStateId are required' }, meta };
          }
          const result = await rpcClient.send('page.compareSnapshots', p);
          return { ...result, meta };
        }

        default:
          throw new Error(`Unknown action: ${p.action}`);
      }
    },
  },
];

registry.registerMany(tools);
export { tools, normalizeActionName };
