import { createIssue, summarizeIssues } from './issueUtils.js';
import { normalizeUrl, resolveUrl } from './urlUtils.js';

function canonical(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function classifyLink(href, baseUrl) {
  if (!href) return { kind: 'empty' };
  if (/^(mailto|tel):/i.test(href)) return { kind: href.split(':')[0].toLowerCase(), href };
  if (href.startsWith('#')) return { kind: 'hash', href };
  try {
    const url = resolveUrl(href, baseUrl);
    const base = new URL(baseUrl);
    const parsed = new URL(url);
    const asset = /\.(?:png|jpe?g|webp|gif|svg|css|js|pdf|zip|mp4|webm|ico)$/i.test(parsed.pathname);
    return { kind: asset ? 'asset' : parsed.origin === base.origin ? 'internal' : 'external', href: url };
  } catch {
    return { kind: 'invalid', href };
  }
}

export function discoverRoutesFromPages(pages = [], baseUrl) {
  const routes = new Set([normalizeUrl(baseUrl)]);
  const links = [];
  for (const page of pages) {
    for (const link of [...(page.pageLinks ?? []), ...(page.links ?? [])]) {
      const href = typeof link === 'string' ? link : link.href ?? link.url;
      const classified = classifyLink(href, page.url ?? baseUrl);
      links.push({ sourceUrl: page.url, text: link.text, ...classified });
      if (classified.kind === 'internal') {
        const route = canonical(classified.href);
        if (route) routes.add(route);
      }
    }
  }
  return { routes: Array.from(routes), links };
}

export function summarizeRouteChecks({ baseUrl, pages = [], checks = [], links = [] }) {
  const issues = [];
  const statusByUrl = new Map(checks.map((check) => [canonical(check.url) ?? check.url, check]));
  for (const check of checks) {
    const status = check.status ?? check.response?.status ?? check.route?.status;
    if (status >= 400 || check.error) {
      issues.push(createIssue({
        type: status >= 500 ? 'route.server-error' : 'route.broken',
        dimension: 'reliability',
        severity: status >= 500 ? 'high' : 'medium',
        confidence: 0.9,
        title: status ? `Route returned ${status}` : 'Route failed to load',
        impact: 'Broken routes and server errors block users and search crawlers.',
        evidence: [{ url: check.url, status, text: check.error }],
        suggestedFix: 'Fix the route, redirect it intentionally, or remove links that point to it.',
      }));
    }
    if ((check.redirects ?? 0) > 1) {
      issues.push(createIssue({
        type: 'route.redirect-chain',
        dimension: 'seo',
        severity: 'medium',
        confidence: 0.75,
        title: 'Route has a redirect chain',
        impact: 'Redirect chains slow navigation and dilute crawl efficiency.',
        evidence: [{ url: check.url, text: `${check.redirects} redirects`, raw: check }],
        suggestedFix: 'Point internal links directly to the final canonical destination.',
      }));
    }
  }

  for (const link of links) {
    if (link.kind === 'invalid') {
      issues.push(createIssue({
        type: 'route.invalid-link',
        dimension: 'reliability',
        severity: 'medium',
        confidence: 0.86,
        title: 'Invalid link URL found',
        impact: 'Malformed links cannot be followed by users, crawlers, or automation.',
        evidence: [{ url: link.sourceUrl, text: link.href }],
        suggestedFix: 'Replace the malformed URL with a valid absolute or relative URL.',
      }));
    }
    if (link.kind === 'internal' && !statusByUrl.has(canonical(link.href))) {
      issues.push(createIssue({
        type: 'route.link-not-checked',
        dimension: 'seo',
        severity: 'info',
        confidence: 0.6,
        title: 'Internal link was discovered but not checked',
        impact: 'Unverified routes can hide broken pages outside the crawl limit.',
        evidence: [{ url: link.sourceUrl, text: link.href }],
        suggestedFix: 'Increase the crawl limit or include the route explicitly.',
      }));
    }
  }

  const metadata = pages.map((page) => ({ url: page.url, title: page.metadata?.title, description: page.metadata?.description, canonical: page.metadata?.canonical }));
  const duplicateTitles = Object.entries(metadata.reduce((map, item) => {
    if (!item.title) return map;
    map[item.title] = [...(map[item.title] ?? []), item.url];
    return map;
  }, {})).filter(([, urls]) => urls.length > 1);
  for (const [title, urls] of duplicateTitles) {
    issues.push(createIssue({
      type: 'seo.duplicate-title',
      dimension: 'seo',
      severity: 'medium',
      confidence: 0.82,
      title: 'Duplicate meta title found',
      impact: 'Duplicate titles make search results less distinct and can weaken route relevance.',
      evidence: urls.map((url) => ({ url, text: title })),
      suggestedFix: 'Write a unique, route-specific title for each page.',
    }));
  }

  const summary = {
    liveRoutes: checks.filter((check) => (check.status ?? 200) < 400 && !check.error).length,
    brokenLinks: issues.filter((issue) => issue.type === 'route.broken').length,
    redirectChains: issues.filter((issue) => issue.type === 'route.redirect-chain').length,
    orphanPages: 0,
    duplicateMetaTitles: duplicateTitles.length,
    missingCanonical: metadata.filter((item) => !item.canonical).length,
    linksByKind: links.reduce((counts, link) => ({ ...counts, [link.kind]: (counts[link.kind] ?? 0) + 1 }), {}),
  };
  return { baseUrl, checks, links, metadata, issues, summary: { ...summary, issueSummary: summarizeIssues(issues, summary) } };
}
