import { createHash, randomUUID } from 'node:crypto';

// ─── Action aliases ───────────────────────────────────────────────────────────

const ACTION_ALIASES = {
  'audit.query': 'query_audit',
  'audit.run': 'query_audit',
  'query_audit': 'query_audit',
  'audit.compareSnapshots': 'compare_audit_snapshots',
  'compare_audit_snapshots': 'compare_audit_snapshots',
  'audit.exportReport': 'export_audit_report',
  'export_audit_report': 'export_audit_report',
};

export function normalizeActionName(action) {
  return ACTION_ALIASES[action] ?? action;
}

// ─── Limits ───────────────────────────────────────────────────────────────────

export const LIMITS = {
  issues: { default: 100, max: 1000 },
  links: { max: 1000 },
  assets: { max: 1000 },
  screenshots: { maxViewports: 5 },
  crawl: { default: 10, max: 100 },
};

// ─── Severities & categories ──────────────────────────────────────────────────

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
const SEVERITY_RANK = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };

export const SCORE_CATEGORIES = ['overall', 'seo', 'accessibility', 'performance', 'conversion', 'technical', 'content', 'privacyTrust', 'structuredData', 'visual'];

export const ISSUE_CATEGORIES = ['seo', 'accessibility', 'performance', 'conversion', 'technical', 'content', 'privacyTrust', 'structuredData', 'visual', 'links', 'forms', 'assets'];

// ─── Field allowlists ─────────────────────────────────────────────────────────

export const FIELDS = {
  page: ['url', 'finalUrl', 'title', 'description', 'language', 'domain', 'wordCount', 'headings', 'mainText', 'metadata', 'canonical', 'viewport', 'statusCode'],
  seo: ['title', 'description', 'canonical', 'robots', 'sitemap', 'headings', 'h1', 'h2', 'openGraph', 'twitterCard', 'imageAlt', 'internalLinks', 'externalLinks', 'metadata', 'contentQuality', 'indexability'],
  accessibility: ['issues', 'summary', 'keyboard', 'contrast', 'landmarks', 'headings', 'forms', 'images', 'aria', 'focus', 'snapshot'],
  performance: ['coreWebVitals', 'lighthouseLikeScore', 'resourceSummary', 'largestAssets', 'renderBlocking', 'thirdPartyScripts', 'imageOptimization', 'fontLoading', 'cacheHints', 'requestCount', 'totalTransferSize'],
  conversion: ['hero', 'valueProposition', 'primaryCta', 'secondaryCta', 'cta', 'ctaVisibility', 'pricing', 'trustSignals', 'testimonials', 'socialProof', 'faq', 'featureClarity', 'productClarity', 'features', 'comparison', 'demo', 'screenshotsDemo', 'chromeWebStoreCta', 'privacyMessaging', 'objectionHandling'],
  visual: ['screenshots', 'horizontalOverflow', 'ctaVisibility', 'tapTargets', 'fontSizes', 'layoutShiftRisks', 'modalBlockers', 'stickyHeaderIssues', 'aboveTheFold', 'mobileNav', 'heroClarity', 'clutter', 'imageAspectRatios', 'layoutBlockers'],
  technical: ['consoleErrors', 'consoleWarnings', 'failedRequests', 'brokenImages', 'brokenLinks', 'statusCode', 'redirectChain', 'mixedContent', 'corsErrors', 'securityHeaders', 'viewportMeta', 'favicon', 'manifest', 'robotsTxt', 'sitemapXml'],
  privacyTrust: ['privacyPolicy', 'terms', 'contactInfo', 'dataCollectionStatement', 'cookieNotice', 'permissionsExplanation', 'pricingTransparency', 'refundInfo', 'supportInfo', 'businessIdentity', 'legalLinks'],
  structuredData: ['jsonLd', 'schemaTypes', 'softwareApplicationSchema', 'productSchema', 'faqSchema', 'breadcrumbSchema', 'organizationSchema', 'invalidSchema', 'schemaWarnings', 'contentMismatch'],
  links: ['text', 'href', 'absoluteUrl', 'status', 'external', 'type', 'placement', 'intent', 'visible', 'accessibleName'],
  assets: ['url', 'type', 'size', 'transferSize', 'status', 'renderBlocking', 'lazyLoaded', 'alt', 'dimensions', 'visible'],
  forms: ['selector', 'method', 'action', 'fields', 'labels', 'requiredFields', 'submitButtons', 'validationMessages', 'accessibilityIssues', 'autofillHints'],
  issues: ['id', 'category', 'severity', 'title', 'description', 'evidence', 'selector', 'route', 'impact', 'fixSuggestion', 'codeExample', 'effort', 'priority', 'tags', 'sourceTool'],
  scores: SCORE_CATEGORIES,
};

export const QUERY_MODULES = new Set([
  'page', 'seo', 'accessibility', 'performance', 'conversion', 'visual',
  'technical', 'privacyTrust', 'structuredData', 'links', 'assets', 'forms',
  'crawl', 'scores', 'issues', 'roadmap', 'report', 'snapshot', 'summary',
]);

const VIEWPORTS = new Set(['mobile', 'tablet', 'desktop']);
const STANDARDS = new Set(['WCAG2A', 'WCAG2AA', 'WCAG2AAA']);
const REPORT_FORMATS = new Set(['json', 'markdown', 'html']);
const TARGET_TYPES = new Set(['active_tab', 'url', 'html']);
const ROADMAP_BUCKETS = new Set(['fixToday', 'fixThisWeek', 'improveLater', 'optionalPolish']);

// ─── Presets ──────────────────────────────────────────────────────────────────

export const PRESETS = {
  quick_audit: {
    page: { fields: ['url', 'title', 'description', 'language', 'wordCount'] },
    seo: { fields: ['title', 'description', 'canonical', 'headings', 'imageAlt'], includeIssues: true },
    accessibility: { standard: 'WCAG2AA', fields: ['issues', 'summary', 'contrast'], includeFixSuggestions: true },
    technical: { fields: ['consoleErrors', 'failedRequests', 'brokenImages', 'brokenLinks'] },
    scores: true,
    issues: { where: { severityIn: ['critical', 'high', 'medium'] }, limit: 50 },
    roadmap: true,
    summary: true,
  },
  full_page_audit: {
    page: true, seo: true,
    accessibility: { standard: 'WCAG2AA', includeFixSuggestions: true },
    performance: true, conversion: true,
    visual: { viewports: ['mobile', 'tablet', 'desktop'] },
    technical: true, privacyTrust: true, structuredData: true,
    scores: true, issues: true, roadmap: true,
    report: { formats: ['json', 'markdown'] },
    snapshot: true, summary: true,
  },
  full_site_audit: {
    crawl: { enabled: true, maxPages: 25, sameOriginOnly: true, includePatterns: ['/'], excludePatterns: ['/login', '/checkout', '/account'] },
    page: true, seo: true,
    accessibility: { standard: 'WCAG2AA', includeFixSuggestions: true },
    performance: true, technical: true, structuredData: true,
    scores: true, issues: true, roadmap: true,
    report: { formats: ['json', 'markdown'] },
    snapshot: true, summary: true,
  },
  seo_audit: {
    page: true,
    seo: { fields: ['title', 'description', 'canonical', 'robots', 'headings', 'openGraph', 'twitterCard', 'imageAlt', 'internalLinks', 'externalLinks', 'indexability'], includeIssues: true },
    structuredData: true,
    scores: { include: ['seo'] },
    issues: { where: { category: 'seo' } },
    roadmap: true, summary: true,
  },
  accessibility_audit: {
    page: true,
    accessibility: { standard: 'WCAG2AA', includeFixSuggestions: true },
    scores: { include: ['accessibility'] },
    issues: { where: { category: 'accessibility' } },
    roadmap: true, summary: true,
  },
  performance_audit: {
    page: true,
    performance: true,
    technical: { fields: ['consoleErrors', 'failedRequests'] },
    scores: { include: ['performance'] },
    issues: { where: { category: 'performance' } },
    roadmap: true, summary: true,
  },
  landing_page_audit: {
    page: true, seo: true,
    accessibility: { standard: 'WCAG2AA', includeFixSuggestions: true },
    performance: true, conversion: true,
    visual: { viewports: ['mobile', 'desktop'] },
    structuredData: true, technical: true, privacyTrust: true,
    scores: true, issues: true, roadmap: true,
    report: { formats: ['json', 'markdown'] },
    snapshot: true, summary: true,
  },
  chrome_extension_landing_audit: {
    page: true, seo: true,
    accessibility: { standard: 'WCAG2AA', includeFixSuggestions: true },
    performance: true,
    conversion: { productType: 'chrome_extension', fields: ['hero', 'primaryCta', 'chromeWebStoreCta', 'featureClarity', 'pricing', 'privacyMessaging', 'trustSignals', 'screenshotsDemo', 'faq', 'socialProof'] },
    privacyTrust: { fields: ['privacyPolicy', 'terms', 'contactInfo', 'dataCollectionStatement', 'permissionsExplanation', 'pricingTransparency', 'refundInfo'] },
    structuredData: { fields: ['jsonLd', 'schemaTypes', 'softwareApplicationSchema', 'contentMismatch'] },
    visual: { viewports: ['mobile', 'desktop'], fields: ['ctaVisibility', 'heroClarity', 'horizontalOverflow', 'tapTargets', 'layoutBlockers'] },
    technical: { fields: ['consoleErrors', 'failedRequests', 'brokenImages', 'brokenLinks'] },
    scores: true, issues: true, roadmap: true,
    report: { formats: ['json', 'markdown'] },
    snapshot: true, summary: true,
  },
  conversion_audit: {
    page: true,
    conversion: { fields: ['hero', 'valueProposition', 'cta', 'ctaVisibility', 'pricing', 'trustSignals', 'socialProof', 'faq', 'productClarity'] },
    visual: { viewports: ['mobile', 'desktop'], fields: ['ctaVisibility', 'aboveTheFold', 'heroClarity'] },
    scores: { include: ['conversion'] },
    issues: { where: { category: 'conversion' } },
    roadmap: true, summary: true,
  },
  technical_audit: {
    page: true, technical: true,
    scores: { include: ['technical'] },
    issues: { where: { category: 'technical' } },
    roadmap: true, summary: true,
  },
  privacy_trust_audit: {
    page: true,
    privacyTrust: true,
    scores: { include: ['privacyTrust'] },
    issues: { where: { category: 'privacyTrust' } },
    roadmap: true, summary: true,
  },
  pre_launch_audit: {
    page: true, seo: true,
    accessibility: { standard: 'WCAG2AA', includeFixSuggestions: true },
    performance: true, conversion: true, visual: true,
    technical: true, privacyTrust: true, structuredData: true,
    scores: true, issues: true, roadmap: true,
    report: { formats: ['json', 'markdown'] },
    snapshot: true, summary: true,
  },
  post_deploy_audit: {
    page: true, seo: true, performance: true,
    technical: true, structuredData: true,
    scores: true, issues: true, roadmap: true,
    snapshot: true, summary: true,
  },
  competitor_audit: {
    page: true, seo: true,
    conversion: { fields: ['hero', 'cta', 'pricing', 'features', 'trustSignals', 'socialProof', 'faq'] },
    structuredData: true,
    technical: { fields: ['brokenLinks', 'brokenImages', 'consoleErrors'] },
    scores: true, issues: true, roadmap: true,
    snapshot: true, summary: true,
  },
  regression_audit: {
    page: true, seo: true, performance: true, technical: true,
    scores: true, issues: true, snapshot: true, summary: true,
  },
};

// ─── Errors ───────────────────────────────────────────────────────────────────

export function createErrorResponse(code, message, extra = {}) {
  return { ok: false, error: { code, message, ...extra }, meta: { tool: 'fileforge_audit_action' } };
}

function validationError(code, message, path, extra = {}) {
  return createErrorResponse(code, message, { path, ...extra });
}

export function createSuccessResponse(payload) {
  return {
    ok: true,
    timestamp: new Date().toISOString(),
    ...payload,
    meta: { tool: 'fileforge_audit_action', ...(payload.meta ?? {}) },
  };
}

// ─── Preset / query resolution ────────────────────────────────────────────────

export function resolveAuditPreset(name) {
  if (!name) return null;
  const preset = PRESETS[name];
  if (!preset) return { error: validationError('INVALID_PRESET', `Unknown preset '${name}'`, 'preset', { allowedPresets: Object.keys(PRESETS) }) };
  return { preset: JSON.parse(JSON.stringify(preset)) };
}

function mergeShallow(base, override) {
  if (!base) return override ?? {};
  if (!override) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export function resolveAuditQuery({ preset, query }) {
  if (preset) {
    const resolved = resolveAuditPreset(preset);
    if (resolved.error) return resolved;
    return { query: mergeShallow(resolved.preset, query) };
  }
  return { query: query ?? { page: true, summary: true } };
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateFields(spec, allowed, path) {
  if (!Array.isArray(spec?.fields)) return null;
  for (let i = 0; i < spec.fields.length; i++) {
    if (!allowed.includes(spec.fields[i])) {
      return validationError('INVALID_FIELD', `Field '${spec.fields[i]}' is not allowed in ${path}.fields`, `query.${path}.fields[${i}]`, { allowedFields: allowed });
    }
  }
  return null;
}

export function validateAuditQuery(query) {
  if (!query || typeof query !== 'object') return validationError('INVALID_FIELD', 'query must be an object', 'query');

  for (const key of Object.keys(query)) {
    if (!QUERY_MODULES.has(key)) {
      return validationError('INVALID_FIELD', `Unknown query module '${key}'`, `query.${key}`, { allowedModules: [...QUERY_MODULES] });
    }
    const spec = query[key];
    if (spec === true || spec === false || spec == null) continue;
    if (typeof spec !== 'object') return validationError('INVALID_FIELD', `Module '${key}' must be true or an object`, `query.${key}`);

    if (FIELDS[key]) {
      const err = validateFields(spec, FIELDS[key], key);
      if (err) return err;
    }

    if (key === 'accessibility' && spec.standard && !STANDARDS.has(spec.standard)) {
      return validationError('INVALID_FIELD', `Unknown accessibility standard '${spec.standard}'`, 'query.accessibility.standard', { allowedStandards: [...STANDARDS] });
    }
    if (key === 'visual' && Array.isArray(spec.viewports)) {
      if (spec.viewports.length > LIMITS.screenshots.maxViewports) {
        return validationError('INVALID_LIMIT', `visual.viewports exceeds max ${LIMITS.screenshots.maxViewports}`, 'query.visual.viewports');
      }
      for (let i = 0; i < spec.viewports.length; i++) {
        if (!VIEWPORTS.has(spec.viewports[i])) {
          return validationError('INVALID_FIELD', `Unknown viewport '${spec.viewports[i]}'`, `query.visual.viewports[${i}]`, { allowedViewports: [...VIEWPORTS] });
        }
      }
    }
    if (key === 'crawl' && spec.enabled) {
      if (spec.maxPages != null) {
        if (typeof spec.maxPages !== 'number' || spec.maxPages < 1 || spec.maxPages > LIMITS.crawl.max) {
          return validationError('INVALID_LIMIT', `crawl.maxPages must be between 1 and ${LIMITS.crawl.max}`, 'query.crawl.maxPages');
        }
      }
    }
    if (key === 'issues') {
      if (spec.limit != null) {
        if (typeof spec.limit !== 'number' || spec.limit < 0 || spec.limit > LIMITS.issues.max) {
          return validationError('INVALID_LIMIT', `issues.limit exceeds max ${LIMITS.issues.max}`, 'query.issues.limit');
        }
      }
      const where = spec.where ?? {};
      if (where.severity && !SEVERITIES.includes(where.severity)) {
        return validationError('INVALID_FILTER', `Unknown severity '${where.severity}'`, 'query.issues.where.severity', { allowedSeverities: SEVERITIES });
      }
      if (Array.isArray(where.severityIn)) {
        for (let i = 0; i < where.severityIn.length; i++) {
          if (!SEVERITIES.includes(where.severityIn[i])) {
            return validationError('INVALID_FILTER', `Unknown severity '${where.severityIn[i]}'`, `query.issues.where.severityIn[${i}]`, { allowedSeverities: SEVERITIES });
          }
        }
      }
    }
    if (key === 'report' && Array.isArray(spec.formats)) {
      for (let i = 0; i < spec.formats.length; i++) {
        if (!REPORT_FORMATS.has(spec.formats[i])) {
          return validationError('INVALID_FIELD', `Unknown report format '${spec.formats[i]}'`, `query.report.formats[${i}]`, { allowedFormats: [...REPORT_FORMATS] });
        }
      }
    }
    if (key === 'roadmap' && Array.isArray(spec.buckets)) {
      for (let i = 0; i < spec.buckets.length; i++) {
        if (!ROADMAP_BUCKETS.has(spec.buckets[i])) {
          return validationError('INVALID_FIELD', `Unknown roadmap bucket '${spec.buckets[i]}'`, `query.roadmap.buckets[${i}]`, { allowedBuckets: [...ROADMAP_BUCKETS] });
        }
      }
    }
  }
  return null;
}

export function resolveAuditTarget(target) {
  if (!target) return { target: { type: 'active_tab' } };
  if (!TARGET_TYPES.has(target.type)) {
    return { error: validationError('INVALID_TARGET', `Unsupported target type '${target.type}'`, 'target.type', { allowedTypes: [...TARGET_TYPES] }) };
  }
  if (target.type === 'url' && !target.url) {
    return { error: validationError('INVALID_TARGET', 'target.url is required when type=url', 'target.url') };
  }
  if (target.type === 'html' && !target.html) {
    return { error: validationError('INVALID_TARGET', 'target.html is required when type=html', 'target.html') };
  }
  return { target };
}

// ─── Field projection ─────────────────────────────────────────────────────────

export function projectFields(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;
  if (!Array.isArray(fields) || fields.length === 0) return obj;
  const out = {};
  for (const f of fields) if (f in obj) out[f] = obj[f];
  return out;
}

// ─── Issue model ──────────────────────────────────────────────────────────────

function stableIssueId(category, title, evidence) {
  const seed = JSON.stringify([category, title, evidence?.selector, evidence?.currentValue, evidence?.route]);
  return `${category}_${createHash('sha1').update(seed).digest('hex').slice(0, 10)}`;
}

function inferPriority(severity) {
  if (severity === 'critical') return 'fixToday';
  if (severity === 'high') return 'fixToday';
  if (severity === 'medium') return 'fixThisWeek';
  if (severity === 'low') return 'improveLater';
  return 'optionalPolish';
}

function inferEffort(severity) {
  if (severity === 'critical') return 'medium';
  if (severity === 'high') return 'medium';
  return 'low';
}

export function makeIssue({ id, category, severity, title, description, evidence, impact, fixSuggestion, effort, priority, tags = [], sourceTool, codeExample, route, selector }) {
  const normalizedEvidence = evidence ?? { selector, route };
  const sev = SEVERITIES.includes(severity) ? severity : 'medium';
  return {
    id: id ?? stableIssueId(category, title, normalizedEvidence),
    category,
    severity: sev,
    title,
    description: description ?? title,
    evidence: normalizedEvidence,
    impact: impact ?? '',
    fixSuggestion: fixSuggestion ?? null,
    codeExample: codeExample ?? null,
    effort: effort ?? inferEffort(sev),
    priority: priority ?? inferPriority(sev),
    tags,
    sourceTool: sourceTool ?? 'audit',
  };
}

export function normalizeIssues(issues = []) {
  const seen = new Map();
  for (const raw of issues) {
    if (!raw) continue;
    const issue = makeIssue(raw);
    if (!seen.has(issue.id)) seen.set(issue.id, issue);
  }
  return [...seen.values()];
}

export function applyIssueFilters(issues, spec) {
  if (!spec || spec === true) return issues.slice(0, LIMITS.issues.default);
  const where = spec.where ?? {};
  let out = issues.filter((it) => {
    if (where.category && it.category !== where.category) return false;
    if (Array.isArray(where.categoryIn) && !where.categoryIn.includes(it.category)) return false;
    if (where.severity && it.severity !== where.severity) return false;
    if (Array.isArray(where.severityIn) && !where.severityIn.includes(it.severity)) return false;
    return true;
  });
  const sortBy = spec.sortBy ?? 'severity';
  const order = spec.sortOrder === 'asc' ? 1 : -1;
  out.sort((a, b) => {
    if (sortBy === 'severity') return (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) * order;
    return String(a[sortBy] ?? '').localeCompare(String(b[sortBy] ?? '')) * order;
  });
  const limit = Math.min(spec.limit ?? LIMITS.issues.default, LIMITS.issues.max);
  out = out.slice(0, limit);
  if (Array.isArray(spec.fields) && spec.fields.length > 0) {
    out = out.map((it) => projectFields(it, spec.fields));
  }
  return out;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

const SEVERITY_PENALTY = { critical: 30, high: 15, medium: 7, low: 3, info: 0 };

export function scoreAudit(issuesByCategory) {
  const scores = {};
  for (const cat of SCORE_CATEGORIES) {
    if (cat === 'overall') continue;
    const list = issuesByCategory[cat] ?? [];
    let penalty = 0;
    for (const it of list) penalty += SEVERITY_PENALTY[it.severity] ?? 0;
    scores[cat] = Math.max(0, Math.min(100, 100 - penalty));
  }
  const values = SCORE_CATEGORIES.filter((c) => c !== 'overall').map((c) => scores[c]);
  scores.overall = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  return scores;
}

export function gradeForScore(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 50) return 'Needs Work';
  return 'Critical';
}

export function buildGrades(scores) {
  return Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, gradeForScore(v)]));
}

// ─── Roadmap ──────────────────────────────────────────────────────────────────

export function buildRoadmap(issues, spec) {
  const buckets = (spec && spec !== true && Array.isArray(spec.buckets)) ? spec.buckets : ['fixToday', 'fixThisWeek', 'improveLater', 'optionalPolish'];
  const roadmap = {};
  for (const b of buckets) roadmap[b] = [];
  for (const it of issues) {
    if (!roadmap[it.priority]) continue;
    roadmap[it.priority].push({
      title: it.title,
      category: it.category,
      severity: it.severity,
      effort: it.effort,
      why: it.impact,
      relatedIssueIds: [it.id],
    });
  }
  return roadmap;
}

// ─── Report ───────────────────────────────────────────────────────────────────

export function buildMarkdownReport({ target, scores, grades, issues, roadmap, summary }) {
  const lines = [];
  lines.push(`# Audit Report — ${target?.url ?? target?.type ?? 'page'}`);
  lines.push('');
  lines.push('## Executive Summary');
  if (summary?.headline) lines.push(summary.headline);
  if (summary?.totalIssues != null) lines.push(`Total issues: ${summary.totalIssues}`);
  lines.push('');
  if (scores) {
    lines.push('## Scores');
    for (const [k, v] of Object.entries(scores)) {
      lines.push(`- **${k}**: ${v} (${grades?.[k] ?? gradeForScore(v)})`);
    }
    lines.push('');
  }
  const critical = issues.filter((it) => it.severity === 'critical');
  if (critical.length) {
    lines.push('## Top Critical Issues');
    for (const it of critical.slice(0, 10)) lines.push(`- ${it.title}`);
    lines.push('');
  }
  const quickWins = issues.filter((it) => it.priority === 'fixToday' && (it.effort === 'low' || it.effort === 'medium')).slice(0, 10);
  if (quickWins.length) {
    lines.push('## Quick Wins');
    for (const it of quickWins) lines.push(`- [${it.severity}] ${it.title}`);
    lines.push('');
  }
  lines.push('## Detailed Issues');
  for (const it of issues.slice(0, 50)) {
    lines.push(`### [${it.severity.toUpperCase()}] ${it.title}`);
    if (it.description && it.description !== it.title) lines.push(it.description);
    if (it.evidence) lines.push(`Evidence: \`${JSON.stringify(it.evidence).slice(0, 240)}\``);
    if (it.impact) lines.push(`Impact: ${it.impact}`);
    const fixText = typeof it.fixSuggestion === 'string' ? it.fixSuggestion : it.fixSuggestion?.summary;
    if (fixText) lines.push(`Fix: ${fixText}`);
    if (it.fixSuggestion?.example) lines.push('```\n' + it.fixSuggestion.example + '\n```');
    lines.push('');
  }
  if (roadmap) {
    lines.push('## Roadmap');
    for (const [bucket, items] of Object.entries(roadmap)) {
      lines.push(`### ${bucket} (${items.length})`);
      for (const item of items.slice(0, 20)) lines.push(`- ${item.title} — ${item.category}`);
      lines.push('');
    }
  }
  lines.push('## Technical Appendix');
  lines.push(`Generated: ${new Date().toISOString()}`);
  return lines.join('\n');
}

export function buildReport(spec, ctx) {
  const formats = (spec && spec !== true && Array.isArray(spec.formats)) ? spec.formats : ['json'];
  const report = {};
  if (formats.includes('json')) {
    report.json = { scores: ctx.scores, issues: ctx.issues, roadmap: ctx.roadmap, summary: ctx.summary };
  }
  if (formats.includes('markdown')) {
    report.markdown = buildMarkdownReport(ctx);
  }
  if (formats.includes('html')) {
    const md = buildMarkdownReport(ctx);
    report.html = `<!doctype html><meta charset="utf-8"><title>Audit Report</title><pre>${escapeHtml(md)}</pre>`;
  }
  return report;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// ─── Summary ──────────────────────────────────────────────────────────────────

export function buildAuditSummary({ scores, issues, target }) {
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  const byCategory = {};
  for (const it of issues) {
    bySeverity[it.severity] = (bySeverity[it.severity] ?? 0) + 1;
    byCategory[it.category] = (byCategory[it.category] ?? 0) + 1;
  }
  return {
    headline: `Overall score ${scores?.overall ?? 'n/a'}. ${issues.length} issue(s) found.`,
    url: target?.url ?? target?.finalUrl,
    totalIssues: issues.length,
    bySeverity,
    byCategory,
  };
}

// ─── Privacy / redaction ──────────────────────────────────────────────────────

const SENSITIVE_KEYS = /(cookie|token|password|secret|auth|session|jwt|bearer|api[-_]?key)/i;

export function redactSensitiveData(value, depth = 0) {
  if (depth > 6) return '[redacted-depth]';
  if (value == null) return value;
  if (typeof value === 'string') {
    if (/Bearer\s+\S+/i.test(value)) return value.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => redactSensitiveData(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.test(k)) out[k] = '[redacted]';
      else out[k] = redactSensitiveData(v, depth + 1);
    }
    return out;
  }
  return value;
}

// ─── Snapshot store ───────────────────────────────────────────────────────────

const SNAPSHOT_TTL_MS = 60 * 60 * 1000;
const SNAPSHOT_MAX = 50;
const snapshotStore = new Map();

function pruneSnapshots() {
  const now = Date.now();
  for (const [id, snap] of snapshotStore) {
    if (now - snap.createdAt > SNAPSHOT_TTL_MS) snapshotStore.delete(id);
  }
  while (snapshotStore.size > SNAPSHOT_MAX) {
    const oldest = snapshotStore.keys().next().value;
    snapshotStore.delete(oldest);
  }
}

function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value ?? null)).digest('hex');
}

export function createAuditSnapshot(response) {
  pruneSnapshots();
  const id = `audit_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const compact = {
    url: response?.target?.url ?? response?.target?.finalUrl,
    scores: response?.scores ?? null,
    issues: response?.issues ?? [],
    seo: response?.seo ?? null,
    accessibility: response?.accessibility ?? null,
    technical: response?.technical ?? null,
    performance: response?.performance ?? null,
    structuredData: response?.structuredData ?? null,
  };
  const hashes = {
    scores: sha256(compact.scores),
    issues: sha256(compact.issues.map((it) => it.id)),
    seo: sha256(compact.seo),
    accessibility: sha256(compact.accessibility),
    technical: sha256(compact.technical),
  };
  snapshotStore.set(id, { id, createdAt: Date.now(), compact, hashes });
  return { auditSnapshotId: id, hashes };
}

export function getAuditSnapshot(id) {
  pruneSnapshots();
  return snapshotStore.get(id) ?? null;
}

export function compareAuditSnapshots(beforeId, afterId) {
  pruneSnapshots();
  const before = snapshotStore.get(beforeId);
  const after = snapshotStore.get(afterId);
  if (!before || !after) {
    return createErrorResponse('SNAPSHOT_NOT_FOUND', `Snapshot not found: ${before ? afterId : beforeId}`);
  }
  const scoreChanges = {};
  const beforeScores = before.compact.scores ?? {};
  const afterScores = after.compact.scores ?? {};
  const keys = new Set([...Object.keys(beforeScores), ...Object.keys(afterScores)]);
  for (const k of keys) {
    const b = beforeScores[k] ?? null;
    const a = afterScores[k] ?? null;
    scoreChanges[k] = { before: b, after: a, delta: (a ?? 0) - (b ?? 0) };
  }
  const beforeIds = new Set(before.compact.issues.map((it) => it.id));
  const afterIds = new Set(after.compact.issues.map((it) => it.id));
  const newIssues = after.compact.issues.filter((it) => !beforeIds.has(it.id));
  const resolvedIssues = before.compact.issues.filter((it) => !afterIds.has(it.id));
  const changedModules = [];
  for (const k of ['seo', 'accessibility', 'technical']) {
    if (before.hashes[k] !== after.hashes[k]) changedModules.push(k);
  }
  if (sha256(before.compact.performance) !== sha256(after.compact.performance)) changedModules.push('performance');
  if (sha256(before.compact.structuredData) !== sha256(after.compact.structuredData)) changedModules.push('structuredData');

  return {
    ok: true,
    schemaVersion: 'audit.compare.v1',
    timestamp: new Date().toISOString(),
    changed: newIssues.length > 0 || resolvedIssues.length > 0 || changedModules.length > 0,
    scoreChanges,
    newIssues,
    resolvedIssues,
    changedModules,
    meta: { tool: 'fileforge_audit_action', action: 'compare_audit_snapshots' },
  };
}

// ─── Module runners ───────────────────────────────────────────────────────────

function asArray(v) { return Array.isArray(v) ? v : []; }

function specFields(spec) {
  return (spec && spec !== true && Array.isArray(spec.fields)) ? spec.fields : null;
}

async function safeRpc(rpcClient, method, params) {
  try {
    const res = await rpcClient.send(method, params);
    if (res?.ok === false) return null;
    return res?.data ?? res ?? null;
  } catch { return null; }
}

export async function runPageAudit(ctx, spec) {
  const raw = ctx.raw ?? {};
  const data = {
    url: raw.url,
    finalUrl: raw.finalUrl ?? raw.url,
    title: raw.title ?? raw.metadata?.title,
    description: raw.metadata?.description,
    language: raw.metadata?.language ?? raw.language,
    domain: raw.url ? safeDomain(raw.url) : undefined,
    wordCount: raw.wordCount ?? raw.summary?.wordCount,
    headings: raw.headings,
    mainText: raw.mainText ?? raw.text,
    metadata: raw.metadata,
    canonical: raw.metadata?.canonical,
    viewport: raw.metadata?.viewport,
    statusCode: raw.statusCode ?? ctx.statusCode,
  };
  return { data: projectFields(data, specFields(spec)), issues: [] };
}

function safeDomain(url) {
  try { return new URL(url).hostname; } catch { return undefined; }
}

export async function runSeoAudit(ctx, spec) {
  const raw = ctx.raw ?? {};
  const md = raw.metadata ?? {};
  const headings = asArray(raw.headings);
  const images = asArray(raw.images);
  const imageAltMissing = images.filter((img) => !img.alt).length;
  const links = asArray(raw.links);
  const origin = ctx.origin;
  const internal = links.filter((l) => sameOrigin(l.absoluteUrl ?? l.href, origin));
  const external = links.filter((l) => !sameOrigin(l.absoluteUrl ?? l.href, origin));
  const h1 = headings.filter((h) => h.level === 1).map((h) => h.text);
  const h2 = headings.filter((h) => h.level === 2).map((h) => h.text);

  const data = {
    title: md.title,
    description: md.description,
    canonical: md.canonical,
    robots: md.robots,
    sitemap: md.sitemap,
    headings,
    h1, h2,
    openGraph: md.openGraph,
    twitterCard: md.twitterCard,
    imageAlt: { totalImages: images.length, missingAlt: imageAltMissing },
    internalLinks: internal.length,
    externalLinks: external.length,
    metadata: md,
    contentQuality: raw.contentQuality,
    indexability: { robots: md.robots, canonical: md.canonical, noindex: /noindex/i.test(md.robots ?? '') },
  };

  const issues = [];
  if (!md.title) issues.push(makeIssue({ category: 'seo', severity: 'high', title: 'Missing <title>', impact: 'Search results may use a fallback title.', fixSuggestion: { summary: 'Add a unique, descriptive <title> tag (50–60 chars).' }, evidence: { selector: 'head > title', currentValue: null, route: raw.url }, sourceTool: 'scrape' }));
  if (!md.description) issues.push(makeIssue({ category: 'seo', severity: 'medium', title: 'Missing meta description', description: 'The page does not have a meta description.', impact: 'Search result previews may be poor and click-through rate may drop.', fixSuggestion: { summary: 'Add a concise meta description between 120 and 160 characters.', example: '<meta name="description" content="Describe the page clearly here.">' }, evidence: { selector: 'head', currentValue: null, route: raw.url }, sourceTool: 'scrape' }));
  if (!md.canonical) issues.push(makeIssue({ category: 'seo', severity: 'low', title: 'Missing canonical URL', impact: 'Duplicate content risk across variants.', fixSuggestion: { summary: 'Add <link rel="canonical" href="..."> in <head>.' }, evidence: { selector: 'head', route: raw.url }, sourceTool: 'scrape' }));
  if (h1.length === 0) issues.push(makeIssue({ category: 'seo', severity: 'medium', title: 'No H1 heading on page', impact: 'Page hierarchy and topical signal are weakened.', fixSuggestion: { summary: 'Add exactly one descriptive H1.' }, evidence: { route: raw.url }, sourceTool: 'scrape' }));
  if (h1.length > 1) issues.push(makeIssue({ category: 'seo', severity: 'low', title: 'Multiple H1 headings', impact: 'Heading hierarchy is ambiguous.', evidence: { route: raw.url, currentValue: h1.length }, sourceTool: 'scrape' }));
  if (imageAltMissing > 0) issues.push(makeIssue({ category: 'seo', severity: 'medium', title: `${imageAltMissing} image(s) missing alt text`, impact: 'Hurts accessibility and image SEO.', fixSuggestion: { summary: 'Add descriptive alt text to all informative images.' }, evidence: { route: raw.url, currentValue: imageAltMissing }, sourceTool: 'scrape' }));

  return { data: projectFields(data, specFields(spec)), issues };
}

function sameOrigin(href, origin) {
  if (!href || !origin) return false;
  try { return new URL(href, origin).origin === origin; } catch { return false; }
}

export async function runAccessibilityAudit(ctx, spec) {
  const { rpcClient, raw } = ctx;
  const standard = (spec && spec !== true && spec.standard) || 'WCAG2AA';
  let a11y = null;
  if (rpcClient && ctx.tabId) {
    a11y = await safeRpc(rpcClient, 'a11y.audit', { tabId: ctx.tabId, standard });
  }
  const issues = [];
  const a11yIssues = asArray(a11y?.issues ?? a11y?.violations);
  for (const v of a11yIssues) {
    issues.push(makeIssue({
      category: 'accessibility',
      severity: v.severity ?? severityFromImpact(v.impact),
      title: v.title ?? v.help ?? v.id ?? 'Accessibility issue',
      description: v.description ?? v.help,
      evidence: { selector: v.selector ?? v.target?.[0], route: raw?.url, currentValue: v.html },
      impact: v.impact ?? v.summary,
      fixSuggestion: v.fixSuggestion ?? (v.helpUrl ? { summary: `See: ${v.helpUrl}` } : null),
      sourceTool: 'a11y',
      tags: v.tags ?? [],
    }));
  }
  const data = {
    standard,
    issues: a11yIssues,
    summary: a11y?.summary ?? { total: a11yIssues.length },
    keyboard: a11y?.keyboard,
    contrast: a11y?.contrast ?? a11y?.contrastIssues,
    landmarks: a11y?.landmarks,
    headings: a11y?.headings,
    forms: a11y?.forms,
    images: a11y?.images,
    aria: a11y?.aria,
    focus: a11y?.focus,
    snapshot: a11y?.snapshot,
  };
  return { data: projectFields(data, specFields(spec)), issues };
}

function severityFromImpact(impact) {
  switch ((impact ?? '').toLowerCase()) {
    case 'critical': return 'critical';
    case 'serious': return 'high';
    case 'moderate': return 'medium';
    case 'minor': return 'low';
    default: return 'medium';
  }
}

export async function runPerformanceAudit(ctx, spec) {
  const { rpcClient, raw } = ctx;
  let perf = null;
  if (rpcClient && ctx.tabId) {
    perf = await safeRpc(rpcClient, 'devtools.getPerformance', { tabId: ctx.tabId });
  }
  const network = ctx.network ?? {};
  const requests = asArray(network.requests);
  const transferSize = requests.reduce((sum, r) => sum + (r.response?.encodedDataLength ?? 0), 0);
  const largestAssets = requests
    .map((r) => ({ url: r.url, type: r.type, transferSize: r.response?.encodedDataLength ?? 0, status: r.response?.status }))
    .sort((a, b) => b.transferSize - a.transferSize)
    .slice(0, 10);
  const renderBlocking = requests.filter((r) => ['Script', 'Stylesheet'].includes(r.type) && !r.async && !r.defer).slice(0, 20);
  const thirdParty = thirdPartyScripts(requests, ctx.origin);

  const budget = (spec && spec !== true && spec.budget) || {};
  const issues = [];
  const totalKb = Math.round(transferSize / 1024);
  if (budget.maxTotalKb && totalKb > budget.maxTotalKb) {
    issues.push(makeIssue({ category: 'performance', severity: 'high', title: `Total transfer ${totalKb}KB exceeds budget ${budget.maxTotalKb}KB`, impact: 'Slow loads on mobile and poor LCP.', evidence: { route: raw?.url, currentValue: totalKb }, sourceTool: 'devtools' }));
  }
  if (budget.maxRequests && requests.length > budget.maxRequests) {
    issues.push(makeIssue({ category: 'performance', severity: 'medium', title: `${requests.length} requests exceeds budget ${budget.maxRequests}`, evidence: { route: raw?.url, currentValue: requests.length }, sourceTool: 'devtools' }));
  }
  const cwv = perf?.coreWebVitals ?? perf?.metrics ?? null;
  if (cwv?.LCP && cwv.LCP > 2500) issues.push(makeIssue({ category: 'performance', severity: cwv.LCP > 4000 ? 'high' : 'medium', title: `Slow LCP (${Math.round(cwv.LCP)}ms)`, impact: 'Users perceive the page as slow.', sourceTool: 'devtools', evidence: { route: raw?.url, currentValue: cwv.LCP } }));
  if (cwv?.CLS && cwv.CLS > 0.1) issues.push(makeIssue({ category: 'performance', severity: 'medium', title: `Layout shift (CLS ${cwv.CLS})`, sourceTool: 'devtools', evidence: { route: raw?.url, currentValue: cwv.CLS } }));

  const data = {
    coreWebVitals: cwv,
    lighthouseLikeScore: perf?.score,
    resourceSummary: { requestCount: requests.length, totalTransferSize: transferSize },
    largestAssets,
    renderBlocking: renderBlocking.map((r) => ({ url: r.url, type: r.type })),
    thirdPartyScripts: thirdParty,
    imageOptimization: imageOptInsights(requests),
    fontLoading: requests.filter((r) => r.type === 'Font').map((r) => ({ url: r.url, status: r.response?.status })),
    cacheHints: perf?.cacheHints,
    requestCount: requests.length,
    totalTransferSize: transferSize,
  };
  return { data: projectFields(data, specFields(spec)), issues };
}

function imageOptInsights(requests) {
  const imgs = requests.filter((r) => r.type === 'Image');
  const large = imgs.filter((r) => (r.response?.encodedDataLength ?? 0) > 200 * 1024);
  return { total: imgs.length, largeCount: large.length };
}

function thirdPartyScripts(requests, origin) {
  return requests.filter((r) => r.type === 'Script' && !sameOrigin(r.url, origin)).map((r) => r.url).slice(0, 30);
}

export async function runConversionAudit(ctx, spec) {
  const raw = ctx.raw ?? {};
  const conversion = raw.conversion ?? {};
  const links = asArray(raw.links);
  const ctas = links.filter((l) => /\b(sign\s*up|get\s*started|try|buy|install|add to|download|subscribe)\b/i.test(l.text ?? ''));
  const cwsCta = links.find((l) => /chrome\.google\.com\/webstore|chromewebstore\.google\.com/i.test(l.href ?? l.absoluteUrl ?? ''));
  const productType = (spec && spec !== true && spec.productType) || 'generic';

  const data = {
    hero: conversion.hero,
    valueProposition: conversion.valueProposition,
    primaryCta: ctas[0] ?? null,
    secondaryCta: ctas[1] ?? null,
    cta: ctas.slice(0, 10),
    ctaVisibility: { count: ctas.length, hasAboveFold: !!ctas[0]?.placement?.includes?.('hero') },
    pricing: raw.pricing,
    trustSignals: conversion.trustSignals,
    testimonials: conversion.testimonials,
    socialProof: conversion.socialProof,
    faq: conversion.faq,
    featureClarity: conversion.featureClarity,
    productClarity: conversion.productClarity,
    features: raw.products ?? conversion.features,
    comparison: conversion.comparison,
    demo: conversion.demo,
    screenshotsDemo: conversion.screenshotsDemo,
    chromeWebStoreCta: cwsCta ? { href: cwsCta.href ?? cwsCta.absoluteUrl, text: cwsCta.text } : null,
    privacyMessaging: conversion.privacyMessaging,
    objectionHandling: conversion.objectionHandling,
  };
  const issues = [];
  if (ctas.length === 0) issues.push(makeIssue({ category: 'conversion', severity: 'high', title: 'No clear call-to-action detected', impact: 'Visitors lack a next step.', sourceTool: 'scrape', evidence: { route: raw.url } }));
  if (productType === 'chrome_extension' && !cwsCta) issues.push(makeIssue({ category: 'conversion', severity: 'high', title: 'No Chrome Web Store CTA on extension landing', impact: 'Users cannot install the extension.', sourceTool: 'scrape', evidence: { route: raw.url } }));

  return { data: projectFields(data, specFields(spec)), issues };
}

export async function runVisualAudit(ctx, spec) {
  const { rpcClient } = ctx;
  const viewports = (spec && spec !== true && Array.isArray(spec.viewports)) ? spec.viewports : ['mobile', 'desktop'];
  const data = { screenshots: [], horizontalOverflow: [], tapTargets: [], layoutShiftRisks: [], modalBlockers: [], ctaVisibility: {} };
  const issues = [];
  if (rpcClient && ctx.tabId) {
    const overflow = await safeRpc(rpcClient, 'responsive.findOverflow', { tabId: ctx.tabId });
    data.horizontalOverflow = asArray(overflow?.overflow).slice(0, 30);
    if (data.horizontalOverflow.length > 0) {
      issues.push(makeIssue({ category: 'visual', severity: 'medium', title: 'Horizontal overflow detected', impact: 'Mobile users may see broken layout.', sourceTool: 'responsive', evidence: { route: ctx.raw?.url, currentValue: data.horizontalOverflow.length } }));
    }
    data.viewports = viewports;
  }
  return { data: projectFields(data, specFields(spec)), issues };
}

export async function runTechnicalAudit(ctx, spec) {
  const { rpcClient } = ctx;
  const network = ctx.network ?? {};
  const consoleData = ctx.consoleData ?? {};
  const requests = asArray(network.requests);
  const failed = requests.filter((r) => r.failed || (r.response?.status ?? 0) >= 400);
  const consoleErrors = asArray(consoleData.entries).filter((e) => e.level === 'error');
  const consoleWarnings = asArray(consoleData.entries).filter((e) => e.level === 'warning');

  let brokenImages = null;
  let brokenLinks = null;
  if (rpcClient && ctx.tabId) {
    brokenImages = await safeRpc(rpcClient, 'page.checkBrokenImages', { tabId: ctx.tabId });
    brokenLinks = await safeRpc(rpcClient, 'page.checkLinks', { tabId: ctx.tabId });
  }
  const data = {
    consoleErrors: consoleErrors.slice(0, 50),
    consoleWarnings: consoleWarnings.slice(0, 50),
    failedRequests: failed.map((r) => ({ url: r.url, status: r.response?.status, error: r.failed?.errorText })).slice(0, 100),
    brokenImages: asArray(brokenImages?.broken).slice(0, 100),
    brokenLinks: asArray(brokenLinks?.broken).slice(0, 100),
    statusCode: ctx.statusCode,
    redirectChain: ctx.raw?.redirectChain,
    mixedContent: requests.filter((r) => r.url?.startsWith('http://') && ctx.origin?.startsWith('https://')).map((r) => r.url),
    corsErrors: consoleErrors.filter((e) => /cors/i.test(e.text ?? '')).slice(0, 20),
    securityHeaders: ctx.raw?.securityHeaders,
    viewportMeta: ctx.raw?.metadata?.viewport,
    favicon: ctx.raw?.metadata?.favicon,
    manifest: ctx.raw?.metadata?.manifest,
    robotsTxt: ctx.raw?.robotsTxt,
    sitemapXml: ctx.raw?.sitemapXml,
  };
  const issues = [];
  for (const e of consoleErrors.slice(0, 20)) {
    issues.push(makeIssue({ category: 'technical', severity: 'high', title: 'Console error', description: String(e.text ?? '').slice(0, 240), evidence: { route: ctx.raw?.url, currentValue: e.text }, sourceTool: 'devtools' }));
  }
  for (const f of failed.slice(0, 20)) {
    issues.push(makeIssue({ category: 'technical', severity: (f.response?.status ?? 0) >= 500 ? 'high' : 'medium', title: `Failed request ${f.response?.status ?? ''}`, evidence: { route: ctx.raw?.url, currentValue: f.url }, sourceTool: 'devtools' }));
  }
  for (const b of (data.brokenImages).slice(0, 20)) {
    issues.push(makeIssue({ category: 'technical', severity: 'medium', title: 'Broken image', evidence: { route: ctx.raw?.url, currentValue: b.url ?? b.src ?? b }, sourceTool: 'page' }));
  }
  for (const b of (data.brokenLinks).slice(0, 20)) {
    issues.push(makeIssue({ category: 'technical', severity: 'medium', title: 'Broken link', evidence: { route: ctx.raw?.url, currentValue: b.href ?? b.url ?? b }, sourceTool: 'page' }));
  }
  if (data.mixedContent.length > 0) {
    issues.push(makeIssue({ category: 'technical', severity: 'high', title: 'Mixed content (HTTP on HTTPS page)', impact: 'Browsers may block these resources.', evidence: { route: ctx.raw?.url, currentValue: data.mixedContent.length }, sourceTool: 'devtools' }));
  }
  return { data: projectFields(data, specFields(spec)), issues };
}

export async function runPrivacyTrustAudit(ctx, spec) {
  const raw = ctx.raw ?? {};
  const links = asArray(raw.links);
  const text = (raw.mainText ?? '').toLowerCase();
  const privacy = links.find((l) => /privacy/i.test(l.text ?? l.href ?? ''));
  const terms = links.find((l) => /terms|tos\b/i.test(l.text ?? l.href ?? ''));
  const contact = links.find((l) => /contact|support/i.test(l.text ?? l.href ?? ''));
  const data = {
    privacyPolicy: privacy ? { href: privacy.href ?? privacy.absoluteUrl, text: privacy.text } : null,
    terms: terms ? { href: terms.href ?? terms.absoluteUrl, text: terms.text } : null,
    contactInfo: contact ? { href: contact.href ?? contact.absoluteUrl, text: contact.text } : (asArray(raw.contacts?.emails)[0] ?? null),
    dataCollectionStatement: /collect|tracking|cookies|analytics/.test(text),
    cookieNotice: /cookie/.test(text),
    permissionsExplanation: /permission/.test(text),
    pricingTransparency: !!raw.pricing,
    refundInfo: /refund|money[- ]back/.test(text),
    supportInfo: !!contact,
    businessIdentity: raw.metadata?.author ?? raw.metadata?.publisher,
    legalLinks: [privacy, terms].filter(Boolean).map((l) => l.href ?? l.absoluteUrl),
  };
  const issues = [];
  if (!privacy) issues.push(makeIssue({ category: 'privacyTrust', severity: 'high', title: 'No privacy policy link found', impact: 'Required for trust and platform policies.', sourceTool: 'scrape', evidence: { route: raw.url } }));
  if (!terms) issues.push(makeIssue({ category: 'privacyTrust', severity: 'medium', title: 'No terms of service link found', sourceTool: 'scrape', evidence: { route: raw.url } }));
  if (!contact && !data.contactInfo) issues.push(makeIssue({ category: 'privacyTrust', severity: 'low', title: 'No contact info found', sourceTool: 'scrape', evidence: { route: raw.url } }));
  return { data: projectFields(data, specFields(spec)), issues };
}

export async function runStructuredDataAudit(ctx, spec) {
  const raw = ctx.raw ?? {};
  const jsonLd = asArray(raw.jsonLd);
  const schemaTypes = [...new Set(jsonLd.map((j) => j.schemaType ?? j.type).filter(Boolean))];
  const data = {
    jsonLd,
    schemaTypes,
    softwareApplicationSchema: jsonLd.find((j) => /SoftwareApplication/i.test(j.schemaType ?? j.type ?? '')) ?? null,
    productSchema: jsonLd.find((j) => /Product/i.test(j.schemaType ?? j.type ?? '')) ?? null,
    faqSchema: jsonLd.find((j) => /FAQ/i.test(j.schemaType ?? j.type ?? '')) ?? null,
    breadcrumbSchema: jsonLd.find((j) => /Breadcrumb/i.test(j.schemaType ?? j.type ?? '')) ?? null,
    organizationSchema: jsonLd.find((j) => /Organization/i.test(j.schemaType ?? j.type ?? '')) ?? null,
    invalidSchema: jsonLd.filter((j) => j.valid === false),
    schemaWarnings: jsonLd.flatMap((j) => asArray(j.warnings)),
    contentMismatch: detectContentMismatch(jsonLd, raw),
  };
  const issues = [];
  for (const inv of data.invalidSchema) {
    issues.push(makeIssue({ category: 'structuredData', severity: 'medium', title: 'Invalid JSON-LD schema', evidence: { route: raw.url, currentValue: inv.schemaType ?? inv.type }, sourceTool: 'scrape' }));
  }
  if (data.contentMismatch?.length) {
    issues.push(makeIssue({ id: 'schema-content-mismatch', category: 'structuredData', severity: 'high', title: 'Fix mismatched JSON-LD schema', impact: 'Visible page content does not match structured data.', sourceTool: 'scrape', evidence: { route: raw.url, currentValue: data.contentMismatch } }));
  }
  return { data: projectFields(data, specFields(spec)), issues };
}

function detectContentMismatch(jsonLd, raw) {
  const out = [];
  const title = (raw.metadata?.title ?? raw.title ?? '').toLowerCase();
  for (const j of jsonLd) {
    const name = (j.name ?? '').toLowerCase();
    if (name && title && !title.includes(name) && !name.includes(title.split(/\s+/)[0] ?? '')) {
      out.push({ schemaType: j.schemaType ?? j.type, schemaName: j.name, pageTitle: raw.metadata?.title ?? raw.title });
    }
  }
  return out;
}

export async function runCrawlAudit(ctx, spec) {
  const { rpcClient, target } = ctx;
  if (!spec || spec === true || !spec.enabled) return { data: { enabled: false }, issues: [] };
  const maxPages = Math.min(spec.maxPages ?? LIMITS.crawl.default, LIMITS.crawl.max);
  if (!rpcClient || !target?.url) return { data: { enabled: true, pages: [] }, issues: [] };
  const res = await safeRpc(rpcClient, 'scrape.crawlSite', {
    url: target.url,
    maxPages,
    sections: ['metadata', 'pageLinks'],
    sameOriginOnly: spec.sameOriginOnly !== false,
    includePatterns: spec.includePatterns,
    excludePatterns: spec.excludePatterns,
    maxDepth: spec.maxDepth,
  });
  const pages = asArray(res?.pages ?? res?.results);
  return { data: { enabled: true, maxPages, pageCount: pages.length, pages: pages.map((p) => ({ url: p.url, title: p.title, status: p.statusCode })) }, issues: [] };
}

// ─── Orchestration ────────────────────────────────────────────────────────────

const MODULE_RUNNERS = {
  page: runPageAudit,
  seo: runSeoAudit,
  accessibility: runAccessibilityAudit,
  performance: runPerformanceAudit,
  conversion: runConversionAudit,
  visual: runVisualAudit,
  technical: runTechnicalAudit,
  privacyTrust: runPrivacyTrustAudit,
  structuredData: runStructuredDataAudit,
  crawl: runCrawlAudit,
};

export async function runAuditModules(query, ctx) {
  const result = {};
  const allIssues = [];
  const issuesByCategory = {};
  for (const cat of SCORE_CATEGORIES) issuesByCategory[cat] = [];

  for (const moduleName of Object.keys(MODULE_RUNNERS)) {
    if (!query[moduleName]) continue;
    const runner = MODULE_RUNNERS[moduleName];
    const out = await runner(ctx, query[moduleName]);
    result[moduleName] = out.data;
    for (const issue of out.issues ?? []) {
      allIssues.push(issue);
      if (issuesByCategory[issue.category]) issuesByCategory[issue.category].push(issue);
    }
  }
  return { modules: result, issues: normalizeIssues(allIssues), issuesByCategory };
}

// ─── Data collection from RPC ─────────────────────────────────────────────────

async function collectRawData(rpcClient, target, tabId) {
  const sections = ['metadata', 'pageLinks', 'links', 'images', 'tables', 'structuredData', 'contacts'];
  let raw = null;
  if (target.type === 'url') {
    const res = await safeRpc(rpcClient, 'scrape.urls', { urls: [target.url], sections, closeTabs: false });
    raw = (res?.results ?? [])[0] ?? null;
    tabId = res?.results?.[0]?.tabId ?? tabId;
  } else if (target.type === 'active_tab') {
    raw = await safeRpc(rpcClient, 'scrape.page', { tabId: tabId ?? target.tabId ?? 'active', sections });
  }
  return { raw, tabId };
}

async function collectInstrumentation(rpcClient, tabId) {
  if (!rpcClient || !tabId) return { network: null, consoleData: null };
  const network = await safeRpc(rpcClient, 'devtools.getNetwork', { tabId });
  const consoleData = await safeRpc(rpcClient, 'devtools.getConsole', { tabId });
  return { network, consoleData };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function handleQueryAudit(p, { rpcClient } = {}) {
  const targetRes = resolveAuditTarget(p.target);
  if (targetRes.error) return targetRes.error;
  const target = targetRes.target;

  const queryRes = resolveAuditQuery({ preset: p.preset, query: p.query });
  if (queryRes.error) return queryRes.error;
  const query = queryRes.query;

  const validation = validateAuditQuery(query);
  if (validation) return validation;

  const auditId = `audit_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  let raw = null;
  let tabId = p.tabId ?? target.tabId;
  let network = null;
  let consoleData = null;
  let origin;

  try {
    if (rpcClient) {
      const collected = await collectRawData(rpcClient, target, tabId);
      raw = collected.raw;
      tabId = collected.tabId;
      const instr = await collectInstrumentation(rpcClient, tabId);
      network = instr.network;
      consoleData = instr.consoleData;
    }
  } catch (err) {
    return createErrorResponse('AUDIT_FAILED', err.message ?? 'Audit data collection failed');
  }

  if (raw?.url) {
    try { origin = new URL(raw.url).origin; } catch { /* noop */ }
  } else if (target.url) {
    try { origin = new URL(target.url).origin; } catch { /* noop */ }
  }

  const ctx = {
    rpcClient,
    target,
    tabId,
    raw: raw ?? { url: target.url },
    network,
    consoleData,
    origin,
    statusCode: raw?.statusCode,
  };

  const { modules, issues, issuesByCategory } = await runAuditModules(query, ctx);

  const filteredIssues = query.issues ? applyIssueFilters(issues, query.issues === true ? {} : query.issues) : issues;

  let scores;
  let grades;
  if (query.scores) {
    const allScores = scoreAudit(issuesByCategory);
    const includeList = (query.scores !== true && Array.isArray(query.scores.include)) ? query.scores.include : null;
    if (includeList) {
      scores = {};
      for (const k of includeList) scores[k] = allScores[k];
    } else {
      scores = allScores;
    }
    grades = buildGrades(scores);
  }

  let roadmap;
  if (query.roadmap) roadmap = buildRoadmap(filteredIssues.length ? filteredIssues : issues, query.roadmap);

  let summary;
  if (query.summary) summary = buildAuditSummary({ scores, issues: filteredIssues, target: { ...target, url: raw?.url ?? target.url } });

  const responseCore = {
    schemaVersion: 'audit.query.v1',
    auditId,
    target: {
      type: target.type,
      url: raw?.url ?? target.url,
      finalUrl: raw?.finalUrl ?? raw?.url,
      title: raw?.title ?? raw?.metadata?.title,
    },
    scores,
    grades,
    ...modules,
    issues: query.issues ? filteredIssues : undefined,
    roadmap,
    summary,
  };

  if (query.report) {
    responseCore.report = buildReport(query.report, {
      target: responseCore.target,
      scores,
      grades,
      issues: filteredIssues,
      roadmap,
      summary,
    });
  }

  if (query.snapshot) {
    const snap = createAuditSnapshot(responseCore);
    responseCore.snapshot = snap;
  }

  for (const k of Object.keys(responseCore)) {
    if (responseCore[k] === undefined) delete responseCore[k];
  }

  responseCore.timestamp = new Date().toISOString();
  return createSuccessResponse({ ...responseCore, meta: { action: 'query_audit', auditId, url: responseCore.target.url } });
}

export async function handleCompareAuditSnapshots(p) {
  if (!p.beforeSnapshotId || !p.afterSnapshotId) {
    return createErrorResponse('INVALID_FIELD', 'beforeSnapshotId and afterSnapshotId are required');
  }
  return compareAuditSnapshots(p.beforeSnapshotId, p.afterSnapshotId);
}
