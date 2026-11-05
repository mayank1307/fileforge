import { registry } from '../registry.js';
import { captureOwnedTab, openInstrumentedTab } from '../utils/browserCaptureUtils.js';
import { formIssues, issuesFromContext, summarizeIssues } from '../utils/issueUtils.js';
import { summarizePerformanceAudit } from '../utils/performanceAuditUtils.js';
import { maybeStoreResult } from '../utils/resultUtils.js';
import { normalizeUrl, resolveUrl } from '../utils/urlUtils.js';
import { handleQueryDevtools } from './devtoolsQuery.js';

function dataOf(response) {
  return response?.data ?? response;
}

// A clean check must fail when there's nothing to read, so this keeps the error instead of returning empty data.
function readSession(rpcClient, tabId, query) {
  return handleQueryDevtools({
    action: 'query_devtools',
    tabId,
    autoStartSession: false,
    query,
  }, { rpcClient });
}

async function queryDevtools(rpcClient, tabId, query) {
  const response = await readSession(rpcClient, tabId, query);
  return response?.ok ? response : null;
}

async function checkPage(rpcClient, url, { captureScreenshot = true } = {}) {
  const opened = await openInstrumentedTab(rpcClient, url, { active: false });
  const tabId = opened.tabId;
  const result = { url, tabId };
  try {
    const devtools = await queryDevtools(rpcClient, tabId, {
      console: true,
      network: true,
      performance: true,
    });
    result.idle = opened.idle;
    result.route = dataOf(await rpcClient.send('app.getRouteInfo', { tabId }));
    result.console = devtools?.console ? { entries: devtools.console } : dataOf(await rpcClient.send('devtools.getConsole', { tabId }));
    result.network = devtools?.network ? { requests: devtools.network } : dataOf(await rpcClient.send('devtools.getNetwork', { tabId }));
    result.performance = devtools?.performance ?? dataOf(await rpcClient.send('devtools.getPerformance', { tabId }));
    result.a11y = dataOf(await rpcClient.send('a11y.audit', { tabId }));
    result.responsive = dataOf(await rpcClient.send('responsive.scanLayout', { tabId }));
    if (captureScreenshot) result.screenshot = dataOf(await captureOwnedTab(rpcClient, 'visual.captureScreenshot', { tabId, format: 'png' }));
    result.performanceAudit = summarizePerformanceAudit({ url, performance: result.performance, network: result.network });
    result.issues = issuesFromContext(result, { url });
    result.issues.push(...result.performanceAudit.issues);
    result.summary = summarizeIssues(result.issues, {
      consoleErrors: result.issues.filter((issue) => issue.type === 'developer.console-issue').length,
      failedRequests: result.issues.filter((issue) => issue.type === 'reliability.failed-request').length,
      performanceIssues: result.performanceAudit.issues.length,
    });
    // Whether the page works. Layout signals and blocked analytics are listed but can't fail it on their own, because
    // they fire on most real pages. summary.clean says whether anything at all was found.
    result.ok = result.summary.ok;
    result.summary.clean = result.issues.length === 0;
  } finally {
    await rpcClient.send('devtools.stopSession', { tabId }).catch(() => null);
    await rpcClient.send('browser.closeTab', { tabId }).catch(() => null);
  }
  return result;
}

const tools = [
  {
    name: 'fileforge_qa_testing',
    actions: [
      { action: 'run_frontend_check', description: 'Load a page, plus any routes, and list issues on each. Fails on high or critical issues. Stores the result by default.', required: ['url'] },
      { action: 'run_smoke_test', description: 'Load one page without a screenshot and list issues. Fails on high or critical issues. Stores the result by default.', required: ['url'] },
      { action: 'check_page_boot', description: 'Load one page and list issues, without storing anything. Fails on high or critical issues.', required: ['url'] },
      { action: 'check_routes', description: 'Load each route against baseUrl and list issues per route. Fails on high or critical issues.', required: ['baseUrl', 'routes'] },
      { action: 'check_console_clean', description: 'Pass only if the running DevTools session on a tab has no console issues.', required: [] },
      { action: 'check_network_clean', description: 'Pass only if the running DevTools session on a tab has no failed requests.', required: [] },
      { action: 'check_forms', description: 'Report issues in the forms on an open tab.', required: [] },
      { action: 'watch_element', description: 'Start watching an element for changes and return a watchId.', required: ['selector'] },
      { action: 'capture_element_change', description: 'Read the changes recorded by watch_element, by watchId or selector. Stores the result by default.', required: [] },
    ],
    description: 'Run repeatable pass/fail checks: smoke tests, page boot, routes, console, network, forms and element watches. Use fileforge_page_interaction for individual steps and fileforge_coding_action while fixing code. URL checks load pages in your session. check_console_clean and check_network_clean read a running DevTools session and return SESSION_NOT_STARTED without one. Needs the extension.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'run_frontend_check', 'run_smoke_test', 'check_page_boot', 
            'check_routes', 'check_console_clean', 'check_network_clean', 
            'check_forms', 'watch_element', 'capture_element_change'
          ],
        },
        url: { type: 'string' },
        baseUrl: { type: 'string' },
        routes: { type: 'array', items: { type: 'string' } },
        store: { type: 'boolean', default: true },
        tabId: { type: 'string', default: 'active' },
        selector: { type: 'string' },
        watchId: { type: 'string' },
        timeoutMs: { type: 'number', default: 30000 },
        project: { type: 'string', default: 'default' }
      },
      required: ['action']
    },
    handler: async (p, { rpcClient }) => {
      switch (p.action) {
        case 'run_frontend_check': {
          if (!p.url) throw new Error('url is required for run_frontend_check');
          const baseUrl = normalizeUrl(p.url);
          const urls = p.routes?.length ? p.routes.map((route) => resolveUrl(route, baseUrl)) : [baseUrl];
          const checks = [];
          for (const url of urls) checks.push(await checkPage(rpcClient, url));
          const data = { url: baseUrl, checks, ok: checks.every((check) => check.ok) };
          const summary = {
            url: baseUrl,
            ok: data.ok,
            checks: checks.map((check) => ({
              url: check.url,
              ok: check.ok,
              issueCount: check.issues?.length ?? 0,
              topIssue: check.issues?.[0] ? { type: check.issues[0].type, severity: check.issues[0].severity, title: check.issues[0].title } : null,
            })),
          };
          const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'qa_frontend', tool: 'fileforge_qa_testing_frontend', url: baseUrl, data, summary });
          return { ...stored, ok: data.ok, meta: { tool: 'fileforge_qa_testing', action: p.action } };
        }
        case 'run_smoke_test': {
          if (!p.url) throw new Error('url is required for run_smoke_test');
          const data = await checkPage(rpcClient, p.url, { captureScreenshot: false });
          const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'qa_smoke', tool: 'fileforge_qa_testing_smoke', url: p.url, data, summary: data.summary });
          return { ...stored, ok: data.ok, meta: { tool: 'fileforge_qa_testing', action: p.action } };
        }
        case 'check_page_boot': {
          if (!p.url) throw new Error('url is required for check_page_boot');
          const data = await checkPage(rpcClient, p.url, { captureScreenshot: false });
          return { ok: data.ok, data, meta: { tool: 'fileforge_qa_testing', action: p.action } };
        }
        case 'check_routes': {
          if (!p.baseUrl || !p.routes) throw new Error('baseUrl and routes are required for check_routes');
          const checks = [];
          for (const route of p.routes) checks.push(await checkPage(rpcClient, resolveUrl(route, p.baseUrl), { captureScreenshot: false }));
          return { ok: checks.every((check) => check.ok), data: { checks }, meta: { tool: 'fileforge_qa_testing', action: p.action } };
        }
        case 'check_console_clean': {
          const queried = await readSession(rpcClient, p.tabId ?? 'active', { console: true });
          if (!queried.ok) return { ...queried, meta: { tool: 'fileforge_qa_testing', action: p.action } };
          const entries = queried.console ?? [];
          const issues = issuesFromContext({ console: { entries } });
          return { ok: issues.length === 0, data: { issues, entries }, meta: { tool: 'fileforge_qa_testing', action: p.action } };
        }
        case 'check_network_clean': {
          const queried = await readSession(rpcClient, p.tabId ?? 'active', { network: true });
          if (!queried.ok) return { ...queried, meta: { tool: 'fileforge_qa_testing', action: p.action } };
          const requests = queried.network ?? [];
          const issues = issuesFromContext({ network: { requests } });
          return { ok: issues.length === 0, data: { issues, requests }, meta: { tool: 'fileforge_qa_testing', action: p.action } };
        }
        case 'check_forms': {
          const response = await rpcClient.send('page.getForms', p);
          if (response?.ok === false) return { ...response, meta: { tool: 'fileforge_qa_testing', action: p.action } };
          const data = dataOf(response);
          const issues = formIssues(data.forms ?? []);
          return { ok: issues.length === 0, data: { forms: data.forms ?? [], issues }, meta: { tool: 'fileforge_qa_testing', action: p.action } };
        }
        case 'watch_element': {
          if (!p.selector) throw new Error('selector is required for watch_element');
          const response = await rpcClient.send('page.watchElement', p);
          if (!response?.ok) return { ...response, meta: { tool: 'fileforge_qa_testing', action: p.action } };
          const data = response.data ?? response;
          const stored = maybeStoreResult({
            store: p.store ?? true,
            prefix: 'qa_watch',
            tool: 'fileforge_qa_testing_watch',
            url: data.url,
            project: p.project ?? 'default',
            data,
            summary: {
              watchId: data.watchId,
              selector: data.selector,
              status: data.status,
              timeoutMs: data.timeoutMs,
            },
          });
          return { ok: true, ...stored, data: stored.data ?? data, meta: { tool: 'fileforge_qa_testing', action: p.action } };
        }
        case 'capture_element_change': {
          const response = await rpcClient.send('page.captureElementChange', p);
          if (!response?.ok) return { ...response, meta: { tool: 'fileforge_qa_testing', action: p.action } };
          const data = response.data ?? response;
          const stored = maybeStoreResult({
            store: p.store ?? true,
            prefix: 'qa_element_change',
            tool: 'fileforge_qa_testing_capture_change',
            url: data.url,
            project: p.project ?? 'default',
            data,
            summary: {
              watchId: data.watchId,
              selector: data.selector,
              changeCount: data.changeCount ?? data.changes?.length ?? 0,
              status: data.status,
              durationMs: data.durationMs,
            },
          });
          return { ok: true, ...stored, data: stored.data ?? data, meta: { tool: 'fileforge_qa_testing', action: p.action } };
        }
        default:
          throw new Error(`Unknown action: ${p.action}`);
      }
    },
  },
];

registry.registerMany(tools);
export { tools };
