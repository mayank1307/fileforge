import { registry } from '../registry.js';
import { baselineStore } from '../stores/baselineStore.js';
import { resultStore } from '../stores/resultStore.js';
import { existsSync, readFileSync } from 'fs';
import { dirname } from 'path';
import { captureOwnedTab, navigateInstrumentedTab, openInstrumentedTab, resolveViewport, sleep, VIEWPORT_PRESETS } from '../utils/browserCaptureUtils.js';
import { createZipBuffer, writeExportFile } from '../utils/exportUtils.js';
import { maybeStoreResult } from '../utils/resultUtils.js';
import { comparePngFiles, sha256File } from '../utils/pngDiffUtils.js';
import { makeActionTool } from '../utils/actionToolUtils.js';

function makeRunId(prefix = 'matrix') {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${stamp}_${rand}`;
}

function viewportMatrix(viewports) {
  const requested = viewports?.length ? viewports : ['mobile', 'tablet', 'desktop'];
  return requested.map((viewport) => {
    const resolved = resolveViewport(viewport);
    if (resolved?.width && resolved?.height) return resolved;
    const fallback = VIEWPORT_PRESETS.desktop;
    return { label: String(viewport || 'desktop'), ...fallback };
  });
}

function dataOf(response) {
  return response?.data ?? response;
}

function safeRouteName(route) {
  const text = String(route || '/')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/[?#].*$/, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .slice(0, 80);
  return text || 'home';
}

function joinUrl(baseUrl, route) {
  return new URL(route, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).href;
}

async function captureUrlScreenshot(rpcClient, {
  url,
  viewport = 'desktop',
  fullPage = false,
  project = 'default',
  run,
  name = 'screenshot',
  active = false,
  keepOpen = false,
  timeoutMs = 15000,
  settleMs = 500,
} = {}) {
  const viewportConfig = resolveViewport(viewport);
  const { tabId, idle } = await openInstrumentedTab(rpcClient, url, { active, timeoutMs, settleMs, viewport: viewportConfig });
  try {
    const method = fullPage ? 'visual.captureFullPage' : 'visual.captureScreenshot';
    const response = await captureOwnedTab(rpcClient, method, {
      tabId,
      format: 'png',
      store: true,
      includeBase64: false,
      project,
      run,
      name,
      url,
      viewport: viewportConfig?.label ?? viewport,
    });
    if (!response?.ok) return { ok: false, error: response?.error ?? { code: 'CAPTURE_FAILED', message: 'Screenshot capture failed.' } };
    return {
      ok: true,
      tabId: keepOpen ? tabId : undefined,
      idle,
      screenshot: dataOf(response).screenshot,
      width: dataOf(response).width,
      height: dataOf(response).height,
      pageHeight: dataOf(response).pageHeight,
    };
  } finally {
    if (!keepOpen) {
      await rpcClient.send('devtools.stopSession', { tabId }).catch(() => null);
      await rpcClient.send('browser.closeTab', { tabId }).catch(() => null);
    }
  }
}

function compareScreenshots(before, after, options = {}) {
  const beforePath = before?.fullImagePath;
  const afterPath = after?.fullImagePath;
  if (!beforePath || !afterPath) {
    return { supported: false, reason: 'Missing screenshot file paths.' };
  }

  const beforeHash = sha256File(beforePath);
  const afterHash = sha256File(afterPath);
  const hashes = {
    before: beforeHash,
    after: afterHash,
    exactMatch: beforeHash === afterHash,
  };

  if (before.format !== 'png' || after.format !== 'png') {
    return { supported: false, reason: 'Pixel diff currently supports PNG screenshots.', hashes };
  }

  // Derive output directory for diff artifacts (place them alongside the "after" screenshot)
  const outputDir = dirname(afterPath);
  const outputPrefix = options.outputPrefix ?? 'diff';

  try {
    return { ...comparePngFiles(beforePath, afterPath, { ...options, outputDir, outputPrefix }), hashes };
  } catch (err) {
    return { supported: false, reason: err.message, hashes };
  }
}

function pushArtifactFile(entries, warnings, path, zipPath) {
  if (!path) return false;
  if (!existsSync(path)) {
    warnings.push(`Missing artifact file: ${path}`);
    return false;
  }
  entries.push({ name: zipPath, contents: readFileSync(path) });
  return true;
}

function collectDiffTargets(data) {
  if (!data || typeof data !== 'object') return [];
  if (data.diff) return [{ label: data.name ?? 'comparison', item: data }];
  if (Array.isArray(data.comparisons)) {
    return data.comparisons
      .filter((comparison) => comparison && typeof comparison === 'object' && comparison.diff)
      .map((comparison, index) => ({
        label: comparison.name ?? comparison.route ?? `comparison-${index + 1}`,
        item: comparison,
      }));
  }
  return [];
}

function buildVisualDiffExport(result, ref) {
  const warnings = [];
  const entries = [];
  const payload = result?.data ?? result ?? {};
  const targets = collectDiffTargets(payload);
  if (!targets.length) {
    throw new Error(`Result "${ref}" does not contain visual diff data.`);
  }

  const artifactsSummary = [];
  for (let index = 0; index < targets.length; index += 1) {
    const { label, item } = targets[index];
    const safeLabel = String(label).replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || `comparison-${index + 1}`;
    const prefix = `artifacts/${String(index + 1).padStart(2, '0')}-${safeLabel}`;
    const captured = {
      label,
      baseline: Boolean(item?.baseline?.fullImagePath),
      current: Boolean(item?.current?.fullImagePath),
      diffHeatmap: false,
      composite: false,
      regionData: false,
    };

    captured.baseline = pushArtifactFile(entries, warnings, item?.baseline?.fullImagePath, `${prefix}/baseline.png`);
    captured.current = pushArtifactFile(entries, warnings, item?.current?.fullImagePath, `${prefix}/current.png`);
    captured.diffHeatmap = pushArtifactFile(entries, warnings, item?.diff?.diffImagePath, `${prefix}/diff-heatmap.png`);
    captured.composite = pushArtifactFile(entries, warnings, item?.diff?.compositeImagePath, `${prefix}/composite.png`);
    captured.regionData = pushArtifactFile(entries, warnings, item?.diff?.regionDataPath, `${prefix}/regions.json`);
    artifactsSummary.push(captured);
  }

  const metadata = {
    ref,
    tool: result?.tool ?? null,
    url: result?.url ?? null,
    createdAt: result?.created_at ?? null,
    exportedAt: new Date().toISOString(),
    comparisons: targets.length,
    artifacts: artifactsSummary,
  };
  entries.unshift(
    { name: 'metadata/export.json', contents: JSON.stringify(metadata, null, 2) },
    { name: 'data/result.json', contents: JSON.stringify(result, null, 2) },
  );

  return { zip: createZipBuffer(entries), warnings, summary: metadata };
}

const actionDefs = [
  {
    name: 'fileforge_visual_capture_screenshot',
    description: 'Capture a screenshot of a tab. The tab must be the visible one in its window; otherwise the call returns TAB_NOT_VISIBLE.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'string', default: 'active' },
        fullPage: { type: 'boolean', default: false },
        format: { type: 'string', enum: ['png', 'jpeg'], default: 'png' },
        store: { type: 'boolean', default: true },
        includeBase64: { type: 'boolean', default: false },
        project: { type: 'string', default: 'default' },
        run: { type: 'string', description: 'Optional run ID for grouping screenshot artifacts' },
        name: { type: 'string', description: 'Optional artifact filename stem', default: 'screenshot' },
        url: { type: 'string', description: 'Optional page URL to include in metadata' },
        viewport: { type: 'string', description: 'Optional viewport label or dimensions' },
      },
    },
    handler: async (p, { rpcClient }) => {
      const response = await rpcClient.send('visual.captureScreenshot', p);
      if (!response?.ok) return response;
      return { ok: true, data: response.data, meta: { tool: 'fileforge_visual_capture_screenshot' } };
    },
  },
  {
    name: 'fileforge_visual_capture_full_page',
    description: 'Capture a stitched full-page screenshot of a tab and store it as a local artifact.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'string', default: 'active' },
        store: { type: 'boolean', default: true },
        includeBase64: { type: 'boolean', default: false },
        project: { type: 'string', default: 'default' },
        run: { type: 'string', description: 'Optional run ID for grouping screenshot artifacts' },
        name: { type: 'string', description: 'Optional artifact filename stem', default: 'full-page' },
        maxHeight: { type: 'number', default: 100000 },
        scrollWaitMs: { type: 'number', default: 120 },
        hideFixedElements: { type: 'boolean', default: true },
      },
    },
    handler: async (p, { rpcClient }) => {
      const response = await rpcClient.send('visual.captureFullPage', p);
      if (!response?.ok) return response;
      return { ok: true, data: response.data, warnings: response.warnings, meta: { tool: 'fileforge_visual_capture_full_page' } };
    },
  },
  {
    name: 'fileforge_visual_capture_element',
    description: 'Capture a screenshot of a specific page element by selector and store it as a local artifact.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        tabId: { type: 'string', default: 'active' },
        padding: { type: 'number', default: 0 },
        store: { type: 'boolean', default: true },
        includeBase64: { type: 'boolean', default: false },
        project: { type: 'string', default: 'default' },
        run: { type: 'string', description: 'Optional run ID for grouping screenshot artifacts' },
        name: { type: 'string', description: 'Optional artifact filename stem', default: 'element' },
      },
      required: ['selector'],
    },
    handler: async (p, { rpcClient }) => {
      const response = await rpcClient.send('visual.captureElement', p);
      if (!response?.ok) return response;
      return { ok: true, data: response.data, warnings: response.warnings, meta: { tool: 'fileforge_visual_capture_element' } };
    },
  },
  {
    name: 'fileforge_visual_capture_region',
    description: 'Capture a rectangular viewport or page region and store it as a local artifact.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        coordinateSpace: { type: 'string', enum: ['viewport', 'page'], default: 'viewport' },
        tabId: { type: 'string', default: 'active' },
        store: { type: 'boolean', default: true },
        includeBase64: { type: 'boolean', default: false },
        project: { type: 'string', default: 'default' },
        run: { type: 'string', description: 'Optional run ID for grouping screenshot artifacts' },
        name: { type: 'string', description: 'Optional artifact filename stem', default: 'region' },
      },
      required: ['x', 'y', 'width', 'height'],
    },
    handler: async (p, { rpcClient }) => {
      const response = await rpcClient.send('visual.captureRegion', p);
      if (!response?.ok) return response;
      return { ok: true, data: response.data, warnings: response.warnings, meta: { tool: 'fileforge_visual_capture_region' } };
    },
  },
  {
    name: 'fileforge_visual_pick_and_capture_element',
    description: 'Start an in-page element picker, capture the chosen element, and store it as a local artifact.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'string', default: 'active' },
        padding: { type: 'number', default: 0 },
        timeoutMs: { type: 'number', default: 30000 },
        store: { type: 'boolean', default: true },
        includeBase64: { type: 'boolean', default: false },
        project: { type: 'string', default: 'default' },
        run: { type: 'string', description: 'Optional run ID for grouping screenshot artifacts' },
        name: { type: 'string', description: 'Optional artifact filename stem', default: 'picked-element' },
      },
    },
    handler: async (p, { rpcClient }) => {
      const response = await rpcClient.send('visual.pickAndCaptureElement', p);
      if (!response?.ok) return response;
      return { ok: true, data: response.data, warnings: response.warnings, meta: { tool: 'fileforge_visual_pick_and_capture_element' } };
    },
  },
  {
    name: 'fileforge_visual_capture_matrix',
    description: 'Capture a URL across multiple viewport presets and return stored screenshot artifact refs.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        viewports: {
          type: 'array',
          items: { type: 'string', enum: ['mobile', 'tablet', 'desktop'] },
          default: ['mobile', 'tablet', 'desktop'],
        },
        fullPage: { type: 'boolean', default: false },
        active: { type: 'boolean', default: false },
        keepOpen: { type: 'boolean', default: false },
        timeoutMs: { type: 'number', default: 15000 },
        settleMs: { type: 'number', default: 500 },
        store: { type: 'boolean', default: true },
        includeBase64: { type: 'boolean', default: false },
        project: { type: 'string', default: 'default' },
        run: { type: 'string', description: 'Optional run ID for grouping matrix artifacts' },
        name: { type: 'string', description: 'Optional artifact filename stem', default: 'matrix' },
      },
      required: ['url'],
    },
    handler: async (p, { rpcClient }) => {
      const matrix = viewportMatrix(p.viewports);
      const run = p.run ?? makeRunId('matrix');
      const baseName = p.name ?? 'matrix';
      const first = matrix[0];
      const { tabId, idle } = await openInstrumentedTab(rpcClient, p.url, { ...p, viewport: first, active: p.active ?? false });
      const captures = [];
      const warnings = [];

      try {
        for (let index = 0; index < matrix.length; index += 1) {
          const viewport = matrix[index];
          if (index > 0) {
            await rpcClient.send('devtools.setViewport', { tabId, ...viewport }).catch((err) => {
              warnings.push(`Could not set viewport ${viewport.label}: ${err.message}`);
            });
            await navigateInstrumentedTab(rpcClient, tabId, p.url, p);
          }
          if ((p.settleMs ?? 500) > 0) await sleep(p.settleMs ?? 500);

          const method = p.fullPage ? 'visual.captureFullPage' : 'visual.captureScreenshot';
          const response = await captureOwnedTab(rpcClient, method, {
            tabId,
            store: p.store ?? true,
            includeBase64: p.includeBase64 ?? false,
            project: p.project ?? 'default',
            run,
            name: `${baseName}-${viewport.label ?? index + 1}`,
            url: p.url,
            viewport: viewport.label ?? `${viewport.width}x${viewport.height}`,
          });

          if (!response?.ok) {
            captures.push({ viewport, ok: false, error: response?.error ?? { code: 'CAPTURE_FAILED', message: 'Capture failed.' } });
            continue;
          }
          if (response.warnings?.length) warnings.push(...response.warnings.map((warning) => `${viewport.label}: ${warning}`));
          captures.push({
            viewport,
            ok: true,
            screenshot: response.data?.screenshot,
            width: response.data?.width,
            height: response.data?.height,
            pageHeight: response.data?.pageHeight,
            captureCount: response.data?.captureCount,
          });
        }
      } finally {
        if (!p.keepOpen) {
          await rpcClient.send('devtools.stopSession', { tabId }).catch(() => null);
          await rpcClient.send('browser.closeTab', { tabId }).catch(() => null);
        }
      }

      const data = {
        url: p.url,
        tabId: p.keepOpen ? tabId : undefined,
        run,
        fullPage: Boolean(p.fullPage),
        idle,
        captures,
        summary: {
          total: captures.length,
          ok: captures.filter((capture) => capture.ok).length,
          failed: captures.filter((capture) => !capture.ok).length,
        },
      };
      return { ok: captures.every((capture) => capture.ok), data, warnings: warnings.length ? warnings : undefined, meta: { tool: 'fileforge_visual_capture_matrix', url: p.url } };
    },
  },
  {
    name: 'fileforge_visual_capture_baseline',
    description: 'Capture and store a baseline screenshot for later comparison.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        name: { type: 'string', description: 'Baseline name' },
        viewport: { type: 'string', enum: ['mobile', 'tablet', 'desktop'], default: 'desktop' },
        fullPage: { type: 'boolean', default: false },
        project: { type: 'string', default: 'default' },
        run: { type: 'string', description: 'Optional run ID for grouping baseline artifacts' },
        active: { type: 'boolean', default: false },
        keepOpen: { type: 'boolean', default: false },
      },
      required: ['url', 'name'],
    },
    handler: async (p, { rpcClient }) => {
      const captured = await captureUrlScreenshot(rpcClient, {
        ...p,
        name: `baseline-${p.name}`,
        run: p.run ?? `baseline-${p.name}`,
      });
      if (!captured.ok) return { ...captured, meta: { tool: 'fileforge_visual_capture_baseline' } };

      baselineStore.save({
        name: p.name,
        url: p.url,
        viewport: p.viewport ?? 'desktop',
        path: captured.screenshot.fullImagePath,
        data: {
          screenshot: captured.screenshot,
          fullPage: Boolean(p.fullPage),
          project: p.project ?? 'default',
          run: captured.screenshot.run,
          idle: captured.idle,
        },
      });

      const data = {
        name: p.name,
        url: p.url,
        viewport: p.viewport ?? 'desktop',
        fullPage: Boolean(p.fullPage),
        screenshot: captured.screenshot,
        idle: captured.idle,
      };
      return { ok: true, data, summary: { name: p.name, viewport: p.viewport ?? 'desktop', screenshot: captured.screenshot.fullImage }, meta: { tool: 'fileforge_visual_capture_baseline' } };
    },
  },
  {
    name: 'fileforge_visual_capture_route_baselines',
    description: 'Capture and store baseline screenshots for multiple routes and viewports.',
    inputSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string' },
        routes: { type: 'array', items: { type: 'string' } },
        viewports: {
          type: 'array',
          items: { type: 'string', enum: ['mobile', 'tablet', 'desktop'] },
          default: ['desktop'],
        },
        namePrefix: { type: 'string', default: '' },
        fullPage: { type: 'boolean', default: false },
        project: { type: 'string', default: 'default' },
        run: { type: 'string', description: 'Optional run ID for grouping baseline artifacts' },
        active: { type: 'boolean', default: false },
        keepOpen: { type: 'boolean', default: false },
        timeoutMs: { type: 'number', default: 15000 },
        settleMs: { type: 'number', default: 500 },
        store: { type: 'boolean', default: true },
      },
      required: ['baseUrl', 'routes'],
    },
    handler: async (p, { rpcClient }) => {
      const viewports = p.viewports?.length ? p.viewports : ['desktop'];
      const run = p.run ?? makeRunId('route-baselines');
      const baselines = [];

      for (const route of p.routes) {
        const url = joinUrl(p.baseUrl, route);
        const routeName = safeRouteName(route);
        for (const viewport of viewports) {
          const name = `${p.namePrefix ?? ''}${routeName}`;
          const captured = await captureUrlScreenshot(rpcClient, {
            url,
            viewport,
            fullPage: Boolean(p.fullPage),
            project: p.project ?? 'default',
            run,
            name: `baseline-${name}-${viewport}`,
            active: p.active ?? false,
            keepOpen: p.keepOpen ?? false,
            timeoutMs: p.timeoutMs ?? 15000,
            settleMs: p.settleMs ?? 500,
          });

          if (!captured.ok) {
            baselines.push({ route, url, viewport, name, ok: false, error: captured.error });
            continue;
          }

          baselineStore.save({
            name,
            url,
            viewport,
            path: captured.screenshot.fullImagePath,
            data: {
              screenshot: captured.screenshot,
              fullPage: Boolean(p.fullPage),
              project: p.project ?? 'default',
              run: captured.screenshot.run,
              route,
              baseUrl: p.baseUrl,
              idle: captured.idle,
            },
          });

          baselines.push({
            route,
            url,
            viewport,
            name,
            ok: true,
            screenshot: captured.screenshot,
            idle: captured.idle,
          });
        }
      }

      const failed = baselines.filter((baseline) => !baseline.ok);
      const data = {
        baseUrl: p.baseUrl,
        run,
        baselines,
        summary: {
          total: baselines.length,
          ok: baselines.length - failed.length,
          failed: failed.length,
          routes: p.routes.length,
          viewports: viewports.length,
        },
      };
      const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'visual_route_baselines', tool: 'fileforge_visual_capture_route_baselines', url: p.baseUrl, project: p.project, data, summary: data.summary });
      return { ok: failed.length === 0, ...stored, data: stored.data ?? data, meta: { tool: 'fileforge_visual_capture_route_baselines' } };
    },
  },
  {
    name: 'fileforge_visual_compare_screenshot',
    description: 'Compare the current state of a URL against its stored baseline.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        name: { type: 'string' },
        viewport: { type: 'string', enum: ['mobile', 'tablet', 'desktop'], default: 'desktop' },
        fullPage: { type: 'boolean', default: false },
        ignoreSelectors: { type: 'array', items: { type: 'string' } },
        store: { type: 'boolean', default: true },
        project: { type: 'string', default: 'default' },
        run: { type: 'string', description: 'Optional run ID for grouping comparison artifacts' },
        threshold: { type: 'number', default: 0 },
      },
      required: ['url', 'name'],
    },
    handler: async (p, { rpcClient }) => {
      const baseline = baselineStore.get(p.name, p.viewport ?? 'desktop');
      if (!baseline) {
        return {
          ok: false,
          error: { code: 'BASELINE_NOT_FOUND', message: `No baseline named "${p.name}" for viewport "${p.viewport ?? 'desktop'}".` },
          meta: { tool: 'fileforge_visual_compare_screenshot' },
        };
      }

      const captured = await captureUrlScreenshot(rpcClient, {
        ...p,
        fullPage: p.fullPage ?? baseline.data?.fullPage ?? false,
        name: `current-${p.name}`,
        run: p.run ?? `compare-${p.name}`,
      });
      if (!captured.ok) return { ...captured, meta: { tool: 'fileforge_visual_compare_screenshot' } };

      const diff = compareScreenshots(baseline.data?.screenshot ?? { fullImagePath: baseline.path, format: 'png' }, captured.screenshot, { threshold: p.threshold ?? 0, outputPrefix: `diff-${p.name}` });
      const data = {
        name: p.name,
        url: p.url,
        baselineUrl: baseline.url,
        viewport: p.viewport ?? 'desktop',
        baseline: baseline.data?.screenshot ?? { fullImagePath: baseline.path },
        current: captured.screenshot,
        diff,
        ignoredSelectors: p.ignoreSelectors ?? [],
        artifacts: {
          diffHeatmap: diff.diffImage ?? null,
          diffHeatmapPath: diff.diffImagePath ?? null,
          composite: diff.compositeImage ?? null,
          compositePath: diff.compositeImagePath ?? null,
          regionData: diff.regionDataPath ?? null,
        },
      };
      const summary = {
        changedPercent: diff.changedPercent,
        changedPixels: diff.changedPixels,
        regionCount: diff.regionCount ?? 0,
        averageDelta: diff.averageDelta ?? 0,
        dimensionsChanged: diff.dimensionsChanged,
        exactMatch: diff.hashes?.exactMatch,
        supported: diff.supported,
        hasDiffImage: Boolean(diff.diffImagePath),
        hasComposite: Boolean(diff.compositeImagePath),
      };
      const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'visual_diff', tool: 'fileforge_visual_compare_screenshot', url: p.url, project: p.project, data, summary });
      return { ok: true, ...stored, data: stored.data ?? data, meta: { tool: 'fileforge_visual_compare_screenshot' } };
    },
  },
  {
    name: 'fileforge_visual_compare_routes',
    description: 'Compare multiple routes against their baselines.',
    inputSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string' },
        routes: { type: 'array', items: { type: 'string' } },
        viewports: { type: 'array', items: { type: 'string' } },
        namePrefix: { type: 'string', default: '' },
        fullPage: { type: 'boolean', default: false },
        ignoreSelectors: { type: 'array', items: { type: 'string' } },
        store: { type: 'boolean', default: true },
        project: { type: 'string', default: 'default' },
        threshold: { type: 'number', default: 0 },
      },
      required: ['baseUrl', 'routes'],
    },
    handler: async (p, { rpcClient }) => {
      const viewports = p.viewports?.length ? p.viewports : ['desktop'];
      const comparisons = [];

      for (const route of p.routes) {
        const url = joinUrl(p.baseUrl, route);
        const routeName = safeRouteName(route);
        for (const viewport of viewports) {
          const name = `${p.namePrefix ?? ''}${routeName}`;
          const baseline = baselineStore.get(name, viewport);
          if (!baseline) {
            comparisons.push({ route, url, viewport, name, ok: false, error: { code: 'BASELINE_NOT_FOUND', message: `No baseline named "${name}" for viewport "${viewport}".` } });
            continue;
          }

          const captured = await captureUrlScreenshot(rpcClient, {
            url,
            viewport,
            fullPage: p.fullPage ?? baseline.data?.fullPage ?? false,
            project: p.project ?? 'default',
            run: `compare-routes-${Date.now()}`,
            name: `current-${name}-${viewport}`,
          });
          if (!captured.ok) {
            comparisons.push({ route, url, viewport, name, ok: false, error: captured.error });
            continue;
          }
          const diff = compareScreenshots(baseline.data?.screenshot ?? { fullImagePath: baseline.path, format: 'png' }, captured.screenshot, { threshold: p.threshold ?? 0, outputPrefix: `diff-${name}-${viewport}` });
          comparisons.push({
            route, url, viewport, name, ok: true,
            baseline: baseline.data?.screenshot ?? { fullImagePath: baseline.path },
            current: captured.screenshot,
            diff,
            artifacts: {
              diffHeatmap: diff.diffImage ?? null,
              composite: diff.compositeImage ?? null,
              regionData: diff.regionDataPath ?? null,
            },
          });
        }
      }

      const changed = comparisons.filter((item) => item.ok && (item.diff?.changedPixels > 0 || item.diff?.dimensionsChanged || item.diff?.hashes?.exactMatch === false));
      const failed = comparisons.filter((item) => !item.ok);
      const data = {
        baseUrl: p.baseUrl,
        comparisons,
        summary: {
          total: comparisons.length,
          ok: comparisons.length - failed.length,
          failed: failed.length,
          changed: changed.length,
          maxChangedPercent: Math.max(0, ...changed.map((item) => item.diff?.changedPercent ?? 0)),
          totalRegions: changed.reduce((sum, item) => sum + (item.diff?.regionCount ?? 0), 0),
          routesWithDiffArtifacts: changed.filter((item) => item.artifacts?.diffHeatmap).length,
        },
      };
      const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'visual_route_diff', tool: 'fileforge_visual_compare_routes', url: p.baseUrl, project: p.project, data, summary: data.summary });
      return { ok: failed.length === 0, ...stored, data: stored.data ?? data, meta: { tool: 'fileforge_visual_compare_routes' } };
    },
  },
  {
    name: 'fileforge_visual_extract_css',
    description: 'Extract computed CSS for an element.',
    inputSchema: {
      type: 'object',
      properties: { selector: { type: 'string' }, tabId: { type: 'string', default: 'active' } },
      required: ['selector'],
    },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('visual.extractCss', p);
      return { ok: true, data, meta: { tool: 'fileforge_visual_extract_css' } };
    },
  },
  {
    name: 'fileforge_visual_extract_colors',
    description: 'Extract the color palette from the page.',
    inputSchema: { type: 'object', properties: { tabId: { type: 'string', default: 'active' } } },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('visual.extractColors', p);
      return { ok: true, data, meta: { tool: 'fileforge_visual_extract_colors' } };
    },
  },
  {
    name: 'fileforge_visual_detect_fonts',
    description: 'Detect fonts used on the page.',
    inputSchema: { type: 'object', properties: { tabId: { type: 'string', default: 'active' } } },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('visual.detectFonts', p);
      return { ok: true, data, meta: { tool: 'fileforge_visual_detect_fonts' } };
    },
  },
  {
    name: 'fileforge_visual_measure_element',
    description: 'Measure the size and position of an element.',
    inputSchema: {
      type: 'object',
      properties: { selector: { type: 'string' }, tabId: { type: 'string', default: 'active' } },
      required: ['selector'],
    },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('visual.measureElement', p);
      return { ok: true, data, meta: { tool: 'fileforge_visual_measure_element' } };
    },
  },
  {
    name: 'fileforge_visual_export_diff',
    description: 'Export a visual diff bundle as a ZIP.',
    inputSchema: {
      type: 'object',
      properties: { ref: { type: 'string' }, filename: { type: 'string' } },
      required: ['ref'],
    },
    handler: async (p) => {
      const result = resultStore.get(p.ref);
      if (!result) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: `No result found for ref: ${p.ref}` },
          meta: { tool: 'fileforge_visual_export_diff' },
        };
      }
      const built = buildVisualDiffExport(result, p.ref);
      const filename = writeExportFile({
        filename: p.filename,
        defaultName: `${p.ref}-visual-diff.zip`,
        contents: built.zip,
      });
      return {
        ok: true,
        data: {
          filename,
          ref: p.ref,
          summary: built.summary,
        },
        warnings: built.warnings.length ? built.warnings : undefined,
        meta: { tool: 'fileforge_visual_export_diff' },
      };
    },
  },
];

const visualCapabilities = {
  tool: 'fileforge_visual_action',
  actions: {
    capture_screenshot: { description: 'Capture a screenshot of the visible viewport.', params: { tabId: { type: 'string' }, format: { type: 'string' }, store: { type: 'boolean' } }, risk: 'low', flags: { browser: true, artifact: true }, permissions: ['allowBrowser', 'allowScreenshots'], produces: ['screenshot'] },
    capture_full_page: { description: 'Capture a full-page screenshot.', params: { tabId: { type: 'string' }, store: { type: 'boolean' } }, risk: 'low', flags: { browser: true, artifact: true }, permissions: ['allowBrowser', 'allowScreenshots'], produces: ['screenshot'] },
    capture_element: { description: 'Capture a screenshot of a selector.', params: { selector: { type: 'string', required: true } }, risk: 'low', flags: { browser: true, artifact: true }, permissions: ['allowBrowser', 'allowScreenshots'], produces: ['screenshot'] },
    capture_region: { description: 'Capture a coordinate region.', params: { x: { type: 'number', required: true }, y: { type: 'number', required: true }, width: { type: 'number', required: true }, height: { type: 'number', required: true } }, risk: 'low', flags: { browser: true, artifact: true }, permissions: ['allowBrowser', 'allowScreenshots'], produces: ['screenshot'] },
    pick_and_capture_element: { description: 'Let the user pick an element and capture it.', params: { tabId: { type: 'string' } }, risk: 'medium', flags: { browser: true, artifact: true }, permissions: ['allowBrowser', 'allowScreenshots'], produces: ['screenshot'] },
    capture_matrix: { description: 'Capture screenshots across a viewport matrix.', params: { url: { type: 'string', required: true }, viewports: { type: 'array' } }, risk: 'medium', flags: { browser: true, network: true, artifact: true }, permissions: ['allowBrowser', 'allowNetwork', 'allowScreenshots'], produces: ['screenshot'] },
    capture_baseline: { description: 'Capture a baseline screenshot for visual regression.', params: { url: { type: 'string', required: true }, viewport: { type: 'string' } }, risk: 'low', flags: { browser: true, network: true, artifact: true }, permissions: ['allowBrowser', 'allowNetwork', 'allowScreenshots'], produces: ['screenshot'] },
    capture_route_baselines: { description: 'Capture baselines for multiple routes.', params: { url: { type: 'string', required: true }, routes: { type: 'array' } }, risk: 'medium', flags: { browser: true, network: true, artifact: true }, permissions: ['allowBrowser', 'allowNetwork', 'allowScreenshots'], produces: ['screenshot'] },
    compare_screenshot: { description: 'Compare a current capture against a baseline.', params: { url: { type: 'string', required: true }, viewport: { type: 'string' } }, risk: 'low', flags: { read: true, artifact: true }, permissions: ['allowBrowser', 'allowScreenshots'], produces: ['json', 'screenshot'] },
    compare_routes: { description: 'Compare current routes against route baselines.', params: { url: { type: 'string', required: true } }, risk: 'medium', flags: { read: true, browser: true, artifact: true }, permissions: ['allowBrowser', 'allowScreenshots'], produces: ['json'] },
    extract_css: { description: 'Extract CSS rules from the page.', params: { tabId: { type: 'string' } }, risk: 'low', flags: { read: true, browser: true, artifact: true }, permissions: ['allowBrowser'], produces: ['json'] },
    extract_colors: { description: 'Extract colors used on the page.', params: { tabId: { type: 'string' } }, risk: 'low', flags: { read: true, browser: true, artifact: true }, permissions: ['allowBrowser'], produces: ['json'] },
    detect_fonts: { description: 'Detect fonts used on the page.', params: { tabId: { type: 'string' } }, risk: 'low', flags: { read: true, browser: true, artifact: true }, permissions: ['allowBrowser'], produces: ['json'] },
    measure_element: { description: 'Measure an element (box, computed styles).', params: { selector: { type: 'string', required: true } }, risk: 'low', flags: { read: true, browser: true }, permissions: ['allowBrowser'], produces: ['json'] },
    export_diff: { description: 'Export a visual diff package.', params: { ref: { type: 'string', required: true } }, risk: 'low', flags: { artifact: true }, permissions: ['allowFilesystemWrite'], produces: ['zip'] },
  },
};

const tools = [
  makeActionTool({
    name: 'fileforge_visual_action',
    description: 'Capture and compare how pages look: screenshots of a page, element or region, baselines, visual diffs across routes and viewports, and computed CSS, colors and fonts. Use fileforge_responsive_action to find layout bugs. Files and baselines are saved locally. capture_screenshot needs the tab to be visible. Needs the extension.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    prefix: 'fileforge_visual_',
    actions: actionDefs,
    capabilities: visualCapabilities,
  }),
];

registry.registerMany(tools);
export { tools };
