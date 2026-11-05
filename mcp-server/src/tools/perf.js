import { registry } from '../registry.js';
import { collectCapture, openInstrumentedTab, resolveViewport } from '../utils/browserCaptureUtils.js';
import { maybeStoreResult } from '../utils/resultUtils.js';
import { normalizeUrl } from '../utils/urlUtils.js';
import { summarizePerformanceAudit } from '../utils/performanceAuditUtils.js';

async function auditViewport(rpcClient, url, viewport, options = {}) {
  const viewportConfig = resolveViewport(viewport);
  const { tabId, idle } = await openInstrumentedTab(rpcClient, url, { ...options, viewport: viewportConfig });
  try {
    const capture = await collectCapture(rpcClient, tabId, {
      ...options,
      includePerformance: true,
      includeScreenshot: options.includeScreenshot ?? false,
      viewport: viewportConfig?.label ?? viewport,
      url,
    });
    const audit = summarizePerformanceAudit({
      url: capture.url ?? url,
      viewport: viewportConfig?.label ?? viewport,
      performance: capture.performance,
      network: capture.network,
    });
    return { ...audit, idle, capture: capture.capture, screenshot: capture.screenshot };
  } finally {
    if (!options.keepOpen) {
      await rpcClient.send('devtools.stopSession', { tabId }).catch(() => null);
      await rpcClient.send('browser.closeTab', { tabId }).catch(() => null);
    }
  }
}

const perfCapabilities = {
  tool: 'fileforge_perf_action',
  actions: {
    audit: { description: 'Run a performance audit (Core Web Vitals) across viewports.', params: { url: { type: 'string', required: true }, viewports: { type: 'array' }, includeScreenshot: { type: 'boolean' }, store: { type: 'boolean' } }, risk: 'medium', flags: { read: true, browser: true, network: true, artifact: true }, permissions: ['allowBrowser', 'allowNetwork'], produces: ['json', 'har'] },
  },
};

const tools = [
  {
    name: 'fileforge_perf_action',
    description: 'Run performance audits and collect metrics.',
    capabilities: perfCapabilities,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['audit'],
          description: 'The performance action to perform.'
        },
        url: { type: 'string' },
        viewports: { type: 'array', items: { type: 'string', enum: ['desktop', 'tablet', 'mobile'] }, default: ['desktop', 'mobile'] },
        includeScreenshot: { type: 'boolean', default: false },
        timeoutMs: { type: 'number', default: 15000 },
        settleMs: { type: 'number', default: 750 },
        networkIdleMs: { type: 'number', default: 500 },
        networkIdleTimeoutMs: { type: 'number', default: 5000 },
        store: { type: 'boolean', default: true },
        project: { type: 'string', default: 'default' },
      },
      required: ['action', 'url'],
    },
    handler: async (p, { rpcClient }) => {
      switch (p.action) {
        case 'audit': {
          const url = normalizeUrl(p.url);
          const viewports = p.viewports?.length ? p.viewports : ['desktop', 'mobile'];
          const audits = [];
          for (const viewport of viewports) {
            audits.push(await auditViewport(rpcClient, url, viewport, p));
          }
          const issues = audits.flatMap((audit) => audit.issues);
          const data = {
            url,
            ok: !issues.some((issue) => ['critical', 'high'].includes(issue.severity)),
            audits,
            issues,
            summary: {
              viewports: audits.length,
              issues: issues.length,
              highIssues: issues.filter((issue) => issue.severity === 'high').length,
              totalTransferBytes: audits.reduce((total, audit) => total + audit.transfer.total, 0),
              largestResources: audits.flatMap((audit) => audit.transfer.largestResources.map((resource) => ({ viewport: audit.viewport, ...resource }))).slice(0, 30),
            },
          };
          const stored = maybeStoreResult({
            store: p.store ?? true,
            prefix: 'perf_audit',
            tool: 'fileforge_perf_action_audit',
            url,
            project: p.project ?? 'default',
            data,
            summary: data.summary,
          });
          return { ok: true, ...stored, meta: { tool: 'fileforge_perf_action', action: p.action, url } };
        }
        default:
          throw new Error(`Unknown action: ${p.action}`);
      }
    },
  },
];

registry.registerMany(tools);
export { tools };
