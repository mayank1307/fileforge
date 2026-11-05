import { createIssue } from './issueUtils.js';

const KB = 1024;

function metricMap(performance = {}) {
  return Object.fromEntries((performance.metrics?.metrics ?? performance.metrics ?? []).map((metric) => [metric.name, metric.value]));
}

function firstEntry(entries = [], name) {
  return entries.find((entry) => entry.name === name);
}

function requestBytes(request) {
  return request.encodedDataLength ?? request.response?.encodedDataLength ?? 0;
}

function isThirdParty(url, pageUrl) {
  try {
    return new URL(url).origin !== new URL(pageUrl).origin;
  } catch {
    return false;
  }
}

function resourceType(request = {}) {
  const mime = request.response?.mimeType ?? '';
  if (request.type) return request.type.toLowerCase();
  if (/javascript|ecmascript/.test(mime)) return 'script';
  if (/css/.test(mime)) return 'stylesheet';
  if (/image\//.test(mime)) return 'image';
  if (/video\//.test(mime)) return 'media';
  return 'other';
}

function scoreMetric(value, thresholds) {
  if (value == null) return 'unknown';
  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.needsImprovement) return 'needs-improvement';
  return 'poor';
}

function performanceIssue({ url, viewport, metric, value, band, title, impact, suggestedFix }) {
  return createIssue({
    type: `performance.${metric}`,
    dimension: 'performance',
    severity: band === 'poor' ? 'high' : 'medium',
    confidence: 0.82,
    title,
    impact,
    evidence: [{ url, text: `${metric}: ${value}`, raw: { metric, value, band, viewport } }],
    suggestedFix,
  });
}

export function summarizePerformanceAudit({ url, viewport = 'desktop', performance = {}, network = {} } = {}) {
  const timing = performance.timing ?? {};
  const navigation = timing.navigation?.[0] ?? {};
  const paint = timing.paint ?? [];
  const lcpEntries = timing.largestContentfulPaint ?? [];
  const layoutShifts = timing.layoutShift ?? [];
  const longTasks = timing.longTasks ?? [];
  const metrics = metricMap(performance);
  const requests = network.requests ?? [];

  const fcp = firstEntry(paint, 'first-contentful-paint')?.startTime;
  const lcp = lcpEntries.length ? Math.max(...lcpEntries.map((entry) => entry.startTime ?? entry.renderTime ?? entry.loadTime ?? 0)) : undefined;
  const cls = layoutShifts
    .filter((entry) => !entry.hadRecentInput)
    .reduce((total, entry) => total + (entry.value ?? 0), 0);
  const tbt = longTasks.reduce((total, entry) => total + Math.max(0, (entry.duration ?? 0) - 50), 0);
  const domContentLoaded = navigation.domContentLoadedEventEnd;
  const load = navigation.loadEventEnd;

  const bytes = requests.reduce((totals, request) => {
    const size = requestBytes(request);
    const type = resourceType(request);
    totals.total += size;
    if (type === 'script') totals.javascript += size;
    else if (type === 'stylesheet') totals.css += size;
    else if (type === 'image') totals.image += size;
    else if (type === 'media') totals.media += size;
    if (type === 'script' && isThirdParty(request.url, url)) {
      totals.thirdPartyScript += size;
      totals.thirdPartyScripts += 1;
    }
    return totals;
  }, { total: 0, javascript: 0, css: 0, image: 0, media: 0, thirdPartyScript: 0, thirdPartyScripts: 0 });

  const metricBands = {
    fcp: scoreMetric(fcp, { good: 1800, needsImprovement: 3000 }),
    lcp: scoreMetric(lcp, { good: 2500, needsImprovement: 4000 }),
    cls: scoreMetric(cls, { good: 0.1, needsImprovement: 0.25 }),
    tbt: scoreMetric(tbt, { good: 200, needsImprovement: 600 }),
    totalTransferBytes: scoreMetric(bytes.total, { good: 1600 * KB, needsImprovement: 3000 * KB }),
    javascriptBytes: scoreMetric(bytes.javascript, { good: 350 * KB, needsImprovement: 800 * KB }),
  };

  const issues = [];
  if (['needs-improvement', 'poor'].includes(metricBands.lcp)) {
    issues.push(performanceIssue({
      url,
      viewport,
      metric: 'lcp',
      value: Math.round(lcp),
      band: metricBands.lcp,
      title: 'Largest Contentful Paint is slow',
      impact: 'Slow LCP delays the moment users can see the main page content.',
      suggestedFix: 'Optimize the hero/content image, reduce render-blocking work, and prioritize critical resources.',
    }));
  }
  if (['needs-improvement', 'poor'].includes(metricBands.cls)) {
    issues.push(performanceIssue({
      url,
      viewport,
      metric: 'cls',
      value: Number(cls.toFixed(3)),
      band: metricBands.cls,
      title: 'Layout shift exceeds Core Web Vitals guidance',
      impact: 'Unexpected movement can cause mis-clicks and makes the page feel unstable.',
      suggestedFix: 'Reserve dimensions for images, embeds, ads, and late-loading content.',
    }));
  }
  if (['needs-improvement', 'poor'].includes(metricBands.tbt)) {
    issues.push(performanceIssue({
      url,
      viewport,
      metric: 'tbt',
      value: Math.round(tbt),
      band: metricBands.tbt,
      title: 'Main thread blocking time is high',
      impact: 'Heavy JavaScript can delay interaction and make the page feel unresponsive.',
      suggestedFix: 'Split bundles, defer non-critical JavaScript, and reduce long main-thread tasks.',
    }));
  }
  if (['needs-improvement', 'poor'].includes(metricBands.javascriptBytes)) {
    issues.push(performanceIssue({
      url,
      viewport,
      metric: 'javascript-bytes',
      value: bytes.javascript,
      band: metricBands.javascriptBytes,
      title: 'JavaScript transfer size is large',
      impact: 'Large JavaScript payloads slow downloads, parsing, and hydration.',
      suggestedFix: 'Audit bundles, remove unused code, lazy-load below-the-fold features, and trim third-party scripts.',
    }));
  }

  return {
    url,
    viewport,
    metrics: {
      fcp,
      lcp,
      cls,
      tbt,
      domContentLoaded,
      load,
      taskDurationMs: metrics.TaskDuration ? metrics.TaskDuration * 1000 : undefined,
      scriptDurationMs: metrics.ScriptDuration ? metrics.ScriptDuration * 1000 : undefined,
      layoutDurationMs: metrics.LayoutDuration ? metrics.LayoutDuration * 1000 : undefined,
    },
    metricBands,
    transfer: {
      ...bytes,
      requests: requests.length,
      largestResources: requests
        .map((request) => ({ url: request.url, type: resourceType(request), bytes: requestBytes(request) }))
        .filter((resource) => resource.bytes > 0)
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 20),
    },
    issues,
    score: {
      ok: !issues.some((issue) => issue.severity === 'high'),
      poorMetrics: Object.values(metricBands).filter((band) => band === 'poor').length,
      needsImprovementMetrics: Object.values(metricBands).filter((band) => band === 'needs-improvement').length,
    },
  };
}
