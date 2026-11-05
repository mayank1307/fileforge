import { createHash } from 'crypto';

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
export const DIMENSIONS = ['reliability', 'performance', 'accessibility', 'seo', 'content', 'policy', 'security', 'conversion', 'visual', 'developer'];

function stableId(parts) {
  return `issue_${createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 12)}`;
}

function compact(value, maxLength = 400) {
  if (value == null) return undefined;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function routeUrl(context, fallback) {
  return context?.route?.route?.href ?? context?.route?.url ?? context?.url ?? fallback;
}

// Requests arrive in two shapes: raw from the extension (response.status, failed) or mapped by query_devtools
// (status, errorText).
function requestStatus(request) {
  return request?.response?.status ?? request?.status ?? 0;
}

function requestError(request) {
  return request?.failed?.errorText ?? request?.errorText;
}

function requestFailed(request) {
  return Boolean(request?.failed || request?.errorText);
}

function requestUrl(request) {
  return String(request?.url ?? '');
}

function isAnalyticsOrAdRequest(request) {
  return /\b(google-analytics|googletagmanager|doubleclick|googlesyndication|pagead|analytics|segment|mixpanel|hotjar|clarity|facebook\.com\/tr|adservice)\b/i.test(requestUrl(request));
}

function isCriticalAsset(request) {
  return ['Document', 'Script', 'Stylesheet', 'Fetch', 'XHR'].includes(request?.type) && !isAnalyticsOrAdRequest(request);
}

function severityForRequest(request) {
  const status = requestStatus(request);
  if (isAnalyticsOrAdRequest(request) && (requestFailed(request) || status === 0 || status >= 400)) return 'low';
  if (status >= 500 || requestError(request) === 'net::ERR_FAILED') return isCriticalAsset(request) ? 'high' : 'medium';
  if (isCriticalAsset(request) && status >= 400) return 'high';
  if (status >= 400) return 'medium';
  return requestFailed(request) ? 'medium' : 'low';
}

function responsiveViewportWidth(item) {
  return item?.viewport?.width ?? item?.width ?? item?.viewportWidth ?? item?.breakpoint;
}

function isResponsiveNoise(item) {
  const width = responsiveViewportWidth(item);
  const text = JSON.stringify(item ?? {});
  return (Number(width) > 0 && Number(width) < 320)
    || /\b(svg|decorative|hidden|display:\s*none|visibility:\s*hidden|position:\s*fixed)\b/i.test(text);
}

function visualConfidence(item, base) {
  return isResponsiveNoise(item) ? Math.min(base, 0.42) : base;
}

export function createIssue({ type, dimension, severity, confidence = 0.9, title, impact, evidence = [], suggestedFix, artifacts = [] }) {
  const normalized = {
    type,
    dimension,
    severity,
    confidence,
    title,
    impact,
    evidence,
    suggestedFix,
    artifacts,
  };
  return {
    id: stableId([type, severity, title, evidence.map((item) => [item.url, item.selector, item.text, item.status]).slice(0, 3)]),
    ...normalized,
  };
}

export function validateIssue(candidate) {
  const required = ['id', 'type', 'dimension', 'severity', 'confidence', 'title', 'impact', 'evidence', 'suggestedFix', 'artifacts'];
  const missing = required.filter((key) => !(key in candidate));
  if (missing.length) return { ok: false, errors: missing.map((key) => `Missing ${key}`) };
  const errors = [];
  if (!SEVERITIES.includes(candidate.severity)) errors.push(`Invalid severity: ${candidate.severity}`);
  if (!DIMENSIONS.includes(candidate.dimension)) errors.push(`Invalid dimension: ${candidate.dimension}`);
  if (typeof candidate.confidence !== 'number' || candidate.confidence < 0 || candidate.confidence > 1) errors.push('confidence must be a number from 0 to 1');
  if (!Array.isArray(candidate.evidence)) errors.push('evidence must be an array');
  if (!Array.isArray(candidate.artifacts)) errors.push('artifacts must be an array');
  return { ok: errors.length === 0, errors };
}

export function formIssues(forms = [], pageUrl) {
  return forms.flatMap((form) => (form.fields ?? [])
    .filter((field) => field.required && !field.name && !field.id)
    .map((field) => createIssue({
      type: 'forms.required-field-unstable-name',
      dimension: 'accessibility',
      severity: 'medium',
      confidence: 0.82,
      title: 'Required form field has no stable name or id',
      impact: 'Agents, tests, autofill, and assistive technologies may not be able to identify the field reliably.',
      evidence: [{ url: pageUrl, selector: field.selector, text: field.placeholder ?? field.type ?? field.tag }],
      suggestedFix: 'Add a stable name or id and ensure the field has an associated visible or accessible label.',
    })));
}

export function issuesFromContext(context = {}, { url } = {}) {
  const pageUrl = routeUrl(context, url);
  const consoleEntries = context.console?.entries ?? [];
  const consoleIssues = consoleEntries.filter((entry) => ['error', 'warning'].includes(entry.level));
  const jsErrors = context.jsErrors?.errors ?? [];
  const failedRequests = (context.network?.requests ?? []).filter((request) => requestFailed(request) || requestStatus(request) >= 400);
  const apiFailures = (context.apiResponses?.responses ?? []).filter((request) => requestFailed(request) || requestStatus(request) >= 400);
  const contrastIssues = context.a11y?.contrastIssues ?? context.a11y?.data?.contrastIssues ?? [];
  const overflow = context.responsive?.overflow ?? [];
  const overlaps = context.responsive?.overlaps ?? [];
  const forms = context.forms?.forms ?? [];

  return [
    ...consoleIssues.map((entry) => createIssue({
      type: 'developer.console-issue',
      dimension: 'developer',
      severity: entry.level === 'error' ? 'high' : 'medium',
      confidence: 0.95,
      title: entry.level === 'error' ? 'Console error detected' : 'Console warning detected',
      impact: 'Console issues can indicate broken JavaScript, failed integrations, deprecated APIs, or noisy diagnostics that obscure real failures.',
      evidence: [{ url: pageUrl, text: compact(entry.text ?? entry.message ?? entry.url ?? entry.source), raw: entry }],
      suggestedFix: 'Inspect the console entry, fix the underlying source, and keep production console output clean.',
    })),
    ...jsErrors.map((entry) => createIssue({
      type: 'developer.javascript-error',
      dimension: 'developer',
      severity: 'high',
      confidence: 0.96,
      title: 'JavaScript exception thrown',
      impact: 'Runtime exceptions can break user flows and make browser automation unreliable.',
      evidence: [{ url: pageUrl, text: compact(entry.exception?.description ?? entry.text ?? entry.url), raw: entry }],
      suggestedFix: 'Trace the exception stack, handle the failing state, and add regression coverage for the affected flow.',
    })),
    ...failedRequests.map((request) => createIssue({
      type: 'reliability.failed-request',
      dimension: 'reliability',
      severity: severityForRequest(request),
      confidence: 0.94,
      title: requestStatus(request) ? `Network request returned ${requestStatus(request)}` : 'Network request failed',
      impact: isAnalyticsOrAdRequest(request)
        ? 'Analytics or ad requests may be blocked by users or extensions; this is usually low priority unless attribution is a declared goal.'
        : 'Failed requests can break page rendering, data loading, media, or critical user actions.',
      evidence: [{ url: request.url, method: request.method, status: requestStatus(request) || undefined, text: requestError(request), raw: request }],
      suggestedFix: 'Fix the failing endpoint or asset reference, remove dead requests, or add graceful fallback behavior.',
    })),
    ...apiFailures.map((request) => createIssue({
      type: 'reliability.api-failure',
      dimension: 'reliability',
      severity: requestStatus(request) >= 500 || requestFailed(request) ? 'high' : 'medium',
      confidence: 0.94,
      title: requestStatus(request) ? `API call returned ${requestStatus(request)}` : 'API call failed',
      impact: 'API failures often break dynamic content, account flows, checkout, forms, or dashboard data.',
      evidence: [{ url: request.url, method: request.method, status: requestStatus(request) || undefined, raw: request }],
      suggestedFix: 'Inspect the API request and response, fix the backend/client contract, and add error-state UI if the failure can recur.',
    })),
    ...contrastIssues.slice(0, 50).map((item) => createIssue({
      type: 'accessibility.contrast',
      dimension: 'accessibility',
      severity: 'medium',
      confidence: 0.78,
      title: 'Potential color contrast issue',
      impact: 'Low contrast can make text or controls difficult to read, especially for users with low vision.',
      evidence: [{ url: pageUrl, selector: item.selector, text: compact(item.issue), raw: item }],
      suggestedFix: 'Adjust foreground/background colors to meet WCAG contrast expectations for the element size and weight.',
    })),
    ...overflow.slice(0, 50).map((item) => createIssue({
      type: 'visual.horizontal-overflow',
      dimension: 'visual',
      severity: isResponsiveNoise(item) ? 'low' : 'medium',
      confidence: visualConfidence(item, 0.86),
      title: isResponsiveNoise(item) ? 'Low-confidence responsive overflow signal' : 'Element may cause horizontal overflow',
      impact: isResponsiveNoise(item)
        ? 'This responsive signal may come from an extreme viewport, decorative element, hidden node, or expected fixed overlay.'
        : 'Horizontal overflow can create broken mobile layouts and hidden content.',
      evidence: [{ url: pageUrl, selector: item.selector ?? (item.id ? `#${item.id}` : item.tag), viewport: item.viewport, confidenceReason: isResponsiveNoise(item) ? 'noise-filtered' : 'normal-breakpoint', raw: item }],
      suggestedFix: 'Constrain the element width, fix long unwrapped content, or adjust responsive layout rules.',
    })),
    ...overlaps.slice(0, 50).map((item) => createIssue({
      type: 'visual.element-overlap',
      dimension: 'visual',
      severity: isResponsiveNoise(item) ? 'low' : 'medium',
      confidence: visualConfidence(item, 0.7),
      title: isResponsiveNoise(item) ? 'Low-confidence element overlap signal' : 'Elements appear to overlap',
      impact: isResponsiveNoise(item)
        ? 'This overlap may be expected decoration, hidden/offscreen content, SVG layering, or an extreme viewport artifact.'
        : 'Overlapping UI can hide text, block controls, or make the page look broken.',
      evidence: [{ url: pageUrl, text: compact(item), viewport: item.viewport, confidenceReason: isResponsiveNoise(item) ? 'noise-filtered' : 'normal-breakpoint', raw: item }],
      suggestedFix: 'Review spacing, positioning, z-index, and responsive breakpoints for the affected elements.',
    })),
    ...formIssues(forms, pageUrl),
  ];
}

export function summarizeIssues(issues = [], extraCounts = {}) {
  const countsBySeverity = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  const countsByDimension = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, 0]));
  for (const item of issues) {
    if (item.severity in countsBySeverity) countsBySeverity[item.severity] += 1;
    if (item.dimension in countsByDimension) countsByDimension[item.dimension] += 1;
  }

  return {
    ok: !issues.some((item) => ['critical', 'high'].includes(item.severity)),
    counts: {
      totalIssues: issues.length,
      ...extraCounts,
      bySeverity: countsBySeverity,
      byDimension: countsByDimension,
    },
    topIssues: issues.slice(0, 50),
    issues,
  };
}

export function collectIssuesFromData(data) {
  const issues = [];
  const seen = new Set();

  function addIssue(candidate) {
    if (!candidate || typeof candidate !== 'object') return;
    if (!validateIssue(candidate).ok) return;
    const key = `${candidate.id}:${candidate.evidence?.[0]?.url ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push(candidate);
  }

  function visit(value, key) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      if (key === 'issues' || key === 'topIssues') {
        for (const item of value) addIssue(item);
        return;
      }
      for (const item of value) visit(item);
      return;
    }

    if (validateIssue(value).ok) {
      addIssue(value);
      return;
    }

    for (const [childKey, childValue] of Object.entries(value)) {
      visit(childValue, childKey);
    }
  }

  visit(data);
  return issues;
}
