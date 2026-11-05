import { registry } from '../registry.js';
import { captureOwnedTab, openInstrumentedTab, navigateInstrumentedTab, sleep } from '../utils/browserCaptureUtils.js';
import { collectLayeredSnapshot } from '../utils/layeredSnapshotUtils.js';
import { issuesFromContext, summarizeIssues } from '../utils/issueUtils.js';
import { maybeStoreResult, saveResult } from '../utils/resultUtils.js';
import { resolveUrl } from '../utils/urlUtils.js';
import { makeActionTool } from '../utils/actionToolUtils.js';

function dataOf(response) {
  return response?.data ?? response;
}

function issueSummary(context) {
  const forms = context.forms?.forms ?? [];
  const issues = issuesFromContext(context);
  return summarizeIssues(issues, {
    consoleIssues: (context.console?.entries ?? []).filter((entry) => ['error', 'warning'].includes(entry.level)).length,
    jsErrors: context.jsErrors?.errors?.length ?? 0,
    failedRequests: (context.network?.requests ?? []).filter((request) => request.failed || (request.response?.status ?? 0) >= 400).length,
    apiFailures: (context.apiResponses?.responses ?? []).filter((request) => request.failed || (request.response?.status ?? 0) >= 400).length,
    contrastIssues: (context.a11y?.contrastIssues ?? context.a11y?.data?.contrastIssues ?? []).length,
    overflow: (context.responsive?.overflow ?? []).length,
    overlaps: (context.responsive?.overlaps ?? []).length,
    formIssues: issues.filter((issue) => issue.type === 'forms.required-field-unstable-name').length,
      interactiveElements: context.interactive?.elements?.length ?? 0,
      forms: forms.length,
  });
}

async function collectContext(rpcClient, tabId, options = {}) {
  const depth = options.domDepth ?? 4;
  const includeScreenshot = options.includeScreenshot ?? false;
  const includePerformance = options.includePerformance ?? true;
  const includeApiBodies = options.includeApiBodies ?? false;
  const includeStorage = options.includeStorage ?? false;

  const [
    route,
    framework,
    text,
    interactive,
    forms,
    dom,
    a11y,
    responsive,
    consoleData,
    jsErrors,
    network,
    apiResponses,
    performance,
    storage,
  ] = await Promise.all([
    rpcClient.send('app.getRouteInfo', { tabId }).then(dataOf).catch((err) => ({ error: err.message })),
    rpcClient.send('app.detectFramework', { tabId }).then(dataOf).catch((err) => ({ error: err.message })),
    rpcClient.send('page.getText', { tabId }).then(dataOf).catch((err) => ({ error: err.message })),
    rpcClient.send('page.getInteractiveElements', { tabId, includeSelectors: true }).then(dataOf).catch((err) => ({ error: err.message })),
    rpcClient.send('page.getForms', { tabId }).then(dataOf).catch((err) => ({ error: err.message })),
    collectLayeredSnapshot(rpcClient, { tabId, depth, store: false }).then(dataOf).catch((err) => ({ error: err.message })),
    rpcClient.send('a11y.audit', { tabId }).then(dataOf).catch((err) => ({ error: err.message })),
    rpcClient.send('responsive.scanLayout', { tabId }).then(dataOf).catch((err) => ({ error: err.message })),
    rpcClient.send('devtools.getConsole', { tabId }).then(dataOf).catch((err) => ({ error: err.message })),
    rpcClient.send('devtools.getJsErrors', { tabId }).then(dataOf).catch((err) => ({ error: err.message })),
    rpcClient.send('devtools.getNetwork', { tabId }).then(dataOf).catch((err) => ({ error: err.message })),
    rpcClient.send('devtools.getApiResponses', { tabId, includeBodies: includeApiBodies }).then(dataOf).catch((err) => ({ error: err.message })),
    includePerformance ? rpcClient.send('devtools.getPerformance', { tabId }).then(dataOf).catch((err) => ({ error: err.message })) : Promise.resolve(undefined),
    includeStorage ? rpcClient.send('app.getClientStorage', { tabId }).then(dataOf).catch((err) => ({ error: err.message })) : Promise.resolve(undefined),
  ]);

  const context = {
    tabId,
    route,
    framework,
    text: text?.text ? { length: text.text.length, sample: text.text.slice(0, options.textSampleLimit ?? 4000) } : text,
    interactive,
    forms,
    dom,
    a11y,
    responsive,
    console: consoleData,
    jsErrors,
    network,
    apiResponses,
    performance,
    storage,
  };

  if (includeScreenshot) {
    const capture = options.ownedTab ? captureOwnedTab(rpcClient, 'visual.captureScreenshot', { tabId, format: 'png' }) : rpcClient.send('visual.captureScreenshot', { tabId, format: 'png' });
    context.screenshot = await capture.then(dataOf).catch((err) => ({ error: err.message }));
  }

  context.summary = issueSummary(context);
  return context;
}

async function inspectUrl(rpcClient, url, options = {}) {
  const { tabId } = await openInstrumentedTab(rpcClient, url, options);
  try {
    return await collectContext(rpcClient, tabId, { ...options, ownedTab: true });
  } finally {
    if (!options.keepOpen) {
      await rpcClient.send('devtools.stopSession', { tabId }).catch(() => null);
      await rpcClient.send('browser.closeTab', { tabId }).catch(() => null);
    }
  }
}

async function inspectActiveTab(rpcClient, options = {}) {
  const active = dataOf(await rpcClient.send('browser.getActiveTab', {}));
  const tabId = String(active?.id);
  if (!tabId || tabId === 'undefined') throw new Error('No active Chrome tab found.');
  await rpcClient.send('devtools.startSession', { tabId }).catch(() => null);
  if (options.reload) {
    await rpcClient.send('devtools.clearSession', { tabId }).catch(() => null);
    await rpcClient.send('browser.reloadTab', { tabId, bypassCache: options.bypassCache ?? false });
    await rpcClient.send('browser.wait', { tabId, until: 'load', timeoutMs: options.timeoutMs ?? 15000 }).catch(() => null);
    if ((options.settleMs ?? 500) > 0) await sleep(options.settleMs ?? 500);
  }
  return collectContext(rpcClient, tabId, options);
}

const actionDefs = [
  {
    name: 'fileforge_coding_inspect_page',
    description: 'One-shot Chrome coding context for a URL or active tab: DOM, selectors, forms, framework, console, network, API, a11y, responsive, perf, and optional screenshot.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Optional URL. If omitted, inspect the active tab.' },
        tabId: { type: 'string', default: 'active' },
        reload: { type: 'boolean', default: false },
        keepOpen: { type: 'boolean', default: false },
        includeScreenshot: { type: 'boolean', default: false },
        includeApiBodies: { type: 'boolean', default: false },
        includeStorage: { type: 'boolean', default: false },
        includePerformance: { type: 'boolean', default: true },
        domDepth: { type: 'number', default: 4 },
        timeoutMs: { type: 'number', default: 15000 },
        settleMs: { type: 'number', default: 500 },
        store: { type: 'boolean', default: true },
        project: { type: 'string', default: 'default' },
      },
    },
    handler: async (p, { rpcClient }) => {
      const data = p.url ? await inspectUrl(rpcClient, p.url, p) : await inspectActiveTab(rpcClient, p);
      const stored = maybeStoreResult({
        store: p.store ?? true,
        prefix: 'coding_inspect',
        tool: 'fileforge_coding_inspect_page',
        url: data.route?.route?.href ?? p.url,
        project: p.project ?? 'default',
        data,
        summary: data.summary,
      });
      return { ok: true, ...stored, meta: { tool: 'fileforge_coding_inspect_page', url: data.route?.route?.href ?? p.url } };
    },
  },
  {
    name: 'fileforge_coding_audit_routes',
    description: 'Fast hidden-Chrome route sweep for coding: captures load-time console, network, API failures, a11y/responsive issues, selectors, and compact summaries per route.',
    inputSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string' },
        routes: { type: 'array', items: { type: 'string' } },
        includeScreenshot: { type: 'boolean', default: false },
        includeApiBodies: { type: 'boolean', default: false },
        includePerformance: { type: 'boolean', default: true },
        domDepth: { type: 'number', default: 3 },
        timeoutMs: { type: 'number', default: 15000 },
        settleMs: { type: 'number', default: 500 },
        store: { type: 'boolean', default: true },
        project: { type: 'string', default: 'default' },
      },
      required: ['baseUrl', 'routes'],
    },
    handler: async (p, { rpcClient }) => {
      const { tabId } = await openInstrumentedTab(rpcClient, resolveUrl(p.routes[0] ?? '/', p.baseUrl), p);
      const checks = [];
      try {
        for (const route of p.routes) {
          const url = resolveUrl(route, p.baseUrl);
          await navigateInstrumentedTab(rpcClient, tabId, url, p);
          const context = await collectContext(rpcClient, tabId, p);
          checks.push({
            url,
            ok: context.summary.ok,
            summary: context.summary,
            route: context.route,
            framework: context.framework,
            console: context.console,
            jsErrors: context.jsErrors,
            network: context.network,
            apiResponses: context.apiResponses,
            a11y: context.a11y,
            responsive: context.responsive,
            screenshot: context.screenshot,
          });
        }
      } finally {
        await rpcClient.send('devtools.stopSession', { tabId }).catch(() => null);
        await rpcClient.send('browser.closeTab', { tabId }).catch(() => null);
      }

      const data = {
        baseUrl: p.baseUrl,
        ok: checks.every((check) => check.ok),
        checks,
        summary: {
          routes: checks.length,
          failedRoutes: checks.filter((check) => !check.ok).length,
          issues: checks.flatMap((check) => check.summary.topIssues.map((issue) => ({ url: check.url, ...issue }))).slice(0, 100),
        },
      };
      const stored = maybeStoreResult({
        store: p.store ?? true,
        prefix: 'coding_routes',
        tool: 'fileforge_coding_audit_routes',
        url: p.baseUrl,
        project: p.project ?? 'default',
        data,
        summary: data.summary,
      });
      return { ok: true, ...stored, meta: { tool: 'fileforge_coding_audit_routes', url: p.baseUrl } };
    },
  },
  {
    name: 'fileforge_coding_bug_context',
    description: 'Capture a compact bug-fix bundle from Chrome for Codex: page context, issues, HAR-style network export, and optional screenshot/API bodies.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        title: { type: 'string' },
        includeScreenshot: { type: 'boolean', default: true },
        includeApiBodies: { type: 'boolean', default: true },
        includeStorage: { type: 'boolean', default: false },
        timeoutMs: { type: 'number', default: 15000 },
        settleMs: { type: 'number', default: 750 },
        project: { type: 'string', default: 'default' },
      },
      required: ['url'],
    },
    handler: async (p, { rpcClient }) => {
      const { tabId } = await openInstrumentedTab(rpcClient, p.url, p);
      try {
        const context = await collectContext(rpcClient, tabId, { ...p, domDepth: p.domDepth ?? 5 });
        const har = await rpcClient.send('devtools.exportHar', { tabId }).then(dataOf).catch((err) => ({ error: err.message }));
        const data = {
          title: p.title ?? context.route?.route?.title ?? p.url,
          createdAt: new Date().toISOString(),
          context,
          har,
        };
        const stored = saveResult({
          prefix: 'coding_bug',
          tool: 'fileforge_coding_bug_context',
          url: p.url,
          project: p.project ?? 'default',
          data,
          summary: { ...context.summary, harEntries: har?.har?.log?.entries?.length ?? 0 },
        });
        return { ok: true, ...stored, meta: { tool: 'fileforge_coding_bug_context', url: p.url } };
      } finally {
        await rpcClient.send('devtools.stopSession', { tabId }).catch(() => null);
        await rpcClient.send('browser.closeTab', { tabId }).catch(() => null);
      }
    },
  },
  {
    name: 'fileforge_coding_article_context',
    description: 'Extract and store an article/documentation context bundle for research debugging. Captures article text, heading outline, metadata, links, code blocks, framework info, and page route state. Ideal for docs, blogs, changelogs, README pages, and research pages that an agent needs to consume.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Optional URL to open. If omitted, use the active tab.' },
        tabId: { type: 'string', default: 'active' },
        maxTextLength: { type: 'number', default: 50000 },
        includeComparison: { type: 'boolean', default: true, description: 'Include visible vs article comparison data' },
        store: { type: 'boolean', default: true },
        project: { type: 'string', default: 'default' },
      },
    },
    handler: async (p, { rpcClient }) => {
      let tabId = p.tabId ?? 'active';
      let opened = null;

      // If URL provided, open in an instrumented tab
      if (p.url) {
        opened = await openInstrumentedTab(rpcClient, p.url, { active: false });
        tabId = String(opened.tabId);
      }

      try {
        // Extract article
        const articleResponse = await rpcClient.send('page.extractArticle', { tabId, maxTextLength: p.maxTextLength ?? 50000 });
        const article = articleResponse?.data ?? articleResponse;

        // Page context: route, framework, metadata
        const [route, framework, metadata] = await Promise.all([
          rpcClient.send('app.getRouteInfo', { tabId }).then(dataOf).catch((err) => ({ error: err.message })),
          rpcClient.send('app.detectFramework', { tabId }).then(dataOf).catch((err) => ({ error: err.message })),
          rpcClient.send('scrape.page', { tabId, sections: ['metadata'] }).then(dataOf).catch((err) => ({ error: err.message })),
        ]);

        // Optional: visible vs article comparison
        let comparison = undefined;
        if (p.includeComparison !== false) {
          const compResponse = await rpcClient.send('page.compareVisibleVsArticle', { tabId, maxTextLength: p.maxTextLength ?? 50000 });
          comparison = compResponse?.data ?? compResponse;
        }

        const data = {
          url: article?.url ?? p.url,
          article: {
            title: article?.title,
            byline: article?.byline,
            date: article?.date,
            siteName: article?.siteName,
            text: article?.text,
            textLength: article?.textLength,
            truncated: article?.truncated,
            wordCount: article?.wordCount,
            readingTime: article?.readingTime,
            headings: article?.headings,
            links: article?.links,
            images: article?.images,
            codeBlocks: article?.codeBlocks,
            extraction: article?.extraction,
          },
          page: {
            route,
            framework,
            metadata: metadata?.metadata ?? metadata,
          },
          comparison: comparison ? {
            clarityScore: comparison.comparison?.clarityScore,
            diagnosis: comparison.diagnosis,
            visibleWordCount: comparison.visible?.wordCount,
            articleWordCount: comparison.article?.wordCount,
          } : undefined,
          capturedAt: new Date().toISOString(),
        };

        const stored = saveResult({
          prefix: 'coding_article',
          tool: 'fileforge_coding_article_context',
          url: data.url,
          project: p.project ?? 'default',
          data,
          summary: {
            title: article?.title,
            wordCount: article?.wordCount,
            readingTime: article?.readingTime,
            confidence: article?.extraction?.confidence,
            clarityScore: comparison?.comparison?.clarityScore,
            headingCount: article?.headings?.length ?? 0,
            codeBlockCount: article?.codeBlocks?.length ?? 0,
          },
        });

        return { ok: true, ...stored, meta: { tool: 'fileforge_coding_article_context', url: data.url } };
      } finally {
        if (opened) {
          await rpcClient.send('devtools.stopSession', { tabId }).catch(() => null);
          await rpcClient.send('browser.closeTab', { tabId }).catch(() => null);
        }
      }
    },
  },
];

const tools = [
  makeActionTool({
    name: 'fileforge_coding_action',
    description: 'Get context for fixing code in one call. inspect_page returns a page\'s framework, selectors, forms, console, network and performance; audit_routes sweeps many routes for errors; bug_context and article_context gather focused context. Use fileforge_qa_testing for pass/fail checks. Opens pages in your session; results can be stored. Needs the extension.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    prefix: 'fileforge_coding_',
    actions: actionDefs,
  }),
];

registry.registerMany(tools);
export { tools };
