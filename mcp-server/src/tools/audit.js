import { registry } from '../registry.js';
import { resultStore } from '../stores/resultStore.js';
import { auditClientSecurity, auditContentConsistency, auditPolicyRisk, compareAuditRuns, rankRecommendations, revealClientSecurityValue, summarizeForMode } from '../utils/auditUtils.js';
import { secretRevealBlocked } from '../utils/privacyUtils.js';
import { collectCapture, openInstrumentedTab } from '../utils/browserCaptureUtils.js';
import { createZipBuffer, writeExportFile } from '../utils/exportUtils.js';
import { collectIssuesFromData, summarizeIssues } from '../utils/issueUtils.js';
import { maybeStoreResult } from '../utils/resultUtils.js';
import { discoverRoutesFromPages, summarizeRouteChecks } from '../utils/routeAuditUtils.js';
import { normalizeUrl, resolveUrl } from '../utils/urlUtils.js';
import { makeActionTool } from '../utils/actionToolUtils.js';
import { handleQueryAudit, handleCompareAuditSnapshots, normalizeActionName as normalizeAuditActionName, PRESETS as AUDIT_PRESETS, QUERY_MODULES } from './auditQuery.js';

function dataOf(response) {
  return response?.data ?? response;
}

async function scrapePages(rpcClient, url, { maxPages = 20, sections = ['metadata', 'pageLinks', 'links'], crawlRef } = {}) {
  if (crawlRef) {
    const stored = resultStore.get(crawlRef);
    if (!stored) throw new Error(`No crawl result found for ref: ${crawlRef}`);
    return stored.data?.pages ?? stored.data?.results ?? [];
  }
  const response = await rpcClient.send('scrape.crawlSite', { url, maxPages, sections });
  if (!response?.ok) throw new Error(response?.error?.message ?? 'Crawl failed.');
  return dataOf(response).pages ?? [];
}

function mainStatus(capture, url) {
  const requests = capture.network?.requests ?? [];
  const target = new URL(url);
  const request = requests.find((item) => {
    try {
      const parsed = new URL(item.url);
      return parsed.origin === target.origin && parsed.pathname === target.pathname && item.type === 'Document';
    } catch {
      return false;
    }
  }) ?? requests.find((item) => item.type === 'Document');
  return request?.response?.status ?? (capture.route?.route?.href ? 200 : undefined);
}

async function checkRoute(rpcClient, url, options = {}) {
  const { tabId, idle } = await openInstrumentedTab(rpcClient, url, { ...options, active: false });
  try {
    const capture = await collectCapture(rpcClient, tabId, { ...options, url, includePerformance: false });
    return {
      url: capture.url ?? url,
      requestedUrl: url,
      status: mainStatus(capture, url),
      idle,
      failedRequests: capture.capture?.failedRequests ?? 0,
      requests: capture.capture?.requests ?? 0,
      consoleIssues: capture.capture?.consoleIssues ?? 0,
    };
  } catch (err) {
    return { url, error: err.message };
  } finally {
    await rpcClient.send('devtools.stopSession', { tabId }).catch(() => null);
    await rpcClient.send('browser.closeTab', { tabId }).catch(() => null);
  }
}

function markdownReport(data) {
  const issues = data.issues ?? collectIssuesFromData(data);
  const lines = [
    `# ${data.title ?? data.tool ?? 'FileForge Audit'}`,
    '',
    `Created: ${new Date().toISOString()}`,
    '',
    `Issues: ${issues.length}`,
    '',
  ];
  for (const issue of issues.slice(0, 50)) {
    lines.push(`## ${issue.severity.toUpperCase()}: ${issue.title}`);
    lines.push('');
    lines.push(issue.impact);
    lines.push('');
    lines.push(`Fix: ${issue.suggestedFix}`);
    lines.push('');
    for (const item of issue.evidence ?? []) lines.push(`- ${item.url ?? 'evidence'}: ${item.text ?? item.status ?? ''}`);
    lines.push('');
  }
  return lines.join('\n');
}

function auditPackage(result) {
  const data = result.data ?? result;
  const issues = data.issues ?? collectIssuesFromData(data);
  const summary = data.summary ?? summarizeIssues(issues);
  return createZipBuffer([
    { name: 'report.md', contents: markdownReport({ ...data, issues }) },
    { name: 'issues.json', contents: JSON.stringify(issues, null, 2) },
    { name: 'summary.json', contents: JSON.stringify(summary, null, 2) },
    { name: 'evidence/result.json', contents: JSON.stringify(result, null, 2) },
    { name: 'metadata/package.json', contents: JSON.stringify({ ref: result.ref, tool: result.tool, url: result.url, createdAt: new Date().toISOString() }, null, 2) },
  ]);
}

const actionDefs = [
  {
    name: 'fileforge_audit_query',
    action: 'query_audit',
    description: 'Unified GraphQL-feel audit. Select audit modules (seo, accessibility, performance, conversion, visual, technical, privacyTrust, structuredData, crawl), presets, scores, issues, roadmap, report, and snapshots in one call.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'object' },
        preset: { type: 'string', enum: Object.keys(AUDIT_PRESETS) },
        query: { type: 'object', description: `Modules to return and their options. Takes priority over preset. Modules: ${[...QUERY_MODULES].join(', ')}.` },
        tabId: { type: 'string' },
      },
    },
    handler: async (p, ctx) => handleQueryAudit(p, ctx),
  },
  {
    name: 'fileforge_audit_compare_snapshots',
    action: 'compare_audit_snapshots',
    description: 'Compare two audit snapshots (by ID) and report score deltas, new issues, resolved issues, and changed modules.',
    inputSchema: {
      type: 'object',
      properties: {
        beforeSnapshotId: { type: 'string' },
        afterSnapshotId: { type: 'string' },
      },
      required: ['beforeSnapshotId', 'afterSnapshotId'],
    },
    handler: async (p) => handleCompareAuditSnapshots(p),
  },
  {
    name: 'fileforge_site_route_audit',
    action: 'site_route',
    description: 'Audit site routes and links for broken routes, invalid links, duplicate titles, missing canonicals, redirects, and route health.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        routes: { type: 'array', items: { type: 'string' } },
        maxPages: { type: 'number', default: 25 },
        maxChecks: { type: 'number', default: 50 },
        crawlRef: { type: 'string' },
        store: { type: 'boolean', default: true },
        project: { type: 'string', default: 'default' },
      },
      required: ['url'],
    },
    handler: async (p, { rpcClient }) => {
      const baseUrl = normalizeUrl(p.url);
      const pages = await scrapePages(rpcClient, baseUrl, { maxPages: p.maxPages ?? 25, crawlRef: p.crawlRef });
      const discovered = discoverRoutesFromPages(pages, baseUrl);
      const routeSet = new Set([...(p.routes ?? []).map((route) => resolveUrl(route, baseUrl)), ...discovered.routes]);
      const routeList = Array.from(routeSet).slice(0, p.maxChecks ?? 50);
      const checks = [];
      for (const route of routeList) checks.push(await checkRoute(rpcClient, route, p));
      const data = summarizeRouteChecks({ baseUrl, pages, checks, links: discovered.links });
      data.ok = !data.issues.some((issue) => ['critical', 'high'].includes(issue.severity));
      const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'site_route_audit', tool: 'fileforge_site_route_audit', url: baseUrl, project: p.project ?? 'default', data, summary: data.summary });
      return { ok: true, ...stored, meta: { tool: 'fileforge_site_route_audit', url: baseUrl } };
    },
  },
  {
    name: 'fileforge_content_consistency_audit',
    action: 'content_consistency',
    description: 'Detect pricing, subscription, feature-count, product-identity, and limitation contradictions across crawled pages.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' }, crawlRef: { type: 'string' }, maxPages: { type: 'number', default: 30 }, store: { type: 'boolean', default: true }, project: { type: 'string', default: 'default' } },
      required: ['url'],
    },
    handler: async (p, { rpcClient }) => {
      const url = normalizeUrl(p.url);
      const pages = await scrapePages(rpcClient, url, { maxPages: p.maxPages ?? 30, sections: ['metadata', 'pageLinks', 'text'], crawlRef: p.crawlRef });
      const data = { url, pages: pages.length, ...auditContentConsistency(pages) };
      data.ok = !data.issues.some((issue) => ['critical', 'high'].includes(issue.severity));
      const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'content_consistency', tool: 'fileforge_content_consistency_audit', url, project: p.project ?? 'default', data, summary: data.summary });
      return { ok: true, ...stored, meta: { tool: 'fileforge_content_consistency_audit', url } };
    },
  },
  {
    name: 'fileforge_extension_policy_audit',
    action: 'extension_policy',
    description: 'Review site/listing/manifest copy for Chrome extension policy and claim-safety risks.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        listingCopy: { type: 'string' },
        manifest: { type: 'object' },
        maxPages: { type: 'number', default: 20 },
        store: { type: 'boolean', default: true },
        project: { type: 'string', default: 'default' },
      },
      required: ['url'],
    },
    handler: async (p, { rpcClient }) => {
      const url = normalizeUrl(p.url);
      const pages = await scrapePages(rpcClient, url, { maxPages: p.maxPages ?? 20, sections: ['metadata', 'pageLinks', 'text'] });
      const data = { url, pages: pages.length, ...auditPolicyRisk(pages, p) };
      data.ok = !data.issues.some((issue) => ['critical', 'high'].includes(issue.severity));
      const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'extension_policy', tool: 'fileforge_extension_policy_audit', url, project: p.project ?? 'default', data, summary: data.summary });
      return { ok: true, ...stored, meta: { tool: 'fileforge_extension_policy_audit', url } };
    },
  },
  {
    name: 'fileforge_client_side_security_audit',
    action: 'client_side_security',
    description: 'Inspect client-side storage for Pro/license flags, exposed secrets, debug flags, tokens, and sensitive state with redacted evidence.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' }, tabId: { type: 'string' }, store: { type: 'boolean', default: true }, project: { type: 'string', default: 'default' } },
      required: ['url'],
    },
    handler: async (p, { rpcClient }) => {
      const url = normalizeUrl(p.url);
      let tabId = p.tabId;
      let closeTab = false;
      if (!tabId) {
        const opened = await openInstrumentedTab(rpcClient, url, p);
        tabId = opened.tabId;
        closeTab = true;
      }
      try {
        const storage = dataOf(await rpcClient.send('app.getClientStorage', { tabId }));
        const data = { url, ...auditClientSecurity(storage, { url }) };
        data.ok = !data.issues.some((issue) => ['critical', 'high'].includes(issue.severity));
        const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'client_security', tool: 'fileforge_client_side_security_audit', url, project: p.project ?? 'default', data, summary: data.summary });
        return { ok: true, ...stored, meta: { tool: 'fileforge_client_side_security_audit', url } };
      } finally {
        if (closeTab) {
          await rpcClient.send('devtools.stopSession', { tabId }).catch(() => null);
          await rpcClient.send('browser.closeTab', { tabId }).catch(() => null);
        }
      }
    },
  },
  {
    name: 'fileforge_reveal_client_security_value',
    action: 'reveal_client_security_value',
    description: 'Reveal one exact redacted client-storage value after an explicit scoped agent request, and log the reveal.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        tabId: { type: 'string' },
        namespace: { type: 'string', enum: ['localStorage', 'sessionStorage'] },
        key: { type: 'string' },
        location: { type: 'string' },
      },
      required: ['url'],
    },
    handler: async (p, { rpcClient }) => {
      const blocked = secretRevealBlocked('fileforge_reveal_client_security_value');
      if (blocked) return blocked;
      const url = normalizeUrl(p.url);
      let tabId = p.tabId;
      let closeTab = false;
      if (!tabId) {
        const opened = await openInstrumentedTab(rpcClient, url, p);
        tabId = opened.tabId;
        closeTab = true;
      }
      try {
        const storage = dataOf(await rpcClient.send('app.getClientStorage', { tabId }));
        const revealed = revealClientSecurityValue(storage, p);
        if (!revealed.ok) return { ...revealed, meta: { tool: 'fileforge_reveal_client_security_value' } };
        await rpcClient.send('runtime.recordReveal', {
          tool: 'fileforge_reveal_client_security_value',
          url,
          tabId,
          location: revealed.data.location,
          namespace: revealed.data.namespace,
          key: revealed.data.key,
        }).catch(() => null);
        return { ok: true, data: revealed.data, meta: { tool: 'fileforge_reveal_client_security_value', url, tabId } };
      } finally {
        if (closeTab) {
          await rpcClient.send('devtools.stopSession', { tabId }).catch(() => null);
          await rpcClient.send('browser.closeTab', { tabId }).catch(() => null);
        }
      }
    },
  },
  {
    name: 'fileforge_recommendations_rank',
    action: 'recommendations_rank',
    description: 'Deduplicate and rank issues by impact, severity, confidence, project type, and affected pages.',
    inputSchema: {
      type: 'object',
      properties: { ref: { type: 'string' }, issues: { type: 'array', items: { type: 'object' } }, projectType: { type: 'string', default: 'generic' }, store: { type: 'boolean', default: true } },
    },
    handler: async (p) => {
      const storedResult = p.ref ? resultStore.get(p.ref) : null;
      const issues = p.issues ?? (storedResult ? collectIssuesFromData(storedResult.data) : []);
      const data = { recommendations: rankRecommendations(issues, p), issues: issues.length, projectType: p.projectType ?? 'generic' };
      const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'recommendations', tool: 'fileforge_recommendations_rank', data, summary: { recommendations: data.recommendations.length, issues: issues.length } });
      return { ok: true, ...stored, meta: { tool: 'fileforge_recommendations_rank' } };
    },
  },
  {
    name: 'fileforge_audit_compare_runs',
    action: 'compare_runs',
    description: 'Compare two stored audit runs for added/resolved issues and high-level performance/evidence changes.',
    inputSchema: { type: 'object', properties: { beforeRef: { type: 'string' }, afterRef: { type: 'string' }, store: { type: 'boolean', default: true } }, required: ['beforeRef', 'afterRef'] },
    handler: async (p) => {
      const before = resultStore.get(p.beforeRef);
      const after = resultStore.get(p.afterRef);
      if (!before || !after) return { ok: false, error: { code: 'NOT_FOUND', message: 'Both beforeRef and afterRef must exist.' }, meta: { tool: 'fileforge_audit_compare_runs' } };
      const data = compareAuditRuns(before, after);
      const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'audit_compare', tool: 'fileforge_audit_compare_runs', data, summary: data.summary });
      return { ok: true, ...stored, meta: { tool: 'fileforge_audit_compare_runs' } };
    },
  },
  {
    name: 'fileforge_export_audit_package',
    action: 'export_package',
    description: 'Export a stored audit result as a ZIP package with report.md, issues.json, summary.json, and evidence/result.json.',
    inputSchema: { type: 'object', properties: { ref: { type: 'string' }, filename: { type: 'string' } }, required: ['ref'] },
    handler: async (p) => {
      const result = resultStore.get(p.ref);
      if (!result) return { ok: false, error: { code: 'NOT_FOUND', message: `No result found for ref: ${p.ref}` }, meta: { tool: 'fileforge_export_audit_package' } };
      const filename = writeExportFile({ filename: p.filename, defaultName: `${p.ref}-audit-package.zip`, contents: auditPackage(result) });
      return { ok: true, data: { filename, ref: p.ref }, meta: { tool: 'fileforge_export_audit_package' } };
    },
  },
  {
    name: 'fileforge_audit_summary',
    action: 'summary',
    description: 'Return a stored audit result in an agent-friendly summary mode such as developer, seo, compliance, conversion, detailed, short, or json-only.',
    inputSchema: { type: 'object', properties: { ref: { type: 'string' }, summaryMode: { type: 'string', default: 'short' } }, required: ['ref'] },
    handler: async (p) => {
      const result = resultStore.get(p.ref);
      if (!result) return { ok: false, error: { code: 'NOT_FOUND', message: `No result found for ref: ${p.ref}` }, meta: { tool: 'fileforge_audit_summary' } };
      const issues = result.data?.issues ?? collectIssuesFromData(result.data);
      return { ok: true, data: summarizeForMode({ ...result.data, issues, summary: result.summary }, p.summaryMode), meta: { tool: 'fileforge_audit_summary' } };
    },
  },
  {
    name: 'fileforge_sensitive_session_check',
    action: 'sensitive_session_check',
    description: 'Classify whether a URL appears sensitive/private before deep authenticated-page scraping.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' }, title: { type: 'string' }, text: { type: 'string' } }, required: ['url'] },
    handler: async (p) => {
      const haystack = `${p.url} ${p.title ?? ''} ${p.text ?? ''}`.toLowerCase();
      const sensitive = /\b(account|billing|checkout|inbox|messages|email|settings|password|private|dashboard|admin|documents?|drive|dm)\b/.test(haystack);
      return {
        ok: true,
        data: {
          sensitive,
          privacyMode: sensitive ? 'structural-only-recommended' : 'normal',
          warnings: sensitive ? ['This looks like an authenticated or private page. Prefer structural metadata and redacted summaries.'] : [],
          redactions: ['passwords', 'cookies', 'session tokens', 'auth headers', 'personal identifiers'],
        },
        meta: { tool: 'fileforge_sensitive_session_check' },
      };
    },
  },
];

const auditCapabilities = {
  tool: 'fileforge_audit_action',
  actions: {
    query_audit: { description: 'Unified GraphQL-feel audit (modules, presets, scores, issues, roadmap, report, snapshots).', params: { target: { type: 'object' }, preset: { type: 'string' }, query: { type: 'object' } }, risk: 'low', flags: { read: true, browser: true, network: true, artifact: true }, permissions: ['allowBrowser', 'allowNetwork'], produces: ['json'] },
    compare_audit_snapshots: { description: 'Compare two audit snapshots by ID.', params: { beforeSnapshotId: { type: 'string', required: true }, afterSnapshotId: { type: 'string', required: true } }, risk: 'low', flags: { read: true }, permissions: [], produces: ['json'] },
    site_route: { description: 'Audit site routes and links for broken routes, invalid links, duplicates, redirects.', params: { url: { type: 'string', required: true }, maxPages: { type: 'number' }, store: { type: 'boolean' } }, risk: 'medium', flags: { read: true, browser: true, network: true, artifact: true }, permissions: ['allowBrowser', 'allowNetwork'], produces: ['json'] },
    content_consistency: { description: 'Detect pricing/feature/limitation contradictions across crawled pages.', params: { url: { type: 'string', required: true }, maxPages: { type: 'number' } }, risk: 'medium', flags: { read: true, browser: true, network: true, artifact: true }, permissions: ['allowBrowser', 'allowNetwork'], produces: ['json'] },
    extension_policy: { description: 'Review site/listing/manifest copy for Chrome extension policy risks.', params: { url: { type: 'string', required: true }, listingCopy: { type: 'string' }, manifest: { type: 'object' } }, risk: 'medium', flags: { read: true, browser: true, network: true, artifact: true }, permissions: ['allowBrowser', 'allowNetwork'], produces: ['json'] },
    client_side_security: { description: 'Run a client-side security audit.', params: { url: { type: 'string', required: true } }, risk: 'medium', flags: { read: true, browser: true, network: true, artifact: true }, permissions: ['allowBrowser', 'allowNetwork'], produces: ['json'] },
    reveal_client_security_value: { description: 'Reveal a redacted localStorage/sessionStorage value.', params: { tabId: { type: 'string' }, key: { type: 'string', required: true }, namespace: { type: 'string' } }, risk: 'high', flags: { read: true, browser: true }, permissions: ['allowBrowser', 'allowAuthenticatedSession'], produces: ['json'] },
    recommendations_rank: { description: 'Rank issue recommendations by impact.', params: { ref: { type: 'string', required: true } }, risk: 'low', flags: { read: true, artifact: true }, permissions: [], produces: ['json'] },
    compare_runs: { description: 'Compare two audit runs.', params: { baselineRef: { type: 'string', required: true }, currentRef: { type: 'string', required: true } }, risk: 'low', flags: { read: true, artifact: true }, permissions: [], produces: ['json'] },
    export_audit_package: { description: 'Export an audit package (zip) of an audit run.', params: { ref: { type: 'string', required: true }, filename: { type: 'string' } }, risk: 'low', flags: { read: true, artifact: true }, permissions: ['allowFilesystemWrite'], produces: ['zip'] },
    audit_summary: { description: 'Summarize a stored audit run.', params: { ref: { type: 'string', required: true } }, risk: 'low', flags: { read: true }, permissions: [], produces: ['json'] },
    sensitive_session_check: { description: 'Check whether the current session exposes sensitive data.', params: { tabId: { type: 'string' } }, risk: 'medium', flags: { read: true, browser: true }, permissions: ['allowBrowser', 'allowAuthenticatedSession'], produces: ['json'] },
  },
};

const baseAuditTool = makeActionTool({
  name: 'fileforge_audit_action',
  description: 'Audit a page or site for SEO, content, policy and client-side security issues. Prefer query_audit with a preset; compare_runs shows what changed between stored audits. Use fileforge_a11y_action, fileforge_perf_action or fileforge_responsive_action for one focused check. reveal_client_security_value needs FILEFORGE_ALLOW_SECRET_REVEAL=1. Results can be stored. Needs the extension.',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  actions: actionDefs,
  capabilities: auditCapabilities,
});

const auditTool = {
  ...baseAuditTool,
  normalizeAction: normalizeAuditActionName,
  handler: (params = {}, ctx) => baseAuditTool.handler({ ...params, action: normalizeAuditActionName(params.action) }, ctx),
};

const tools = [auditTool];

registry.registerMany(tools);
export { tools };
