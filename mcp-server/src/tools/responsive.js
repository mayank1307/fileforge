import { registry } from '../registry.js';
import { captureOwnedTab, openInstrumentedTab, navigateInstrumentedTab, sleep } from '../utils/browserCaptureUtils.js';
import { maybeStoreResult } from '../utils/resultUtils.js';
import { normalizeUrl } from '../utils/urlUtils.js';

function makeRunId(prefix = 'responsive-matrix') {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${stamp}_${rand}`;
}

function normalizeWidths(widths) {
  const fallback = [390, 768, 1440];
  if (!Array.isArray(widths) || !widths.length) return fallback;
  const seen = new Set();
  const normalized = [];
  for (const value of widths) {
    const width = Math.round(Number(value));
    if (!Number.isFinite(width) || width < 240 || width > 3840 || seen.has(width)) continue;
    seen.add(width);
    normalized.push(width);
  }
  return normalized.length ? normalized : fallback;
}

function viewportForWidth(width) {
  if (width <= 480) return { width, height: 844, deviceScaleFactor: 3, mobile: true, label: `${width}w` };
  if (width <= 900) return { width, height: 1024, deviceScaleFactor: 2, mobile: true, label: `${width}w` };
  return { width, height: 1200, deviceScaleFactor: 1, mobile: false, label: `${width}w` };
}

const responsiveCapabilities = {
  tool: 'fileforge_responsive_action',
  actions: {
    scan_layout: { description: 'Scan layout for responsive issues across widths.', params: { url: { type: 'string', required: true }, widths: { type: 'array' }, store: { type: 'boolean' } }, risk: 'medium', flags: { read: true, browser: true, network: true, artifact: true }, permissions: ['allowBrowser', 'allowNetwork'], produces: ['json'] },
    find_overflow: { description: 'Find horizontal overflow at responsive widths.', params: { tabId: { type: 'string' } }, risk: 'low', flags: { read: true, browser: true }, permissions: ['allowBrowser'], produces: ['json'] },
    find_overlaps: { description: 'Find overlapping element boxes.', params: { tabId: { type: 'string' } }, risk: 'low', flags: { read: true, browser: true }, permissions: ['allowBrowser'], produces: ['json'] },
    capture_matrix: { description: 'Capture screenshots at a width matrix.', params: { url: { type: 'string', required: true }, widths: { type: 'array' } }, risk: 'medium', flags: { browser: true, artifact: true }, permissions: ['allowBrowser', 'allowScreenshots'], produces: ['screenshot'] },
  },
};

const tools = [
  {
    name: 'fileforge_responsive_action',
    description: 'Find layout bugs across screen widths: scan a URL, and locate overflow and overlapping elements. capture_matrix takes a screenshot at each viewport. Use fileforge_visual_action to compare screenshots against baselines. Loads the page in your session and can store results; it doesn\'t change the site. Needs the extension.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    capabilities: responsiveCapabilities,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['scan_layout', 'find_overflow', 'find_overlaps', 'capture_matrix'],
        },
        url: { type: 'string' },
        widths: { type: 'array', items: { type: 'number' }, description: 'Viewport widths to test' },
        checks: { type: 'array', items: { type: 'string', enum: ['overflow', 'overlap', 'clipping', 'layoutShift'] } },
        tabId: { type: 'string', default: 'active' },
        store: { type: 'boolean', default: true },
      },
      required: ['action'],
    },
    handler: async (p, { rpcClient }) => {
      switch (p.action) {
        case 'scan_layout': {
          if (!p.url) throw new Error('url is required for scan_layout');
          const data = await rpcClient.send('responsive.scanLayout', p);
          return { ok: true, data, meta: { tool: 'fileforge_responsive_action', action: p.action } };
        }
        case 'find_overflow': {
          const data = await rpcClient.send('responsive.findOverflow', p);
          return { ok: true, data, meta: { tool: 'fileforge_responsive_action', action: p.action } };
        }
        case 'find_overlaps': {
          const data = await rpcClient.send('responsive.findOverlaps', p);
          return { ok: true, data, meta: { tool: 'fileforge_responsive_action', action: p.action } };
        }
        case 'capture_matrix': {
          if (!p.url) throw new Error('url is required for capture_matrix');
          const url = normalizeUrl(p.url);
          const widths = normalizeWidths(p.widths);
          const run = makeRunId();
          const captures = [];
          const warnings = [];
          const firstViewport = viewportForWidth(widths[0]);
          const { tabId, idle } = await openInstrumentedTab(rpcClient, url, {
            active: false,
            timeoutMs: p.timeoutMs ?? 15000,
            settleMs: p.settleMs ?? 500,
            viewport: firstViewport,
          });

          try {
            for (let index = 0; index < widths.length; index += 1) {
              const width = widths[index];
              const viewport = viewportForWidth(width);
              if (index > 0) {
                await rpcClient.send('devtools.setViewport', { tabId, ...viewport }).catch((err) => {
                  warnings.push(`Could not set viewport ${width}px: ${err.message}`);
                });
                await navigateInstrumentedTab(rpcClient, tabId, url, p);
                if ((p.settleMs ?? 500) > 0) await sleep(p.settleMs ?? 500);
              }

              const response = await captureOwnedTab(rpcClient, 'visual.captureScreenshot', {
                tabId,
                format: 'png',
                store: p.store ?? true,
                includeBase64: false,
                project: p.project ?? 'default',
                run,
                name: `responsive-${width}w`,
                url,
                viewport: `${viewport.width}x${viewport.height}`,
              });
              if (!response?.ok) {
                captures.push({
                  width,
                  viewport: `${viewport.width}x${viewport.height}`,
                  ok: false,
                  error: response?.error ?? { code: 'CAPTURE_FAILED', message: 'Capture failed.' },
                });
                continue;
              }
              if (response.warnings?.length) warnings.push(...response.warnings.map((warning) => `${width}px: ${warning}`));
              captures.push({
                width,
                viewport: `${viewport.width}x${viewport.height}`,
                ok: true,
                screenshot: response.data?.screenshot,
                image: response.data?.screenshot ?? response.data,
              });
            }
          } finally {
            await rpcClient.send('devtools.stopSession', { tabId }).catch(() => null);
            await rpcClient.send('browser.closeTab', { tabId }).catch(() => null);
          }

          const data = {
            url,
            run,
            idle,
            captures,
            summary: {
              total: captures.length,
              ok: captures.filter((capture) => capture.ok).length,
              failed: captures.filter((capture) => !capture.ok).length,
            },
          };
          const stored = maybeStoreResult({
            store: p.store ?? true,
            prefix: 'responsive_matrix',
            tool: 'fileforge_responsive_action_capture_matrix',
            url,
            project: p.project ?? 'default',
            data,
            summary: data.summary,
          });
          return {
            ok: data.summary.failed === 0,
            ...stored,
            data: stored.data ?? data,
            warnings: warnings.length ? warnings : undefined,
            meta: { tool: 'fileforge_responsive_action', action: p.action, url },
          };
        }
        default:
          throw new Error(`Unknown action: ${p.action}`);
      }
    },
  },
];

registry.registerMany(tools);
export { tools };
