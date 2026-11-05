import { registry } from '../registry.js';
import { issuesFromContext, summarizeIssues } from '../utils/issueUtils.js';
import { saveResult } from '../utils/resultUtils.js';
import { makeActionTool } from '../utils/actionToolUtils.js';
import { sanitizeHar, summarizeHar } from '../utils/privacyUtils.js';
import { handleQueryDevtools } from './devtoolsQuery.js';

function dataOf(response) {
  return response?.data ?? response;
}

async function queryDevtools(rpcClient, tabId, query) {
  const response = await handleQueryDevtools({
    action: 'query_devtools',
    tabId,
    autoStartSession: false,
    query,
  }, { rpcClient });
  return response?.ok ? response : null;
}

async function collectTabDiagnostics(rpcClient, tabId = 'active', include = ['screenshots', 'console', 'network', 'dom', 'a11y']) {
  const data = {};
  await rpcClient.send('devtools.startSession', { tabId }).catch(() => null);
  const devtoolsQuery = {};
  if (include.includes('console')) devtoolsQuery.console = true;
  if (include.includes('network')) devtoolsQuery.network = true;
  const devtools = Object.keys(devtoolsQuery).length ? await queryDevtools(rpcClient, tabId, devtoolsQuery) : null;
  if (include.includes('console')) data.console = devtools?.console ? { entries: devtools.console } : dataOf(await rpcClient.send('devtools.getConsole', { tabId }));
  if (include.includes('network')) data.network = devtools?.network ? { requests: devtools.network } : dataOf(await rpcClient.send('devtools.getNetwork', { tabId }));
  if (include.includes('dom')) data.dom = dataOf(await rpcClient.send('page.getDomSnapshot', { tabId }));
  if (include.includes('a11y')) data.a11y = dataOf(await rpcClient.send('a11y.audit', { tabId }));
  if (include.includes('screenshots')) data.screenshot = dataOf(await rpcClient.send('visual.captureScreenshot', { tabId, format: 'png' }));
  if (include.includes('har')) {
    const har = dataOf(await rpcClient.send('devtools.exportHar', { tabId }).catch((err) => ({ error: err.message })));
    data.har = har?.har ? { summary: summarizeHar(sanitizeHar(har.har)) } : har;
  }
  data.route = dataOf(await rpcClient.send('app.getRouteInfo', { tabId }));
  data.issues = issuesFromContext(data, { url: data.route?.route?.href });
  data.summary = summarizeIssues(data.issues, {
    consoleEntries: data.console?.entries?.length ?? 0,
    networkRequests: data.network?.requests?.length ?? 0,
  });
  return data;
}

function humanReport({ title, diagnostics }) {
  const issues = diagnostics?.issues ?? [];
  const lines = [
    `# ${title ?? 'FileForge Report'}`,
    '',
    `URL: ${diagnostics?.route?.route?.href ?? diagnostics?.route?.tabUrl ?? 'unknown'}`,
    `Issues: ${issues.length}`,
    '',
  ];
  for (const issue of issues.slice(0, 25)) {
    lines.push(`## ${issue.severity.toUpperCase()}: ${issue.title}`);
    lines.push(issue.impact);
    lines.push(`Fix: ${issue.suggestedFix}`);
    lines.push('');
  }
  return lines.join('\n');
}

function pairedReport(data) {
  return {
    human: humanReport(data),
    machine: {
      title: data.title,
      createdAt: data.createdAt,
      url: data.diagnostics?.route?.route?.href,
      summary: data.diagnostics?.summary,
      issues: data.diagnostics?.issues ?? [],
      artifacts: [data.diagnostics?.screenshot?.screenshot].filter(Boolean),
      har: data.diagnostics?.har,
      diagnostics: data.diagnostics,
    },
  };
}

const actionDefs = [
  {
    name: 'fileforge_report_bug',
    description: 'Generate a bug report bundle from the active tab.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'string', default: 'active' },
        title: { type: 'string' },
        include: { type: 'array', items: { type: 'string', enum: ['screenshots', 'console', 'network', 'dom', 'a11y', 'har'] } },
        format: { type: 'string', enum: ['zip', 'markdown'], default: 'zip' },
      },
      required: ['title'],
    },
    handler: async (p, { rpcClient }) => {
      const data = {
        title: p.title,
        createdAt: new Date().toISOString(),
        diagnostics: await collectTabDiagnostics(rpcClient, p.tabId ?? 'active', p.include ?? ['screenshots', 'console', 'network', 'dom', 'a11y', 'har']),
      };
      data.report = pairedReport(data);
      const stored = saveResult({ prefix: 'report_bug', tool: 'fileforge_report_bug', url: data.diagnostics.route?.route?.href, data });
      return { ok: true, ...stored, meta: { tool: 'fileforge_report_bug' } };
    },
  },
  {
    name: 'fileforge_report_pr_evidence',
    description: 'Generate a PR evidence bundle (screenshots, QA results, diff).',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        urls: { type: 'array', items: { type: 'string' } },
        include: { type: 'array', items: { type: 'string' } },
      },
      required: ['title'],
    },
    handler: async (p, { rpcClient }) => {
      const evidence = [];
      for (const url of p.urls ?? []) {
        const opened = await rpcClient.send('browser.navigate', { url, active: false, newTab: true });
        if (!opened?.ok) {
          evidence.push({ url, error: opened?.error });
          continue;
        }
        const tabId = String(opened.data.id);
        try {
          await rpcClient.send('browser.wait', { tabId, until: 'load' }).catch(() => null);
          const diagnostics = await collectTabDiagnostics(rpcClient, tabId, p.include ?? ['screenshots', 'console', 'network', 'a11y', 'har']);
          evidence.push({ url, diagnostics, report: pairedReport({ title: p.title, createdAt: new Date().toISOString(), diagnostics }) });
        } finally {
          await rpcClient.send('browser.closeTab', { tabId }).catch(() => null);
        }
      }
      const data = { title: p.title, createdAt: new Date().toISOString(), evidence };
      const stored = saveResult({ prefix: 'report_pr', tool: 'fileforge_report_pr_evidence', data });
      return { ok: true, ...stored, meta: { tool: 'fileforge_report_pr_evidence' } };
    },
  },
  {
    name: 'fileforge_report_debug_bundle',
    description: 'Create a debug bundle with full diagnostics.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'string', default: 'active' },
        title: { type: 'string' },
      },
      required: ['title'],
    },
    handler: async (p, { rpcClient }) => {
      const devtools = await queryDevtools(rpcClient, p.tabId ?? 'active', {
        performance: true,
        apiResponses: { limit: 200, includeBodies: false },
      });
      const data = {
        title: p.title,
        createdAt: new Date().toISOString(),
        diagnostics: await collectTabDiagnostics(rpcClient, p.tabId ?? 'active', ['screenshots', 'console', 'network', 'dom', 'a11y', 'har']),
        performance: devtools?.performance ?? dataOf(await rpcClient.send('devtools.getPerformance', { tabId: p.tabId ?? 'active' })),
        apiResponses: devtools?.apiResponses ? { responses: devtools.apiResponses } : dataOf(await rpcClient.send('devtools.getApiResponses', { tabId: p.tabId ?? 'active', includeBodies: false })),
      };
      data.report = pairedReport(data);
      const stored = saveResult({ prefix: 'report_debug', tool: 'fileforge_report_debug_bundle', url: data.diagnostics.route?.route?.href, data });
      return { ok: true, ...stored, meta: { tool: 'fileforge_report_debug_bundle' } };
    },
  },
];

const tools = [
  makeActionTool({
    name: 'fileforge_report_action',
    description: 'Generate evidence bundles from the active tab: a bug report, PR evidence with screenshots and QA results, or a full debug bundle. Use this when you need something to share or attach. Use fileforge_coding_action for context while working. Bundles are saved locally and can contain page data, so review them before sharing. Needs the extension.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    prefix: 'fileforge_report_',
    actions: actionDefs,
  }),
];

registry.registerMany(tools);
export { tools };
