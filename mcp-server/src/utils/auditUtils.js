import { createIssue, summarizeIssues } from './issueUtils.js';
import { looksSensitive, redactValue, redactedFinding, revealScopedValue } from './privacyUtils.js';

const MONEY_RE = /(?:\$|USD\s*)\d+(?:\.\d{2})?\s*(?:\/\s*(?:mo|month|yr|year)|\s*(?:per\s+)?(?:month|year|yr|mo))?/gi;
const COUNT_RE = /\b\d+\s*\+?\s+(?:free\s+)?(?:tools|features|templates|routes|pages|videos)\b/gi;
const SUBSCRIPTION_RE = /\b(?:one[-\s]?time|lifetime|monthly|yearly|annual|subscription|recurring|refund|trial|free plan|pro plan)\b/gi;
const PRODUCT_RE = /\b(?:chrome extension|browser extension|web app|desktop app|karaoke maker|video toolbar|downloader|converter|recorder)\b/gi;

export function textOfPage(page = {}) {
  return [
    page.text?.text,
    page.text,
    page.visibleText,
    page.metadata?.title,
    page.metadata?.description,
    ...(page.headings ?? []).map((heading) => heading.text),
  ].filter(Boolean).join('\n');
}

function evidence(url, text, extra = {}) {
  return { url, text: String(text).slice(0, 400), ...extra };
}

export function extractClaims(page = {}) {
  const text = textOfPage(page);
  const url = page.url;
  const claims = [];
  for (const pattern of [
    ['pricing', MONEY_RE],
    ['count', COUNT_RE],
    ['subscription', SUBSCRIPTION_RE],
    ['product', PRODUCT_RE],
  ]) {
    const [type, regex] = pattern;
    for (const match of text.matchAll(regex)) {
      claims.push({ type, value: match[0].trim(), normalized: match[0].trim().toLowerCase(), url });
    }
  }
  return claims;
}

function conflictIssue({ type, title, impact, claims, severity = 'medium', suggestedFix }) {
  return createIssue({
    type,
    dimension: 'content',
    severity,
    confidence: 0.78,
    title,
    impact,
    evidence: claims.map((claim) => evidence(claim.url, claim.value)),
    suggestedFix,
  });
}

export function auditContentConsistency(pages = []) {
  const claims = pages.flatMap(extractClaims);
  const issues = [];
  const grouped = claims.reduce((map, claim) => {
    const values = map.get(claim.type) ?? new Map();
    const list = values.get(claim.normalized) ?? [];
    list.push(claim);
    values.set(claim.normalized, list);
    map.set(claim.type, values);
    return map;
  }, new Map());

  const subscriptionValues = grouped.get('subscription') ?? new Map();
  const subscriptionText = Array.from(subscriptionValues.keys()).join(' ');
  if (/\bone[-\s]?time|lifetime\b/.test(subscriptionText) && /\bmonthly|yearly|annual|subscription|recurring\b/.test(subscriptionText)) {
    issues.push(conflictIssue({
      type: 'content.pricing-model-conflict',
      title: 'Pricing model appears inconsistent across pages',
      impact: 'Users may misunderstand whether the product is a subscription, one-time purchase, or lifetime offer.',
      claims: Array.from(subscriptionValues.values()).flat(),
      severity: 'high',
      suggestedFix: 'Use one pricing model description everywhere and clarify exceptions such as trials, lifetime legacy plans, or refunds.',
    }));
  }

  const countValues = grouped.get('count') ?? new Map();
  if (countValues.size > 1) {
    issues.push(conflictIssue({
      type: 'content.feature-count-clarity',
      title: 'Feature or tool counts vary across pages',
      impact: 'Different counts can make the product feel stale or misleading unless the relationship is explained.',
      claims: Array.from(countValues.values()).flat(),
      severity: 'medium',
      suggestedFix: 'Clarify the taxonomy, such as “30+ free tools, 50+ total tools with Pro,” and reuse it consistently.',
    }));
  }

  const productValues = grouped.get('product') ?? new Map();
  if (productValues.size > 1) {
    issues.push(conflictIssue({
      type: 'content.product-identity-drift',
      title: 'Product identity language drifts across pages',
      impact: 'Conflicting product descriptions can weaken trust, SEO relevance, and extension policy clarity.',
      claims: Array.from(productValues.values()).flat(),
      severity: 'medium',
      suggestedFix: 'Pick a primary product category and make alternate use cases subordinate rather than contradictory.',
    }));
  }

  return { claims, issues, summary: summarizeIssues(issues, { pages: pages.length, claims: claims.length }) };
}

export function auditPolicyRisk(pages = [], { manifest, listingCopy } = {}) {
  const textPages = [
    ...pages.map((page) => ({ url: page.url, text: textOfPage(page) })),
    listingCopy ? { url: 'chrome-web-store-listing', text: listingCopy } : null,
    manifest ? { url: 'manifest', text: JSON.stringify(manifest) } : null,
  ].filter(Boolean);
  const patterns = [
    ['policy.platform-download-claim', /\b(?:download|save|rip)\s+(?:youtube|netflix|spotify|instagram|tiktok|facebook)\b/i, 'Claims about downloading restricted platform media may create Chrome Web Store policy risk.', 'Reword to focus on permitted user-owned media and avoid implying bypass of platform rules.'],
    ['policy.bypass-claim', /\b(?:bypass|unlock|circumvent|remove drm|no restrictions|works everywhere)\b/i, 'Bypass or unrestricted-use language can be interpreted as encouraging prohibited behavior.', 'Use precise capability language and name supported, policy-safe contexts.'],
    ['policy.permission-clarity', /\b(?:all websites|read and change|full access|permissions?)\b/i, 'Broad permission language needs clear user benefit and data-use explanation.', 'Explain why each permission is needed and what data is not collected.'],
    ['policy.privacy-mismatch', /\b(?:collect|track|analytics|personal data|cookies|sell data)\b/i, 'Privacy and tracking claims should match the privacy policy and manifest behavior.', 'Align site, listing, privacy policy, and manifest descriptions.'],
  ];
  const issues = [];
  const claims = [];
  for (const page of textPages) {
    for (const [type, regex, impact, suggestedFix] of patterns) {
      const match = page.text.match(regex);
      if (!match) continue;
      claims.push({ type, value: match[0], url: page.url, impact });
      issues.push(createIssue({
        type,
        dimension: 'policy',
        severity: type.includes('download') || type.includes('bypass') ? 'high' : 'medium',
        confidence: 0.76,
        title: 'Potential Chrome extension policy risk',
        impact,
        evidence: [evidence(page.url, match[0], { policyCategory: type })],
        suggestedFix,
      }));
    }
  }
  return { claims, issues, summary: summarizeIssues(issues, { pages: pages.length, claims: claims.length }) };
}

export function auditClientSecurity(storage = {}, { url } = {}) {
  const entries = [];
  for (const namespace of ['localStorage', 'sessionStorage']) {
    for (const [key, value] of Object.entries(storage?.[namespace] ?? {})) {
      entries.push({ namespace, key, value: String(value ?? '') });
    }
  }
  const patterns = [
    ['security.client-license-flag', /\b(?:pro|premium|paid|license|entitlement|subscription|plan)\b/i, 'medium', 'Client-side license or Pro flags can be tampered with if trusted by backend logic.', 'Treat client flags as display hints only and verify entitlements on the server.'],
    ['security.exposed-secret', /(?:api[_-]?key|apiKey|secret|token|jwt|bearer|private[_-]?key|privateKey)/i, 'high', 'Secrets or token-like values exposed to browser storage can be copied by users or extensions.', 'Move secrets server-side, rotate exposed credentials, and redact them from client-accessible storage.'],
    ['security.debug-flag', /(?:debug|devtools|test|staging|mock|fake)/i, 'low', 'Debug flags can reveal non-production behavior or accidentally unlock test states.', 'Remove production debug flags or ensure they cannot affect privileged behavior.'],
  ];
  const issues = [];
  const sensitiveFindings = [];
  for (const entry of entries) {
    const haystack = `${entry.key} ${entry.value}`;
    if (looksSensitive(entry.key, entry.value)) {
      sensitiveFindings.push(redactedFinding({ ...entry, url }));
    }
    for (const [type, regex, severity, impact, suggestedFix] of patterns) {
      if (!regex.test(haystack)) continue;
      issues.push(createIssue({
        type,
        dimension: 'security',
        severity,
        confidence: 0.74,
        title: type === 'security.exposed-secret' ? 'Potential secret exposed in client storage' : 'Sensitive client-side state detected',
        impact,
        evidence: [{
          url,
          selector: entry.namespace,
          text: `${entry.key}: ${redactValue(entry.value)}`,
          raw: { namespace: entry.namespace, key: entry.key, location: `${entry.namespace}.${entry.key}`, canReveal: true },
        }],
        suggestedFix,
      }));
    }
  }
  return {
    status: 'complete',
    entries: entries.map(({ namespace, key, value }) => ({ namespace, key, value: redactValue(value), location: `${namespace}.${key}`, canReveal: looksSensitive(key, value) })),
    sensitiveFindings,
    issues,
    summary: summarizeIssues(issues, { storageEntries: entries.length, sensitiveFindings: sensitiveFindings.length }),
  };
}

export function revealClientSecurityValue(storage = {}, request = {}) {
  const entries = [];
  for (const namespace of ['localStorage', 'sessionStorage']) {
    for (const [key, value] of Object.entries(storage?.[namespace] ?? {})) {
      if (looksSensitive(key, value)) entries.push({ namespace, key, value: String(value ?? ''), location: `${namespace}.${key}` });
    }
  }
  return revealScopedValue(entries, request);
}

export function rankRecommendations(issues = [], { projectType = 'generic' } = {}) {
  const severityWeight = { critical: 100, high: 70, medium: 40, low: 15, info: 5 };
  const dimensionWeight = { policy: 18, security: 18, reliability: 16, conversion: 14, accessibility: 12, performance: 10, seo: 10, content: 9, visual: 8, developer: 7 };
  const grouped = new Map();
  for (const issue of issues) {
    const key = `${issue.type}:${issue.title}:${issue.suggestedFix}`;
    const current = grouped.get(key) ?? { ...issue, evidence: [], affectedPages: new Set(), count: 0 };
    current.count += 1;
    for (const item of issue.evidence ?? []) {
      current.evidence.push(item);
      if (item.url) current.affectedPages.add(item.url);
    }
    grouped.set(key, current);
  }
  return Array.from(grouped.values())
    .map((issue) => {
      const affectedPages = Array.from(issue.affectedPages);
      const score = (severityWeight[issue.severity] ?? 0)
        + (dimensionWeight[issue.dimension] ?? 0)
        + Math.min(20, affectedPages.length * 3)
        + Math.round((issue.confidence ?? 0.5) * 10)
        + (projectType === 'chrome-extension' && ['policy', 'security'].includes(issue.dimension) ? 12 : 0);
      return {
        id: issue.id,
        type: issue.type,
        severity: issue.severity,
        dimension: issue.dimension,
        score,
        problem: issue.title,
        impact: issue.impact,
        fix: issue.suggestedFix,
        pagesAffected: affectedPages,
        evidence: issue.evidence.slice(0, 10),
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function summarizeForMode(data = {}, mode = 'short') {
  if (mode === 'json-only') return data;
  const issues = data.issues ?? [];
  const priority = {
    developer: ['developer', 'reliability', 'performance', 'security'],
    seo: ['seo', 'content', 'reliability'],
    compliance: ['policy', 'security', 'content'],
    conversion: ['conversion', 'content', 'visual', 'performance'],
  }[mode];
  const selected = priority ? issues.filter((issue) => priority.includes(issue.dimension)) : issues;
  return {
    summaryMode: mode,
    ok: data.ok ?? !selected.some((issue) => ['critical', 'high'].includes(issue.severity)),
    totals: data.summary?.counts ?? data.summary ?? { issues: selected.length },
    topIssues: selected.slice(0, mode === 'detailed' ? 25 : 10),
  };
}

export function compareAuditRuns(before = {}, after = {}) {
  const beforeIssues = before.issues ?? before.data?.issues ?? [];
  const afterIssues = after.issues ?? after.data?.issues ?? [];
  const beforeIds = new Set(beforeIssues.map((issue) => issue.id));
  const afterIds = new Set(afterIssues.map((issue) => issue.id));
  const addedIssues = afterIssues.filter((issue) => !beforeIds.has(issue.id));
  const resolvedIssues = beforeIssues.filter((issue) => !afterIds.has(issue.id));
  return {
    beforeRef: before.ref,
    afterRef: after.ref,
    summary: {
      beforeIssues: beforeIssues.length,
      afterIssues: afterIssues.length,
      addedIssues: addedIssues.length,
      resolvedIssues: resolvedIssues.length,
    },
    addedIssues,
    resolvedIssues,
    performance: {
      before: before.summary?.totalTransferBytes ?? before.data?.summary?.totalTransferBytes,
      after: after.summary?.totalTransferBytes ?? after.data?.summary?.totalTransferBytes,
    },
  };
}
