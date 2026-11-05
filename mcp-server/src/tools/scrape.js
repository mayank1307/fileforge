import { createHash, randomUUID } from 'node:crypto';
import { registry } from '../registry.js';
import { maybeStoreResult, summarizeData } from '../utils/resultUtils.js';

const SECTIONS = ['files', 'images', 'links', 'pageLinks', 'emails', 'phones', 'tables',
  'videos', 'colors', 'addresses', 'locations', 'fonts', 'lists', 'icons',
  'qrCodes', 'structuredData', 'network', 'metadata', 'assets', 'contacts', 'designTokens', 'dataUris'];

// ─── Action aliases ───────────────────────────────────────────────────────────

const ACTION_ALIASES = {
  // RPC-style dotted names → MCP action names
  'scrape.page': 'scrape_page',
  'scrape.assets': 'extract_assets',
  'scrape.tables': 'query_scrape_tables_alias',
  'scrape.links': 'query_scrape_links_alias',
  'scrape.contacts': 'extract_contacts',
  'scrape.metadata': 'extract_metadata',
  'scrape.designTokens': 'extract_design_tokens',
  'scrape.tabs': 'scrape_tabs',
  'scrape.urls': 'scrape_urls',
  'scrape.crawlSite': 'crawl_site',
  'scrape.analyzeSite': 'analyze_site',
  'scrape.extractResource': 'extract_resource',
  // GraphQL-style entrypoint
  'scrape.query': 'query_scrape',
  'query': 'query_scrape',
  'page': 'query_scrape_page_alias',
  'links': 'query_scrape_links_alias',
  'tables': 'query_scrape_tables_alias',
  'scrape.compareSnapshots': 'compare_scrape_snapshots',
  'compareSnapshots': 'compare_scrape_snapshots',
};

export function normalizeActionName(action) {
  return ACTION_ALIASES[action] ?? action;
}

// ─── Limits ───────────────────────────────────────────────────────────────────

const LIMITS = {
  maxTextChars: { default: 12000, max: 50000 },
  links: { default: 100, max: 1000 },
  images: { default: 100, max: 1000 },
  tables: { default: 20, max: 100 },
  rowsPerTable: { default: 100, max: 1000 },
  sections: { default: 40, max: 100 },
  headings: { default: 200, max: 1000 },
  jsonLd: { default: 50, max: 500 },
};

// ─── Field allowlists ─────────────────────────────────────────────────────────

const FIELDS = {
  page: ['title', 'description', 'mainText', 'markdown', 'html', 'wordCount', 'language', 'domain', 'url', 'canonical'],
  metadata: ['title', 'description', 'canonical', 'robots', 'viewport', 'charset', 'language', 'favicon', 'themeColor', 'openGraph', 'twitterCard', 'alternates', 'manifest', 'author', 'publisher'],
  headings: ['level', 'text', 'selector', 'order'],
  sections: ['heading', 'text', 'links', 'images', 'ctaButtons', 'selector', 'order', 'wordCount'],
  links: ['selector', 'text', 'href', 'absoluteUrl', 'external', 'visible', 'target', 'rel', 'type', 'placement', 'intent', 'hasText', 'accessibleName'],
  images: ['selector', 'src', 'absoluteUrl', 'alt', 'title', 'width', 'height', 'naturalWidth', 'naturalHeight', 'loading', 'visible', 'type', 'placement'],
  assets: ['scripts', 'stylesheets', 'fonts', 'favicons', 'preloads', 'videos'],
  tables: ['selector', 'caption', 'headers', 'rows', 'rowCount', 'columnCount', 'markdown', 'csv'],
  jsonLd: ['raw', 'type', 'id', 'name', 'description', 'url', 'schemaType', 'valid', 'warnings'],
  article: ['title', 'byline', 'siteName', 'excerpt', 'text', 'html', 'length', 'publishedTime'],
  pricing: ['planName', 'price', 'currency', 'billingPeriod', 'features', 'ctaText', 'ctaHref', 'trialMentioned', 'freePlanMentioned', 'discountMentioned'],
  products: ['name', 'description', 'features', 'price', 'ctaText', 'ctaHref', 'category'],
  contentQuality: ['wordCount', 'headingCount', 'h1Count', 'h2Count', 'ctaCount', 'duplicateHeadings', 'missingMetaDescription', 'thinContent', 'readabilityEstimate', 'imageAltMissingCount', 'internalLinkCount', 'externalLinkCount'],
  summary: ['url', 'title', 'wordCount', 'totalLinks', 'visibleLinks', 'internalLinks', 'externalLinks', 'socialLinks', 'totalImages', 'imagesMissingAlt', 'tablesFound', 'jsonLdCount', 'schemaTypes', 'hasMetadata', 'hasJsonLd', 'hasPricing', 'hasContactInfo', 'hasArticle', 'ctaCount', 'warningCount', 'emailsFound', 'phonesFound', 'socialProfilesFound', 'contactPageLinks', 'totalRows', 'largestTable', 'internalLinks', 'externalLinks', 'duplicateHrefGroups', 'emptyHref', 'javascriptLinks', 'hashOnlyLinks', 'hasProductSchema', 'hasFAQSchema', 'hasSoftwareApplicationSchema'],
};

const QUERY_SECTIONS = new Set([
  'page', 'metadata', 'headings', 'sections', 'links', 'images', 'assets',
  'tables', 'jsonLd', 'article', 'contacts', 'pricing', 'products',
  'contentQuality', 'warnings', 'summary', 'snapshot',
]);

const SOURCE_TYPES = new Set(['active_tab', 'url', 'html']);

// ─── Presets ──────────────────────────────────────────────────────────────────

const PRESETS = {
  basic: {
    page: { fields: ['title', 'description', 'mainText', 'wordCount'], maxTextChars: 6000 },
    headings: { levels: [1, 2, 3], limit: 50 },
    links: { fields: ['text', 'href', 'absoluteUrl', 'external', 'visible'], limit: 50 },
    summary: true,
  },
  page: {
    page: { fields: ['title', 'description', 'mainText', 'markdown', 'wordCount'], maxTextChars: 12000, formats: ['text', 'markdown'] },
    headings: true,
    summary: true,
  },
  links: {
    links: { fields: ['text', 'href', 'absoluteUrl', 'external', 'visible', 'type', 'placement', 'intent', 'target', 'rel'], limit: 500 },
    summary: { include: ['totalLinks', 'visibleLinks', 'internalLinks', 'externalLinks', 'socialLinks', 'emptyHref', 'javascriptLinks', 'hashOnlyLinks', 'duplicateHrefGroups'] },
  },
  tables: {
    tables: { fields: ['selector', 'caption', 'headers', 'rows', 'rowCount', 'columnCount', 'markdown', 'csv'], formats: ['json', 'markdown'], maxRowsPerTable: 100, limit: 50 },
    summary: { include: ['tablesFound', 'totalRows', 'largestTable'] },
  },
  seo_audit: {
    metadata: true,
    page: { fields: ['title', 'description', 'wordCount'] },
    headings: { levels: [1, 2, 3], limit: 100 },
    links: { fields: ['text', 'href', 'absoluteUrl', 'external', 'visible', 'type'], limit: 200 },
    images: { fields: ['src', 'alt', 'width', 'height', 'visible', 'loading'], limit: 150 },
    jsonLd: true,
    contentQuality: true,
    warnings: true,
    summary: true,
  },
  landing_page_audit: {
    page: { fields: ['title', 'description', 'mainText', 'markdown', 'wordCount'], maxTextChars: 12000 },
    metadata: true,
    headings: { levels: [1, 2, 3], limit: 100 },
    sections: { fields: ['heading', 'text', 'links', 'images', 'ctaButtons'], maxSections: 40, maxTextCharsPerSection: 2000 },
    links: { fields: ['text', 'href', 'absoluteUrl', 'external', 'visible', 'type', 'placement', 'intent'], limit: 200 },
    images: { fields: ['src', 'alt', 'width', 'height', 'visible', 'loading'], limit: 150 },
    pricing: true,
    products: true,
    jsonLd: true,
    contentQuality: true,
    warnings: true,
    summary: true,
  },
  article_extract: {
    article: { fields: ['title', 'byline', 'siteName', 'excerpt', 'text', 'length', 'publishedTime'], maxChars: 20000 },
    page: { fields: ['title', 'description'] },
    headings: true,
    links: { fields: ['text', 'href', 'absoluteUrl', 'external'], limit: 100 },
    summary: true,
  },
  research_extract: {
    page: { fields: ['title', 'description', 'mainText', 'markdown', 'wordCount'], maxTextChars: 20000, formats: ['text', 'markdown'] },
    article: { fields: ['title', 'byline', 'siteName', 'excerpt', 'text', 'length'], maxChars: 20000 },
    headings: true,
    tables: { fields: ['caption', 'headers', 'rows', 'rowCount', 'columnCount', 'markdown'], maxRowsPerTable: 100, limit: 20 },
    links: { fields: ['text', 'href', 'absoluteUrl', 'external'], limit: 150 },
    summary: true,
  },
  competitor_snapshot: {
    page: { fields: ['title', 'description', 'mainText', 'wordCount'], maxTextChars: 12000 },
    metadata: true,
    headings: true,
    sections: { fields: ['heading', 'text', 'ctaButtons'], maxSections: 40 },
    pricing: true,
    products: true,
    links: { fields: ['text', 'href', 'absoluteUrl', 'external', 'placement', 'intent'], limit: 200 },
    jsonLd: true,
    contentQuality: true,
    warnings: true,
    snapshot: true,
    summary: true,
  },
  pricing_audit: {
    pricing: true,
    products: true,
    sections: { fields: ['heading', 'text', 'ctaButtons'], maxSections: 30 },
    links: { fields: ['text', 'href', 'absoluteUrl', 'intent', 'placement'], limit: 100 },
    page: { fields: ['title', 'description', 'mainText'], maxTextChars: 12000 },
    summary: true,
    warnings: true,
  },
  structured_data: {
    metadata: true,
    jsonLd: true,
    warnings: { include: ['schemaMismatch', 'invalidSchema', 'missingSchema', 'duplicateSchema'] },
    summary: { include: ['schemaTypes', 'jsonLdCount', 'hasProductSchema', 'hasFAQSchema', 'hasSoftwareApplicationSchema'] },
  },
  contact_discovery: {
    contacts: { includeEmails: true, includePhones: true, includeSocials: true },
    links: { fields: ['text', 'href', 'absoluteUrl', 'external', 'type', 'placement'], limit: 300 },
    summary: { include: ['emailsFound', 'phonesFound', 'socialProfilesFound', 'contactPageLinks'] },
  },
  asset_audit: {
    images: { fields: ['src', 'alt', 'width', 'height', 'visible', 'loading'], includeBackgroundImages: true, limit: 300 },
    assets: { include: ['scripts', 'stylesheets', 'fonts', 'favicons', 'preloads', 'videos'] },
    warnings: { include: ['missingAlt', 'largeImages', 'missingFavicon', 'tooManyScripts'] },
    summary: true,
  },
};

// ─── Errors ───────────────────────────────────────────────────────────────────

function errorResponse(code, message, extra = {}) {
  return { ok: false, error: { code, message, ...extra }, meta: { tool: 'fileforge_scrape_action' } };
}

// ─── Snapshot store ───────────────────────────────────────────────────────────

const SNAPSHOT_TTL_MS = 30 * 60 * 1000;
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

export function createScrapeSnapshot(response) {
  pruneSnapshots();
  const id = `scrape_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const compact = {
    url: response?.source?.url,
    title: response?.source?.title,
    page: response?.page ?? null,
    metadata: response?.metadata ?? null,
    headings: response?.headings ?? null,
    links: response?.links ?? null,
    images: response?.images ?? null,
    tables: response?.tables ?? null,
    jsonLd: response?.jsonLd ?? null,
    pricing: response?.pricing ?? null,
    warnings: response?.warnings ?? [],
  };
  const hashes = {
    page: sha256(compact.page),
    metadata: sha256(compact.metadata),
    headings: sha256(compact.headings),
    links: sha256(compact.links),
    jsonLd: sha256(compact.jsonLd),
  };
  snapshotStore.set(id, { id, createdAt: Date.now(), compact, hashes });
  return { id, hashes };
}

export function compareScrapeSnapshots(beforeId, afterId) {
  pruneSnapshots();
  const before = snapshotStore.get(beforeId);
  const after = snapshotStore.get(afterId);
  if (!before || !after) {
    return errorResponse('SNAPSHOT_NOT_FOUND', `Snapshot not found: ${before ? afterId : beforeId}`);
  }
  const b = before.compact;
  const a = after.compact;

  const titleChanged = (b.metadata?.title ?? null) !== (a.metadata?.title ?? null);
  const descriptionChanged = (b.metadata?.description ?? null) !== (a.metadata?.description ?? null);
  const canonicalChanged = (b.metadata?.canonical ?? null) !== (a.metadata?.canonical ?? null);
  const headingsChanged = before.hashes.headings !== after.hashes.headings;
  const linksChanged = before.hashes.links !== after.hashes.links;
  const pricingChanged = sha256(b.pricing) !== sha256(a.pricing);
  const jsonLdChanged = before.hashes.jsonLd !== after.hashes.jsonLd;

  const beforeWarnCodes = new Set((b.warnings ?? []).map((w) => w.code));
  const afterWarnCodes = new Set((a.warnings ?? []).map((w) => w.code));
  const warningsAdded = [...afterWarnCodes].filter((c) => !beforeWarnCodes.has(c));
  const warningsResolved = [...beforeWarnCodes].filter((c) => !afterWarnCodes.has(c));

  const beforeSchemas = new Set((b.jsonLd ?? []).map((j) => j.schemaType).filter(Boolean));
  const afterSchemas = new Set((a.jsonLd ?? []).map((j) => j.schemaType).filter(Boolean));
  const schemaTypesChanged = [...beforeSchemas].some((s) => !afterSchemas.has(s)) || [...afterSchemas].some((s) => !beforeSchemas.has(s));

  return {
    ok: true,
    schemaVersion: 'scrape.compare.v1',
    timestamp: new Date().toISOString(),
    changed: titleChanged || descriptionChanged || canonicalChanged || headingsChanged || linksChanged || pricingChanged || jsonLdChanged,
    changes: {
      titleChanged,
      descriptionChanged,
      canonicalChanged,
      headingsChanged,
      linksChanged,
      pricingChanged,
      jsonLdChanged,
      schemaTypesChanged,
      warningsAdded,
      warningsResolved,
    },
    meta: { tool: 'fileforge_scrape_action', action: 'compare_scrape_snapshots' },
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validationError(code, message, path, extra = {}) {
  return errorResponse(code, message, { path, ...extra });
}

function clampLimit(value, key) {
  const { default: def, max } = LIMITS[key];
  if (value == null) return def;
  if (typeof value !== 'number' || value < 0) return null;
  return Math.min(value, max);
}

export function resolveScrapePreset(name) {
  if (!name) return null;
  const preset = PRESETS[name];
  if (!preset) return { error: validationError('INVALID_PRESET', `Unknown preset '${name}'`, 'preset', { allowedPresets: Object.keys(PRESETS) }) };
  return { preset: JSON.parse(JSON.stringify(preset)) };
}

function mergeQuery(base, override) {
  if (!base) return override ?? {};
  if (!override) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export function resolveScrapeQuery({ preset, query }) {
  if (preset) {
    const resolved = resolveScrapePreset(preset);
    if (resolved.error) return resolved;
    return { query: mergeQuery(resolved.preset, query) };
  }
  return { query: query ?? { page: true, summary: true } };
}

export function validateScrapeQuery(query) {
  if (!query || typeof query !== 'object') return validationError('INVALID_FIELD', 'query must be an object', 'query');
  for (const key of Object.keys(query)) {
    if (!QUERY_SECTIONS.has(key)) {
      return validationError('INVALID_FIELD', `Unknown query section '${key}'`, `query.${key}`, { allowedSections: [...QUERY_SECTIONS] });
    }
    const spec = query[key];
    if (spec === true || spec === false || spec == null) continue;
    if (typeof spec !== 'object') return validationError('INVALID_FIELD', `Section '${key}' must be true or an object`, `query.${key}`);
    if (Array.isArray(spec.fields)) {
      const allowed = FIELDS[key];
      if (allowed) {
        for (let i = 0; i < spec.fields.length; i++) {
          if (!allowed.includes(spec.fields[i])) {
            return validationError('INVALID_FIELD', `Field '${spec.fields[i]}' is not allowed in ${key}.fields`, `query.${key}.fields[${i}]`, { allowedFields: allowed });
          }
        }
      }
    }
    if (spec.maxTextChars != null) {
      const c = clampLimit(spec.maxTextChars, 'maxTextChars');
      if (c == null || spec.maxTextChars > LIMITS.maxTextChars.max) {
        return validationError('LIMIT_EXCEEDED', `maxTextChars exceeds maximum ${LIMITS.maxTextChars.max}`, `query.${key}.maxTextChars`);
      }
    }
    if (spec.limit != null) {
      const limitKey = key === 'links' ? 'links' : key === 'images' ? 'images' : key === 'tables' ? 'tables' : key === 'headings' ? 'headings' : key === 'jsonLd' ? 'jsonLd' : null;
      if (limitKey) {
        if (typeof spec.limit !== 'number' || spec.limit < 0 || spec.limit > LIMITS[limitKey].max) {
          return validationError('LIMIT_EXCEEDED', `${key}.limit exceeds maximum ${LIMITS[limitKey].max}`, `query.${key}.limit`);
        }
      }
    }
    if (key === 'tables' && spec.maxRowsPerTable != null) {
      if (typeof spec.maxRowsPerTable !== 'number' || spec.maxRowsPerTable < 0 || spec.maxRowsPerTable > LIMITS.rowsPerTable.max) {
        return validationError('LIMIT_EXCEEDED', `tables.maxRowsPerTable exceeds maximum ${LIMITS.rowsPerTable.max}`, `query.${key}.maxRowsPerTable`);
      }
    }
    if (key === 'sections' && spec.maxSections != null) {
      if (typeof spec.maxSections !== 'number' || spec.maxSections < 0 || spec.maxSections > LIMITS.sections.max) {
        return validationError('LIMIT_EXCEEDED', `sections.maxSections exceeds maximum ${LIMITS.sections.max}`, `query.${key}.maxSections`);
      }
    }
  }
  return null;
}

export function resolveScrapeSource(source) {
  if (!source) return { source: { type: 'active_tab' } };
  if (!SOURCE_TYPES.has(source.type)) {
    return { error: validationError('INVALID_SOURCE', `Unsupported source type '${source.type}'`, 'source.type', { allowedTypes: [...SOURCE_TYPES] }) };
  }
  if (source.type === 'url' && !source.url) return { error: validationError('INVALID_SOURCE', 'source.url is required when type=url', 'source.url') };
  if (source.type === 'html' && !source.html) return { error: validationError('INVALID_SOURCE', 'source.html is required when type=html', 'source.html') };
  if (source.type === 'html') return { error: validationError('INVALID_SOURCE', 'HTML source not yet supported in this build', 'source.type') };
  return { source };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function projectFields(obj, fields) {
  if (!obj) return obj;
  if (!Array.isArray(fields) || fields.length === 0) return obj;
  const out = {};
  for (const f of fields) if (f in obj) out[f] = obj[f];
  return out;
}

export function truncateText(text, max) {
  if (typeof text !== 'string') return text;
  if (!max || text.length <= max) return text;
  return text.slice(0, max);
}

function toAbsoluteUrl(href, base) {
  if (!href) return href;
  try { return new URL(href, base).toString(); } catch { return href; }
}

function isVisibleByRect(rect) {
  if (!rect) return undefined;
  const w = rect.renderedWidth ?? rect.width;
  const h = rect.renderedHeight ?? rect.height;
  if (w == null || h == null) return undefined;
  return w > 0 && h > 0;
}

// ─── Classification ──────────────────────────────────────────────────────────

const SOCIAL_HOSTS = ['instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'youtube.com', 'facebook.com', 'tiktok.com', 'github.com', 'discord.com', 'discord.gg', 't.me'];
const SOCIAL_MAP = { 'instagram.com': 'instagram', 'twitter.com': 'x', 'x.com': 'x', 'linkedin.com': 'linkedin', 'youtube.com': 'youtube', 'youtu.be': 'youtube', 'facebook.com': 'facebook', 'fb.com': 'facebook', 'tiktok.com': 'tiktok', 'github.com': 'github', 'discord.com': 'discord', 'discord.gg': 'discord', 't.me': 'telegram' };

export function classifyLink(link, pageOrigin) {
  const href = link.href ?? '';
  if (!href) return { type: 'unknown', intent: 'unknown' };
  if (href.startsWith('mailto:')) return { type: 'email', intent: 'contact' };
  if (href.startsWith('tel:')) return { type: 'phone', intent: 'contact' };
  if (href.startsWith('javascript:')) return { type: 'javascript', intent: 'unknown' };
  if (href.startsWith('#')) return { type: 'anchor', intent: 'navigation' };
  let host = '';
  try { host = new URL(href, pageOrigin || undefined).host; } catch { return { type: 'unknown', intent: 'unknown' }; }
  let pageHost = '';
  try { pageHost = pageOrigin ? new URL(pageOrigin).host : ''; } catch {}
  if (SOCIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return { type: 'social', intent: 'social' };
  if (/\.(pdf|zip|csv|xlsx|docx|tar|gz|mp3|mp4)(\?|$)/i.test(href)) return { type: 'download', intent: 'download' };
  const isExternal = pageHost && host && host !== pageHost;
  const text = (link.text ?? '').toLowerCase();
  let intent = 'unknown';
  if (/sign\s*up|get started|try (it )?free|start free/i.test(text)) intent = 'signup';
  else if (/log\s*in|sign\s*in/i.test(text)) intent = 'login';
  else if (/pric/i.test(text)) intent = 'pricing';
  else if (/contact/i.test(text)) intent = 'contact';
  else if (/docs?|documentation/i.test(text)) intent = 'docs';
  else if (/download/i.test(text)) intent = 'download';
  else if (/privacy|terms|legal|cookie/i.test(text)) intent = 'legal';
  else if (text) intent = isExternal ? 'unknown' : 'navigation';
  return { type: isExternal ? 'external' : 'internal', intent };
}

// ─── Extraction ───────────────────────────────────────────────────────────────

function rawPageData(raw) {
  return raw?.data ?? raw ?? {};
}

export function extractPage(raw, spec) {
  if (!spec) return undefined;
  const data = rawPageData(raw);
  const md = data.metadata ?? {};
  const text = data.text ?? data.mainText ?? '';
  const markdown = data.markdown ?? '';
  const maxTextChars = (spec === true ? LIMITS.maxTextChars.default : (spec.maxTextChars ?? LIMITS.maxTextChars.default));
  const wordCount = typeof text === 'string' ? text.trim().split(/\s+/).filter(Boolean).length : undefined;
  const page = {
    title: data.title ?? md.title,
    description: md.description,
    mainText: truncateText(text, maxTextChars),
    markdown: truncateText(markdown, maxTextChars),
    wordCount,
    language: md.language,
    domain: md.origin ?? data.url,
    url: data.url ?? md.url,
    canonical: md.canonical,
  };
  const fields = (spec === true ? null : spec.fields) || null;
  return fields ? projectFields(page, fields) : page;
}

export function extractMetadata(raw, spec) {
  if (!spec) return undefined;
  const md = rawPageData(raw).metadata ?? {};
  const out = {
    title: md.title,
    description: md.description,
    canonical: md.canonical,
    robots: md.robots,
    viewport: md.viewport,
    charset: md.charset,
    language: md.language,
    favicon: (md.links ?? []).find((l) => /icon/i.test(l.rel))?.href,
    themeColor: (md.metaTags ?? []).find((m) => m.name === 'theme-color')?.content,
    openGraph: md.og,
    twitterCard: md.twitter,
    alternates: md.alternates,
    manifest: (md.links ?? []).find((l) => /manifest/i.test(l.rel))?.href,
    author: (md.metaTags ?? []).find((m) => m.name === 'author')?.content,
    publisher: (md.metaTags ?? []).find((m) => m.name === 'publisher')?.content,
  };
  const fields = (spec === true ? null : spec.fields) || null;
  return fields ? projectFields(out, fields) : out;
}

export function extractHeadings(raw, spec) {
  if (!spec) return undefined;
  const md = rawPageData(raw).metadata ?? {};
  const all = md.headings ?? [];
  const levels = (spec === true ? null : spec.levels) || null;
  const limit = clampLimit(spec === true ? null : spec.limit, 'headings');
  let filtered = levels ? all.filter((h) => levels.includes(h.level)) : all;
  const total = filtered.length;
  filtered = filtered.slice(0, limit).map((h, i) => ({ level: h.level, text: h.text, selector: h.selector, order: i }));
  return total > filtered.length
    ? { items: filtered, truncated: true, returned: filtered.length, totalMatched: total, limit }
    : filtered;
}

export function extractLinks(raw, spec) {
  if (!spec) return undefined;
  const data = rawPageData(raw);
  const baseUrl = data.url ?? '';
  let origin = '';
  try { origin = baseUrl ? new URL(baseUrl).origin : ''; } catch {}
  const raws = data.links ?? [];
  const samePage = new Set((data.pageLinks ?? []).map((l) => l.href));
  const where = (spec === true ? {} : spec.where) || {};
  const limit = clampLimit(spec === true ? null : spec.limit, 'links');
  const fields = (spec === true ? null : spec.fields) || null;

  const enriched = raws.map((l) => {
    const absoluteUrl = toAbsoluteUrl(l.href, baseUrl);
    const cls = classifyLink({ href: l.href, text: l.text }, origin);
    return {
      selector: l.selector,
      text: l.text,
      href: l.href,
      absoluteUrl,
      external: cls.type === 'external' || cls.type === 'social',
      visible: true,
      target: l.target,
      rel: l.rel,
      type: cls.type,
      placement: 'unknown',
      intent: cls.intent,
      hasText: Boolean(l.text && l.text.length > 0),
      accessibleName: l.accessibleName ?? l.text,
    };
  });

  const filtered = applyFilters(enriched, where, 'link');
  const total = filtered.length;
  const limited = filtered.slice(0, limit);
  const projected = fields ? limited.map((l) => projectFields(l, fields)) : limited;
  return total > projected.length
    ? { items: projected, truncated: true, returned: projected.length, totalMatched: total, limit }
    : projected;
}

export function applyFilters(items, where, kind) {
  if (!where || Object.keys(where).length === 0) return items;
  return items.filter((item) => {
    if (where.textIncludes && !(item.text ?? '').toLowerCase().includes(where.textIncludes.toLowerCase())) return false;
    if (where.hrefIncludes && !(item.href ?? '').includes(where.hrefIncludes)) return false;
    if (where.external != null && Boolean(item.external) !== Boolean(where.external)) return false;
    if (where.visible != null && Boolean(item.visible) !== Boolean(where.visible)) return false;
    if (where.hasText != null && Boolean(item.hasText) !== Boolean(where.hasText)) return false;
    if (where.type && item.type !== where.type) return false;
    if (where.placement && item.placement !== where.placement) return false;
    if (where.intent && item.intent !== where.intent) return false;
    return true;
  });
}

export function extractImages(raw, spec) {
  if (!spec) return undefined;
  const data = rawPageData(raw);
  const baseUrl = data.url ?? '';
  const raws = data.images ?? [];
  const limit = clampLimit(spec === true ? null : spec.limit, 'images');
  const fields = (spec === true ? null : spec.fields) || null;
  const items = raws.map((img) => ({
    selector: img.selector,
    src: img.src,
    absoluteUrl: toAbsoluteUrl(img.src, baseUrl),
    alt: img.alt,
    title: img.title,
    width: img.width,
    height: img.height,
    naturalWidth: img.naturalWidth ?? img.width,
    naturalHeight: img.naturalHeight ?? img.height,
    loading: img.loading,
    visible: img.visible ?? true,
    type: 'image',
    placement: 'unknown',
  }));
  const total = items.length;
  const limited = items.slice(0, limit);
  const projected = fields ? limited.map((i) => projectFields(i, fields)) : limited;
  return total > projected.length
    ? { items: projected, truncated: true, returned: projected.length, totalMatched: total, limit }
    : projected;
}

export function extractAssets(raw, spec) {
  if (!spec) return undefined;
  const a = rawPageData(raw).assets ?? {};
  const include = (spec === true ? FIELDS.assets : (spec.include ?? FIELDS.assets));
  const out = {};
  for (const k of include) {
    if (k in a) out[k] = a[k];
  }
  return out;
}

export function normalizeTable(table, maxRows) {
  const headers = table.headers ?? [];
  const rows = (table.rows ?? []).slice(0, maxRows);
  const truncated = (table.rows ?? []).length > rows.length;
  const markdown = headers.length
    ? `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}`
    : undefined;
  const csv = headers.length
    ? [headers, ...rows].map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    : undefined;
  return {
    selector: table.selector,
    caption: table.caption,
    headers,
    rows,
    rowCount: rows.length,
    columnCount: headers.length,
    markdown,
    csv,
    ...(truncated ? { truncated: true } : {}),
  };
}

export function extractTables(raw, spec) {
  if (!spec) return undefined;
  const raws = rawPageData(raw).tables ?? [];
  const limit = clampLimit(spec === true ? null : spec.limit, 'tables');
  const maxRows = clampLimit(spec === true ? null : spec.maxRowsPerTable, 'rowsPerTable');
  const fields = (spec === true ? null : spec.fields) || null;
  const total = raws.length;
  const items = raws.slice(0, limit).map((t) => normalizeTable(t, maxRows));
  const projected = fields ? items.map((t) => projectFields(t, fields)) : items;
  return total > projected.length
    ? { items: projected, truncated: true, returned: projected.length, totalMatched: total, limit }
    : projected;
}

export function extractJsonLd(raw, spec) {
  if (!spec) return undefined;
  const md = rawPageData(raw).metadata ?? {};
  const items = (md.jsonLd ?? []).map((entry, i) => {
    const parsed = entry.parsed;
    const schemaType = parsed && (Array.isArray(parsed['@type']) ? parsed['@type'][0] : parsed['@type']);
    return {
      raw: parsed,
      type: parsed?.['@type'],
      id: parsed?.['@id'],
      name: parsed?.name,
      description: parsed?.description,
      url: parsed?.url,
      schemaType,
      valid: !entry.error,
      warnings: entry.error ? [entry.error] : [],
      index: i,
    };
  });
  const types = (spec === true ? null : spec.schemaTypes) || null;
  const limit = clampLimit(spec === true ? null : spec.limit, 'jsonLd');
  let filtered = types ? items.filter((j) => j.schemaType && types.includes(j.schemaType)) : items;
  const total = filtered.length;
  filtered = filtered.slice(0, limit);
  return total > filtered.length
    ? { items: filtered, truncated: true, returned: filtered.length, totalMatched: total, limit }
    : filtered;
}

export function extractContacts(raw, spec) {
  if (!spec) return undefined;
  const c = rawPageData(raw).contacts ?? {};
  const cfg = spec === true ? { includeEmails: true, includePhones: true, includeSocials: true } : spec;
  const out = {};
  if (cfg.includeEmails) out.emails = (c.emails ?? []).map((e) => e.value ?? e);
  if (cfg.includePhones) out.phones = (c.phones ?? []).map((p) => p.value ?? p);
  if (cfg.includeSocials) {
    const socials = { instagram: [], x: [], linkedin: [], youtube: [], facebook: [], tiktok: [], github: [], discord: [], telegram: [] };
    const links = rawPageData(raw).links ?? [];
    for (const l of links) {
      try {
        const host = new URL(l.href).host.replace(/^www\./, '');
        for (const [domain, key] of Object.entries(SOCIAL_MAP)) {
          if (host === domain || host.endsWith(`.${domain}`)) {
            (socials[key] = socials[key] ?? []).push(l.href);
            break;
          }
        }
      } catch {}
    }
    out.socials = socials;
  }
  return out;
}

export function extractSections(raw, spec) {
  if (!spec) return undefined;
  const md = rawPageData(raw).metadata ?? {};
  const headings = md.headings ?? [];
  const maxSections = clampLimit(spec === true ? null : spec.maxSections, 'sections');
  const maxTextCharsPerSection = (spec === true ? 2000 : (spec.maxTextCharsPerSection ?? 2000));
  const fields = (spec === true ? null : spec.fields) || null;
  const items = headings.slice(0, maxSections).map((h, i) => ({
    heading: h.text,
    text: truncateText('', maxTextCharsPerSection),
    links: [],
    images: [],
    ctaButtons: [],
    selector: h.selector,
    order: i,
    wordCount: 0,
  }));
  return fields ? items.map((s) => projectFields(s, fields)) : items;
}

export function extractArticle(raw, spec) {
  if (!spec) return undefined;
  const data = rawPageData(raw);
  const md = data.metadata ?? {};
  const maxChars = (spec === true ? 20000 : (spec.maxChars ?? 20000));
  const text = truncateText(data.text ?? data.mainText ?? '', maxChars);
  const article = {
    title: data.title ?? md.title,
    byline: md.author,
    siteName: md.og?.siteName,
    excerpt: md.description,
    text,
    html: undefined,
    length: text ? text.length : 0,
    publishedTime: (md.metaTags ?? []).find((m) => m.property === 'article:published_time')?.content,
  };
  const fields = (spec === true ? null : spec.fields) || null;
  return fields ? projectFields(article, fields) : article;
}

export function extractPricing(raw, spec) {
  if (!spec) return undefined;
  const text = rawPageData(raw).text ?? rawPageData(raw).mainText ?? '';
  const prices = [...text.matchAll(/\$\s*(\d{1,4}(?:[.,]\d{1,2})?)(\s*\/\s*(month|mo|year|yr|user|seat))?/gi)].slice(0, 20);
  const items = prices.map((m) => ({
    planName: undefined,
    price: m[1],
    currency: 'USD',
    billingPeriod: m[3]?.toLowerCase(),
    features: [],
    ctaText: undefined,
    ctaHref: undefined,
    trialMentioned: /free trial/i.test(text),
    freePlanMentioned: /\bfree\b/i.test(text),
    discountMentioned: /discount|save \d+%|% off/i.test(text),
  }));
  const fields = (spec === true ? null : spec.fields) || null;
  return fields ? items.map((p) => projectFields(p, fields)) : items;
}

export function extractProducts(raw, spec) {
  if (!spec) return undefined;
  const md = rawPageData(raw).metadata ?? {};
  const items = (md.jsonLd ?? [])
    .map((j) => j.parsed)
    .filter((p) => p && (Array.isArray(p['@type']) ? p['@type'].includes('Product') : p['@type'] === 'Product'))
    .map((p) => ({
      name: p.name,
      description: p.description,
      features: [],
      price: p.offers?.price,
      ctaText: undefined,
      ctaHref: p.url,
      category: p.category,
    }));
  const fields = (spec === true ? null : spec.fields) || null;
  return fields ? items.map((p) => projectFields(p, fields)) : items;
}

export function buildContentQuality(raw) {
  const data = rawPageData(raw);
  const md = data.metadata ?? {};
  const headings = md.headings ?? [];
  const headingTexts = headings.map((h) => h.text);
  const dupes = headingTexts.filter((t, i) => headingTexts.indexOf(t) !== i);
  const text = data.text ?? data.mainText ?? '';
  const wordCount = text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  const images = data.images ?? [];
  const baseHost = (() => { try { return new URL(data.url).host; } catch { return ''; } })();
  let internalLinks = 0, externalLinks = 0;
  for (const l of (data.links ?? [])) {
    try {
      const h = new URL(l.href).host;
      if (baseHost && h === baseHost) internalLinks++; else externalLinks++;
    } catch {}
  }
  return {
    wordCount,
    headingCount: headings.length,
    h1Count: headings.filter((h) => h.level === 1).length,
    h2Count: headings.filter((h) => h.level === 2).length,
    ctaCount: undefined,
    duplicateHeadings: [...new Set(dupes)],
    missingMetaDescription: !md.description,
    thinContent: wordCount < 200,
    readabilityEstimate: undefined,
    imageAltMissingCount: images.filter((i) => !i.alt).length,
    internalLinkCount: internalLinks,
    externalLinkCount: externalLinks,
  };
}

export function buildScrapeWarnings(raw, response) {
  const data = rawPageData(raw);
  const md = data.metadata ?? {};
  const headings = md.headings ?? [];
  const warnings = [];
  if (!md.title) warnings.push({ code: 'MISSING_TITLE', severity: 'high', message: 'Page has no title' });
  if (!md.description) warnings.push({ code: 'MISSING_META_DESCRIPTION', severity: 'medium', message: 'Page has no meta description' });
  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length === 0) warnings.push({ code: 'MISSING_H1', severity: 'medium', message: 'Page has no H1' });
  if (h1s.length > 1) warnings.push({ code: 'MULTIPLE_H1', severity: 'low', message: `Page contains ${h1s.length} H1 headings` });
  if (!md.canonical) warnings.push({ code: 'MISSING_CANONICAL', severity: 'low', message: 'No canonical URL' });
  const text = data.text ?? data.mainText ?? '';
  if (text && text.trim().split(/\s+/).filter(Boolean).length < 100) warnings.push({ code: 'THIN_CONTENT', severity: 'medium', message: 'Page has fewer than 100 words' });
  const missingAlt = (data.images ?? []).filter((i) => !i.alt).length;
  if (missingAlt > 0) warnings.push({ code: 'IMAGE_MISSING_ALT', severity: 'medium', message: `${missingAlt} images missing alt text` });
  for (const l of (data.links ?? [])) {
    if (l.href && l.href.startsWith('javascript:')) {
      warnings.push({ code: 'JAVASCRIPT_LINK', severity: 'medium', message: 'Link uses javascript: href' });
      break;
    }
  }
  for (const l of (data.links ?? [])) {
    if (!l.href || l.href === '#') {
      warnings.push({ code: 'EMPTY_HREF', severity: 'low', message: 'Link with empty or hash-only href' });
      break;
    }
  }
  for (const l of (data.links ?? [])) {
    if (!l.text || !l.text.trim()) {
      warnings.push({ code: 'EMPTY_LINK_TEXT', severity: 'low', message: 'Link with no visible text' });
      break;
    }
  }
  for (const entry of (md.jsonLd ?? [])) {
    if (entry.error) {
      warnings.push({ code: 'INVALID_JSON_LD', severity: 'medium', message: `Invalid JSON-LD: ${entry.error}` });
      break;
    }
  }
  for (const entry of (md.jsonLd ?? [])) {
    const p = entry.parsed;
    if (p && p.description && md.description && p.description.length > 20 && md.description.length > 20) {
      const a = p.description.toLowerCase().slice(0, 80);
      const b = md.description.toLowerCase().slice(0, 80);
      const overlap = [...a].filter((ch, i) => b[i] === ch).length;
      if (overlap < Math.min(a.length, b.length) * 0.4) {
        warnings.push({ code: 'SCHEMA_CONTENT_MISMATCH', severity: 'medium', message: 'JSON-LD description appears unrelated to visible page content' });
        break;
      }
    }
  }
  if (response?.truncated) warnings.push({ code: 'CONTENT_TRUNCATED', severity: 'low', message: 'Some sections were truncated due to limits' });
  return warnings;
}

export function buildScrapeSummary(raw, response, includeList) {
  const data = rawPageData(raw);
  const md = data.metadata ?? {};
  const links = response.links?.items ?? response.links ?? [];
  const images = response.images?.items ?? response.images ?? [];
  const tables = response.tables?.items ?? response.tables ?? [];
  const jsonLd = response.jsonLd?.items ?? response.jsonLd ?? [];
  const linksArr = Array.isArray(links) ? links : [];
  const imagesArr = Array.isArray(images) ? images : [];
  const tablesArr = Array.isArray(tables) ? tables : [];
  const jsonLdArr = Array.isArray(jsonLd) ? jsonLd : [];
  const baseHost = (() => { try { return new URL(data.url).host; } catch { return ''; } })();
  const internal = linksArr.filter((l) => l.type === 'internal').length;
  const external = linksArr.filter((l) => l.type === 'external').length;
  const social = linksArr.filter((l) => l.type === 'social').length;
  const visible = linksArr.filter((l) => l.visible !== false).length;
  const emptyHref = linksArr.filter((l) => !l.href).length;
  const javascriptLinks = linksArr.filter((l) => l.type === 'javascript').length;
  const hashOnlyLinks = linksArr.filter((l) => l.href === '#' || (l.href ?? '').startsWith('#')).length;
  const hrefGroups = {};
  for (const l of linksArr) hrefGroups[l.href] = (hrefGroups[l.href] ?? 0) + 1;
  const duplicateHrefGroups = Object.values(hrefGroups).filter((c) => c > 1).length;
  const schemaTypes = [...new Set(jsonLdArr.map((j) => j.schemaType).filter(Boolean))];
  const contacts = response.contacts ?? {};
  const totalRows = tablesArr.reduce((s, t) => s + (t.rowCount ?? 0), 0);
  const largestTable = tablesArr.reduce((m, t) => Math.max(m, t.rowCount ?? 0), 0);

  const full = {
    url: data.url,
    title: data.title ?? md.title,
    wordCount: response.page?.wordCount,
    totalLinks: linksArr.length,
    visibleLinks: visible,
    internalLinks: internal,
    externalLinks: external,
    socialLinks: social,
    emptyHref,
    javascriptLinks,
    hashOnlyLinks,
    duplicateHrefGroups,
    totalImages: imagesArr.length,
    imagesMissingAlt: imagesArr.filter((i) => !i.alt).length,
    tablesFound: tablesArr.length,
    totalRows,
    largestTable,
    jsonLdCount: jsonLdArr.length,
    schemaTypes,
    hasMetadata: Boolean(response.metadata),
    hasJsonLd: jsonLdArr.length > 0,
    hasPricing: Array.isArray(response.pricing) && response.pricing.length > 0,
    hasContactInfo: Boolean((contacts.emails?.length ?? 0) + (contacts.phones?.length ?? 0)),
    hasArticle: Boolean(response.article),
    ctaCount: undefined,
    warningCount: response.warnings?.length ?? 0,
    emailsFound: contacts.emails?.length ?? 0,
    phonesFound: contacts.phones?.length ?? 0,
    socialProfilesFound: Object.values(contacts.socials ?? {}).reduce((s, arr) => s + arr.length, 0),
    contactPageLinks: linksArr.filter((l) => l.intent === 'contact').length,
    hasProductSchema: schemaTypes.includes('Product'),
    hasFAQSchema: schemaTypes.includes('FAQPage'),
    hasSoftwareApplicationSchema: schemaTypes.includes('SoftwareApplication'),
  };
  if (!includeList) return full;
  const out = {};
  for (const k of includeList) if (k in full) out[k] = full[k];
  return out;
}

// ─── Bridge section mapping ───────────────────────────────────────────────────

function bridgeSectionsForQuery(query) {
  const set = new Set();
  if (query.page || query.article || query.contentQuality || query.pricing || query.summary || query.warnings) set.add('metadata');
  if (query.metadata) set.add('metadata');
  if (query.headings || query.sections) set.add('metadata');
  if (query.links || query.contacts || query.contentQuality || query.summary || query.warnings) set.add('links').add('pageLinks');
  if (query.images || query.contentQuality || query.summary || query.warnings) set.add('images');
  if (query.tables || query.summary) set.add('tables');
  if (query.jsonLd || query.products || query.summary || query.warnings) set.add('structuredData');
  if (query.contacts) set.add('contacts');
  if (query.assets) set.add('assets');
  return [...set];
}

// ─── query_scrape handler ─────────────────────────────────────────────────────

async function handleQueryScrape(p, { rpcClient }) {
  const sourceRes = resolveScrapeSource(p.source);
  if (sourceRes.error) return sourceRes.error;
  const source = sourceRes.source;

  const queryRes = resolveScrapeQuery({ preset: p.preset, query: p.query });
  if (queryRes.error) return queryRes.error;
  const query = queryRes.query;

  const validation = validateScrapeQuery(query);
  if (validation) return validation;

  const sections = bridgeSectionsForQuery(query);
  let raw;
  try {
    if (source.type === 'url') {
      const rpc = await rpcClient.send('scrape.urls', { urls: [source.url], sections, closeTabs: true });
      if (!rpc?.ok) return errorResponse('FETCH_FAILED', rpc?.error?.message ?? 'URL fetch failed');
      raw = (rpc.data?.results ?? [])[0];
    } else {
      const rpc = await rpcClient.send('scrape.page', { tabId: p.tabId ?? source.tabId ?? 'active', sections });
      if (!rpc?.ok) return errorResponse('FETCH_FAILED', rpc?.error?.message ?? 'Page scrape failed');
      raw = rpc.data;
    }
  } catch (err) {
    return errorResponse('FETCH_FAILED', err.message);
  }

  const response = {
    ok: true,
    schemaVersion: 'scrape.query.v1',
    timestamp: new Date().toISOString(),
    source: { type: source.type, url: raw?.url, title: raw?.title },
  };

  if (query.page) response.page = extractPage(raw, query.page);
  if (query.metadata) response.metadata = extractMetadata(raw, query.metadata);
  if (query.headings) response.headings = extractHeadings(raw, query.headings);
  if (query.sections) response.sections = extractSections(raw, query.sections);
  if (query.links) response.links = extractLinks(raw, query.links);
  if (query.images) response.images = extractImages(raw, query.images);
  if (query.assets) response.assets = extractAssets(raw, query.assets);
  if (query.tables) response.tables = extractTables(raw, query.tables);
  if (query.jsonLd) response.jsonLd = extractJsonLd(raw, query.jsonLd);
  if (query.article) response.article = extractArticle(raw, query.article);
  if (query.contacts) response.contacts = extractContacts(raw, query.contacts);
  if (query.pricing) response.pricing = extractPricing(raw, query.pricing);
  if (query.products) response.products = extractProducts(raw, query.products);
  if (query.contentQuality) response.contentQuality = buildContentQuality(raw);
  if (query.warnings) response.warnings = buildScrapeWarnings(raw, response).filter((w) => {
    const inc = query.warnings === true ? null : query.warnings.include;
    return inc ? inc.includes(w.code) : true;
  });
  if (query.summary) {
    const include = query.summary === true ? null : query.summary.include;
    response.summary = buildScrapeSummary(raw, response, include);
  }
  if (!response.warnings) response.warnings = buildScrapeWarnings(raw, response).filter(() => false);

  if (query.snapshot) {
    const snap = createScrapeSnapshot(response);
    response.scrapeSnapshotId = snap.id;
    response.hashes = snap.hashes;
  }

  response.meta = { tool: 'fileforge_scrape_action', action: 'query_scrape', url: raw?.url };
  return response;
}

// ─── Existing helpers (untouched) ─────────────────────────────────────────────

function unwrap(response) {
  if (!response?.ok) return response;
  return response.data ?? response;
}

function storedScrapeResponse({ params, tool, prefix, response, fallbackUrl }) {
  if (!response?.ok) return response;
  const data = unwrap(response);
  const url = data?.url ?? fallbackUrl;
  const summary = summarizeData(data);
  const stored = maybeStoreResult({
    store: params.store ?? true,
    prefix,
    tool,
    url,
    project: params.project ?? 'default',
    data,
    summary,
  });
  return { ok: true, ...stored, meta: { tool, url } };
}

// ─── Capabilities ─────────────────────────────────────────────────────────────

const scrapeCapabilities = {
  tool: 'fileforge_scrape_action',
  actions: {
    query_scrape: { description: 'GraphQL-style projection over page content (presets + custom queries).', params: { source: { type: 'object' }, preset: { type: 'string' }, query: { type: 'object' } }, risk: 'low', flags: { read: true, browser: true, artifact: true }, permissions: ['allowBrowser'], produces: ['json'] },
    compare_scrape_snapshots: { description: 'Diff two stored scrape snapshots by ID.', params: { beforeSnapshotId: { type: 'string', required: true }, afterSnapshotId: { type: 'string', required: true } }, risk: 'low', flags: { read: true }, produces: ['json'] },
    scrape_page: { description: 'Scrape sections of a single page.', params: { tabId: { type: 'string' }, sections: { type: 'array' }, store: { type: 'boolean' } }, risk: 'low', flags: { read: true, browser: true, artifact: true }, permissions: ['allowBrowser'], produces: ['json'] },
    extract_assets: { description: 'Extract assets (images, videos, files) from a page.', params: { tabId: { type: 'string' }, store: { type: 'boolean' } }, risk: 'low', flags: { read: true, browser: true, artifact: true }, permissions: ['allowBrowser'], produces: ['json'] },
    extract_tables: { description: 'Extract tables from the active or specified page.', params: { tabId: { type: 'string' }, store: { type: 'boolean' } }, risk: 'low', flags: { read: true, browser: true, artifact: true }, permissions: ['allowBrowser'], produces: ['json'] },
    extract_contacts: { description: 'Extract email/phone/address contact data.', params: { tabId: { type: 'string' }, store: { type: 'boolean' } }, risk: 'low', flags: { read: true, browser: true, artifact: true }, permissions: ['allowBrowser'], produces: ['json'] },
    extract_metadata: { description: 'Extract page metadata (title, OG, JSON-LD).', params: { url: { type: 'string' }, tabId: { type: 'string' }, store: { type: 'boolean' } }, risk: 'low', flags: { read: true, browser: true, artifact: true }, permissions: ['allowBrowser'], produces: ['json'] },
    extract_design_tokens: { description: 'Extract colors, fonts, and design tokens.', params: { tabId: { type: 'string' }, store: { type: 'boolean' } }, risk: 'low', flags: { read: true, browser: true, artifact: true }, permissions: ['allowBrowser'], produces: ['json'] },
    extract_all_debug: { description: 'Extract everything (debug only — large payload).', params: { tabId: { type: 'string' } }, risk: 'medium', flags: { read: true, browser: true, artifact: true }, permissions: ['allowBrowser'], produces: ['json'] },
    scrape_tabs: { description: 'Scrape multiple tabs.', params: { tabIds: { type: 'array', required: true }, sections: { type: 'array' } }, risk: 'medium', flags: { read: true, browser: true, artifact: true }, permissions: ['allowBrowser'], produces: ['json'] },
    scrape_urls: { description: 'Open and scrape a list of URLs.', params: { urls: { type: 'array', required: true }, sections: { type: 'array' } }, risk: 'medium', flags: { read: true, browser: true, network: true, artifact: true }, permissions: ['allowBrowser', 'allowNetwork'], produces: ['json'] },
    crawl_site: { description: 'Crawl a site up to maxPages.', params: { url: { type: 'string', required: true }, maxPages: { type: 'number' } }, risk: 'medium', flags: { read: true, browser: true, network: true, artifact: true }, permissions: ['allowBrowser', 'allowNetwork'], produces: ['json'] },
    research_site: { description: 'Research a site (multi-step crawl + extract).', params: { url: { type: 'string', required: true } }, risk: 'medium', flags: { read: true, browser: true, network: true, artifact: true }, permissions: ['allowBrowser', 'allowNetwork'], produces: ['json'] },
    analyze_site: { description: 'Analyze a site.', params: { url: { type: 'string', required: true } }, risk: 'medium', flags: { read: true, browser: true, network: true, artifact: true }, permissions: ['allowBrowser', 'allowNetwork'], produces: ['json'] },
    extract_resource: { description: 'Fetch a specific page resource.', params: { url: { type: 'string', required: true } }, risk: 'low', flags: { read: true, browser: true, network: true, artifact: true }, permissions: ['allowBrowser', 'allowNetwork'], produces: ['json'] },
  },
};

const tools = [
  {
    name: 'fileforge_scrape_action',
    description: 'Scrape and extract content via the GraphQL-style query_scrape action, plus legacy actions (scrape_page, extract_tables, extract_metadata, …).',
    capabilities: scrapeCapabilities,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'query_scrape', 'compare_scrape_snapshots',
            'scrape_page', 'extract_assets', 'extract_tables', 'extract_contacts',
            'extract_metadata', 'extract_design_tokens', 'extract_all_debug',
            'scrape_tabs', 'scrape_urls', 'crawl_site', 'research_site',
            'analyze_site', 'extract_resource',
          ],
          description: 'The scrape action to perform.',
        },
        tabId: { type: 'string', default: 'active' },
        tabIds: { type: 'array', items: { type: 'string' } },
        url: { type: 'string' },
        urls: { type: 'array', items: { type: 'string' } },
        sections: { type: 'array', items: { type: 'string' } },
        maxPages: { type: 'number' },
        store: { type: 'boolean', default: true },
        project: { type: 'string', default: 'default' },
        source: { type: 'object' },
        preset: { type: 'string' },
        query: { type: 'object' },
        beforeSnapshotId: { type: 'string' },
        afterSnapshotId: { type: 'string' },
      },
      required: ['action'],
    },
    handler: async (rawParams, ctx) => {
      const rawAction = rawParams.action;
      let action = normalizeActionName(rawAction);
      const p = { ...rawParams, action };

      // Short-name aliases that map to query_scrape with an injected preset
      if (action === 'query_scrape_page_alias') {
        return handleQueryScrape({ ...p, action: 'query_scrape', preset: p.preset ?? 'page' }, ctx);
      }
      if (action === 'query_scrape_links_alias') {
        return handleQueryScrape({ ...p, action: 'query_scrape', preset: p.preset ?? 'links' }, ctx);
      }
      if (action === 'query_scrape_tables_alias') {
        return handleQueryScrape({ ...p, action: 'query_scrape', preset: p.preset ?? 'tables' }, ctx);
      }

      switch (action) {
        case 'query_scrape':
          return handleQueryScrape(p, ctx);
        case 'compare_scrape_snapshots': {
          if (!p.beforeSnapshotId || !p.afterSnapshotId) {
            return errorResponse('INVALID_ACTION', 'beforeSnapshotId and afterSnapshotId are required');
          }
          return compareScrapeSnapshots(p.beforeSnapshotId, p.afterSnapshotId);
        }
        case 'scrape_page': {
          const response = await ctx.rpcClient.send('scrape.page', { sections: p.sections ?? SECTIONS, ...p });
          return storedScrapeResponse({ params: p, tool: 'fileforge_scrape_action_page', prefix: 'scrape_page', response });
        }
        case 'extract_assets': {
          const response = await ctx.rpcClient.send('scrape.page', { ...p, sections: ['assets'] });
          if (!response?.ok) return response;
          const data = unwrap(response);
          const assets = data?.assets ?? {};
          const summary = {
            url: data?.url,
            images: assets.summary?.images ?? assets.images?.length ?? 0,
            videos: assets.summary?.videos ?? assets.videos?.length ?? 0,
            files: assets.summary?.files ?? assets.files?.length ?? 0,
            icons: assets.summary?.icons ?? assets.icons?.length ?? 0,
          };
          const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'scrape_assets', tool: 'fileforge_scrape_action_assets', url: data?.url, project: p.project ?? 'default', data, summary });
          return { ok: true, ...stored, meta: { tool: 'fileforge_scrape_action', action, url: data?.url } };
        }
        case 'extract_tables': {
          const response = await ctx.rpcClient.send('scrape.page', { ...p, sections: ['tables'] });
          if (!response?.ok) return response;
          const data = unwrap(response);
          const tables = Array.isArray(data?.tables) ? data.tables : [];
          const summary = {
            url: data?.url,
            tables: tables.length,
            totalRows: tables.reduce((total, table) => total + (table.rowCount ?? table.rows?.length ?? 0), 0),
            largestTable: tables.reduce((largest, table) => Math.max(largest, table.rowCount ?? table.rows?.length ?? 0), 0),
            previews: tables.slice(0, 10).map((table) => ({
              index: table.index,
              caption: table.caption,
              columns: table.columnCount ?? table.headers?.length ?? 0,
              rows: table.rowCount ?? table.rows?.length ?? 0,
              selector: table.selector,
            })),
          };
          const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'scrape_tables', tool: 'fileforge_scrape_action_tables', url: data?.url, project: p.project ?? 'default', data, summary });
          return { ok: true, ...stored, meta: { tool: 'fileforge_scrape_action', action, url: data?.url } };
        }
        case 'extract_contacts': {
          const response = await ctx.rpcClient.send('scrape.page', { ...p, sections: ['contacts'] });
          if (!response?.ok) return response;
          const data = unwrap(response);
          const contacts = data?.contacts ?? {};
          const summary = {
            url: data?.url,
            emails: contacts.summary?.emails ?? contacts.emails?.length ?? 0,
            phones: contacts.summary?.phones ?? contacts.phones?.length ?? 0,
            addresses: contacts.summary?.addresses ?? contacts.addresses?.length ?? 0,
            locations: contacts.summary?.locations ?? contacts.locations?.length ?? 0,
            previews: {
              emails: (contacts.emails ?? []).slice(0, 5).map((item) => item.value),
              phones: (contacts.phones ?? []).slice(0, 5).map((item) => item.value),
            },
          };
          const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'scrape_contacts', tool: 'fileforge_scrape_action_contacts', url: data?.url, project: p.project ?? 'default', data, summary });
          return { ok: true, ...stored, meta: { tool: 'fileforge_scrape_action', action, url: data?.url } };
        }
        case 'extract_metadata': {
          const response = await ctx.rpcClient.send('scrape.page', { ...p, sections: ['metadata'] });
          if (!response?.ok) return response;
          const data = unwrap(response);
          const metadata = data?.metadata ?? {};
          const summary = {
            url: data?.url ?? metadata.url,
            title: metadata.title,
            description: metadata.description,
            canonical: metadata.canonical,
            robots: metadata.robots,
            language: metadata.language,
            counts: metadata.summary,
            headings: (metadata.headings ?? []).slice(0, 12).map((heading) => ({ level: heading.level, text: heading.text })),
            openGraph: metadata.og,
            twitter: metadata.twitter,
          };
          const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'scrape_metadata', tool: 'fileforge_scrape_action_metadata', url: data?.url ?? metadata.url, project: p.project ?? 'default', data, summary });
          return { ok: true, ...stored, meta: { tool: 'fileforge_scrape_action', action, url: data?.url ?? metadata.url } };
        }
        case 'extract_design_tokens': {
          const response = await ctx.rpcClient.send('scrape.page', { ...p, sections: ['designTokens'] });
          if (!response?.ok) return response;
          const data = unwrap(response);
          const tokens = data?.designTokens ?? {};
          const summary = {
            url: data?.url,
            counts: tokens.summary,
            topColors: (tokens.colors ?? []).slice(0, 12).map((color) => ({
              value: color.value,
              count: color.count,
              samples: color.samples?.slice(0, 2).map((sample) => ({ property: sample.property, selector: sample.selector })),
            })),
            topFonts: (tokens.fonts ?? []).slice(0, 8).map((font) => ({
              value: font.value,
              count: font.count,
              sample: font.samples?.[0] ? { fontSize: font.samples[0].fontSize, fontWeight: font.samples[0].fontWeight, selector: font.samples[0].selector } : undefined,
            })),
            cssVariables: (tokens.cssVariables ?? []).slice(0, 20).map((variable) => ({ name: variable.name, values: variable.values, selectors: variable.selectors?.slice(0, 3) })),
          };
          const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'scrape_design_tokens', tool: 'fileforge_scrape_action_design_tokens', url: data?.url, project: p.project ?? 'default', data, summary });
          return { ok: true, ...stored, meta: { tool: 'fileforge_scrape_action', action, url: data?.url } };
        }
        case 'extract_all_debug': {
          const sections = ['assets', 'tables', 'contacts', 'metadata', 'designTokens', 'links', 'pageLinks', 'structuredData'];
          const response = await ctx.rpcClient.send('scrape.page', { ...p, sections });
          if (!response?.ok) return response;
          const data = unwrap(response);
          const assets = data?.assets ?? {};
          const contacts = data?.contacts ?? {};
          const metadata = data?.metadata ?? {};
          const tokens = data?.designTokens ?? {};
          const tables = Array.isArray(data?.tables) ? data.tables : [];
          const links = Array.isArray(data?.links) ? data.links : [];
          const pageLinks = Array.isArray(data?.pageLinks) ? data.pageLinks : [];
          const structuredData = Array.isArray(data?.structuredData) ? data.structuredData : [];
          const summary = {
            url: data?.url ?? metadata.url,
            title: data?.title ?? metadata.title,
            metadata: { hasDescription: Boolean(metadata.description), hasCanonical: Boolean(metadata.canonical), h1: metadata.summary?.h1 ?? 0, headings: metadata.summary?.headings ?? metadata.headings?.length ?? 0, jsonLd: metadata.summary?.jsonLd ?? metadata.jsonLd?.length ?? structuredData.length, invalidJsonLd: metadata.summary?.invalidJsonLd ?? 0 },
            assets: { images: assets.summary?.images ?? assets.images?.length ?? 0, videos: assets.summary?.videos ?? assets.videos?.length ?? 0, files: assets.summary?.files ?? assets.files?.length ?? 0, icons: assets.summary?.icons ?? assets.icons?.length ?? 0 },
            tables: { count: tables.length, totalRows: tables.reduce((total, table) => total + (table.rowCount ?? table.rows?.length ?? 0), 0) },
            contacts: { emails: contacts.summary?.emails ?? contacts.emails?.length ?? 0, phones: contacts.summary?.phones ?? contacts.phones?.length ?? 0, addresses: contacts.summary?.addresses ?? contacts.addresses?.length ?? 0, locations: contacts.summary?.locations ?? contacts.locations?.length ?? 0 },
            designTokens: { colors: tokens.summary?.colors ?? tokens.colors?.length ?? 0, fonts: tokens.summary?.fonts ?? tokens.fonts?.length ?? 0, cssVariables: tokens.summary?.cssVariables ?? tokens.cssVariables?.length ?? 0 },
            links: { total: links.length, sameOrigin: pageLinks.length },
            previews: { headings: (metadata.headings ?? []).slice(0, 8).map((heading) => ({ level: heading.level, text: heading.text })), files: (assets.files ?? []).slice(0, 8).map((file) => ({ type: file.type, label: file.label, url: file.url })), tables: tables.slice(0, 5).map((table) => ({ index: table.index, caption: table.caption, rows: table.rowCount, columns: table.columnCount })), topColors: (tokens.colors ?? []).slice(0, 8).map((color) => color.value), topFonts: (tokens.fonts ?? []).slice(0, 5).map((font) => font.value) },
          };
          const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'scrape_debug', tool: 'fileforge_scrape_action_debug', url: summary.url, project: p.project ?? 'default', data, summary });
          return { ok: true, ...stored, meta: { tool: 'fileforge_scrape_action', action, url: summary.url } };
        }
        case 'scrape_tabs': {
          const response = await ctx.rpcClient.send('scrape.tabs', p);
          return storedScrapeResponse({ params: p, tool: 'fileforge_scrape_action_tabs', prefix: 'scrape_tabs', response });
        }
        case 'scrape_urls': {
          if (!p.urls) throw new Error('urls is required for scrape_urls');
          const response = await ctx.rpcClient.send('scrape.urls', p);
          return storedScrapeResponse({ params: p, tool: 'fileforge_scrape_action_urls', prefix: 'scrape_urls', response });
        }
        case 'crawl_site': {
          if (!p.url) throw new Error('url is required for crawl_site');
          const response = await ctx.rpcClient.send('scrape.crawlSite', { maxPages: p.maxPages ?? 50, ...p });
          return storedScrapeResponse({ params: p, tool: 'fileforge_scrape_action_crawl', prefix: 'scrape_crawl', response, fallbackUrl: p.url });
        }
        case 'research_site': {
          if (!p.url) throw new Error('url is required for research_site');
          const response = await ctx.rpcClient.send('scrape.crawlSite', { sections: SECTIONS, maxPages: p.maxPages ?? 100, ...p });
          return storedScrapeResponse({ params: p, tool: 'fileforge_scrape_action_research', prefix: 'scrape_research', response, fallbackUrl: p.url });
        }
        case 'analyze_site': {
          if (!p.url) throw new Error('url is required for analyze_site');
          const response = await ctx.rpcClient.send('scrape.analyzeSite', p);
          return storedScrapeResponse({ params: p, tool: 'fileforge_scrape_action_analyze', prefix: 'scrape_analyze', response, fallbackUrl: p.url });
        }
        case 'extract_resource': {
          if (!p.url) throw new Error('url is required for extract_resource');
          const response = await ctx.rpcClient.send('scrape.extractResource', p);
          return storedScrapeResponse({ params: p, tool: 'fileforge_scrape_action_resource', prefix: 'scrape_resource', response, fallbackUrl: p.url });
        }
        default:
          return errorResponse('INVALID_ACTION', `Unknown action: ${rawAction}`);
      }
    },
  },
];

registry.registerMany(tools);
export { tools };
