import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeActionName,
  resolveScrapePreset,
  resolveScrapeQuery,
  validateScrapeQuery,
  resolveScrapeSource,
  projectFields,
  truncateText,
  classifyLink,
  normalizeTable,
  applyFilters,
  extractPage,
  extractMetadata,
  extractHeadings,
  extractLinks,
  extractImages,
  extractTables,
  extractJsonLd,
  extractContacts,
  buildContentQuality,
  buildScrapeWarnings,
  buildScrapeSummary,
  createScrapeSnapshot,
  compareScrapeSnapshots,
} from './scrape.js';

// ─── normalizeActionName ──────────────────────────────────────────────────────

test('normalizeActionName: dot-notation aliases', () => {
  assert.equal(normalizeActionName('scrape.page'), 'scrape_page');
  assert.equal(normalizeActionName('scrape.query'), 'query_scrape');
  assert.equal(normalizeActionName('scrape.links'), 'query_scrape_links_alias');
  assert.equal(normalizeActionName('scrape.tables'), 'query_scrape_tables_alias');
  assert.equal(normalizeActionName('scrape.compareSnapshots'), 'compare_scrape_snapshots');
});

test('normalizeActionName: short-name aliases', () => {
  assert.equal(normalizeActionName('query'), 'query_scrape');
  assert.equal(normalizeActionName('page'), 'query_scrape_page_alias');
  assert.equal(normalizeActionName('links'), 'query_scrape_links_alias');
  assert.equal(normalizeActionName('tables'), 'query_scrape_tables_alias');
});

test('normalizeActionName: canonical names pass through', () => {
  assert.equal(normalizeActionName('query_scrape'), 'query_scrape');
  assert.equal(normalizeActionName('scrape_page'), 'scrape_page');
  assert.equal(normalizeActionName('unknown_thing'), 'unknown_thing');
});

// ─── preset / query resolution ────────────────────────────────────────────────

test('resolveScrapePreset: known preset returns deep copy', () => {
  const r = resolveScrapePreset('basic');
  assert.ok(r.preset);
  assert.ok(r.preset.page);
});

test('resolveScrapePreset: unknown preset returns structured error', () => {
  const r = resolveScrapePreset('not_a_preset');
  assert.equal(r.error.ok, false);
  assert.equal(r.error.error.code, 'INVALID_PRESET');
  assert.ok(Array.isArray(r.error.error.allowedPresets));
});

test('resolveScrapeQuery: preset alone', () => {
  const { query } = resolveScrapeQuery({ preset: 'links' });
  assert.ok(query.links);
});

test('resolveScrapeQuery: query overrides preset section', () => {
  const { query } = resolveScrapeQuery({ preset: 'page', query: { page: { fields: ['title'] } } });
  assert.deepEqual(query.page.fields, ['title']);
});

test('resolveScrapeQuery: bare query', () => {
  const { query } = resolveScrapeQuery({ query: { links: true } });
  assert.equal(query.links, true);
});

// ─── validation ───────────────────────────────────────────────────────────────

test('validateScrapeQuery: rejects unknown section', () => {
  const err = validateScrapeQuery({ cookies: true });
  assert.equal(err.error.code, 'INVALID_FIELD');
  assert.match(err.error.path, /cookies/);
});

test('validateScrapeQuery: rejects unknown field', () => {
  const err = validateScrapeQuery({ links: { fields: ['text', 'cookies'] } });
  assert.equal(err.error.code, 'INVALID_FIELD');
  assert.match(err.error.message, /cookies/);
  assert.match(err.error.path, /links\.fields/);
});

test('validateScrapeQuery: rejects too-large limit', () => {
  const err = validateScrapeQuery({ links: { limit: 99999 } });
  assert.equal(err.error.code, 'LIMIT_EXCEEDED');
});

test('validateScrapeQuery: rejects maxTextChars over max', () => {
  const err = validateScrapeQuery({ page: { maxTextChars: 999999 } });
  assert.equal(err.error.code, 'LIMIT_EXCEEDED');
});

test('validateScrapeQuery: accepts well-formed query', () => {
  assert.equal(validateScrapeQuery({ page: true, links: { limit: 50 } }), null);
});

// ─── source resolution ───────────────────────────────────────────────────────

test('resolveScrapeSource: defaults to active_tab when omitted', () => {
  const { source } = resolveScrapeSource(undefined);
  assert.equal(source.type, 'active_tab');
});

test('resolveScrapeSource: rejects unknown type', () => {
  const { error } = resolveScrapeSource({ type: 'iframe' });
  assert.equal(error.error.code, 'INVALID_SOURCE');
});

test('resolveScrapeSource: url type requires url', () => {
  const { error } = resolveScrapeSource({ type: 'url' });
  assert.equal(error.error.code, 'INVALID_SOURCE');
});

test('resolveScrapeSource: html type currently unsupported', () => {
  const { error } = resolveScrapeSource({ type: 'html', html: '<p>x</p>' });
  assert.equal(error.error.code, 'INVALID_SOURCE');
});

// ─── helpers ─────────────────────────────────────────────────────────────────

test('projectFields: keeps only listed fields', () => {
  assert.deepEqual(projectFields({ a: 1, b: 2, c: 3 }, ['a', 'c']), { a: 1, c: 3 });
});

test('truncateText: respects max length', () => {
  assert.equal(truncateText('hello world', 5), 'hello');
  assert.equal(truncateText('short', 100), 'short');
});

test('classifyLink: javascript link', () => {
  assert.deepEqual(classifyLink({ href: 'javascript:void(0)' }, 'https://a.com'), { type: 'javascript', intent: 'unknown' });
});

test('classifyLink: external social', () => {
  const c = classifyLink({ href: 'https://twitter.com/foo', text: 'Follow us' }, 'https://example.com');
  assert.equal(c.type, 'social');
  assert.equal(c.intent, 'social');
});

test('classifyLink: internal navigation', () => {
  const c = classifyLink({ href: 'https://example.com/about', text: 'About' }, 'https://example.com');
  assert.equal(c.type, 'internal');
});

test('classifyLink: signup intent inferred from text', () => {
  const c = classifyLink({ href: 'https://example.com/signup', text: 'Sign up free' }, 'https://example.com');
  assert.equal(c.intent, 'signup');
});

test('classifyLink: mailto → email/contact', () => {
  assert.deepEqual(classifyLink({ href: 'mailto:hi@x.com' }, 'https://x.com'), { type: 'email', intent: 'contact' });
});

// ─── normalizeTable ──────────────────────────────────────────────────────────

test('normalizeTable: renders markdown and csv', () => {
  const t = normalizeTable({ headers: ['A', 'B'], rows: [['1', '2'], ['3', '4']], selector: 't1' }, 100);
  assert.equal(t.rowCount, 2);
  assert.match(t.markdown, /\| A \| B \|/);
  assert.match(t.csv, /"A","B"/);
});

test('normalizeTable: maxRows truncates and marks', () => {
  const t = normalizeTable({ headers: ['A'], rows: [['1'], ['2'], ['3']] }, 2);
  assert.equal(t.rowCount, 2);
  assert.equal(t.truncated, true);
});

// ─── applyFilters ────────────────────────────────────────────────────────────

test('applyFilters: external + visible', () => {
  const out = applyFilters(
    [
      { text: 'a', href: 'https://x.com', external: true, visible: true },
      { text: 'b', href: '/x', external: false, visible: true },
      { text: 'c', href: 'https://y.com', external: true, visible: false },
    ],
    { external: true, visible: true },
    'link',
  );
  assert.equal(out.length, 1);
});

test('applyFilters: textIncludes case-insensitive', () => {
  const out = applyFilters([{ text: 'Sign Up' }, { text: 'Buy' }], { textIncludes: 'sign' });
  assert.equal(out.length, 1);
});

// ─── extractors with fake raw ────────────────────────────────────────────────

function fakeRaw(overrides = {}) {
  return {
    url: 'https://example.com/',
    title: 'Example',
    text: 'Hello world. '.repeat(50),
    links: [
      { href: 'https://example.com/about', text: 'About' },
      { href: 'https://twitter.com/foo', text: 'Twitter' },
      { href: 'javascript:void(0)', text: 'JS' },
      { href: '', text: 'Empty' },
    ],
    pageLinks: [{ href: 'https://example.com/about', text: 'About' }],
    images: [
      { src: 'https://example.com/a.png', alt: 'A', width: 100, height: 100 },
      { src: 'https://example.com/b.png', alt: '', width: 200, height: 200 },
    ],
    tables: [
      { headers: ['name', 'price'], rows: [['Pro', '$10'], ['Free', '$0']], selector: 'table:nth-of-type(1)' },
    ],
    contacts: { emails: [{ value: 'a@b.com' }], phones: [{ value: '+1 555 0000' }] },
    metadata: {
      title: 'Example',
      description: 'An example page',
      canonical: 'https://example.com/',
      headings: [
        { level: 1, text: 'Hero', selector: 'h1' },
        { level: 2, text: 'Features', selector: 'h2' },
        { level: 1, text: 'Second H1', selector: 'h1:nth-of-type(2)' },
      ],
      jsonLd: [
        { parsed: { '@type': 'Product', name: 'Widget', description: 'A widget' }, index: 0 },
      ],
      og: {}, twitter: {}, metaTags: [], links: [], alternates: [],
    },
    ...overrides,
  };
}

test('extractPage: applies maxTextChars and computes wordCount', () => {
  const page = extractPage(fakeRaw(), { maxTextChars: 50 });
  assert.ok(page.mainText.length <= 50);
  assert.equal(typeof page.wordCount, 'number');
  assert.equal(page.title, 'Example');
});

test('extractPage: fields projection', () => {
  const page = extractPage(fakeRaw(), { fields: ['title'] });
  assert.deepEqual(Object.keys(page), ['title']);
});

test('extractMetadata: returns canonical/description', () => {
  const md = extractMetadata(fakeRaw(), true);
  assert.equal(md.canonical, 'https://example.com/');
  assert.equal(md.description, 'An example page');
});

test('extractHeadings: filters by level', () => {
  const out = extractHeadings(fakeRaw(), { levels: [1] });
  const items = Array.isArray(out) ? out : out.items;
  assert.equal(items.length, 2);
});

test('extractLinks: classifies and projects', () => {
  const out = extractLinks(fakeRaw(), { fields: ['text', 'href', 'type'] });
  const items = Array.isArray(out) ? out : out.items;
  const social = items.find((i) => i.type === 'social');
  assert.ok(social);
});

test('extractLinks: filter external=true', () => {
  const out = extractLinks(fakeRaw(), { where: { external: true } });
  const items = Array.isArray(out) ? out : out.items;
  assert.ok(items.every((i) => i.external));
});

test('extractImages: limit + truncation metadata', () => {
  const out = extractImages(fakeRaw(), { limit: 1 });
  assert.equal(out.truncated, true);
  assert.equal(out.totalMatched, 2);
});

test('extractTables: returns headers/rows/markdown', () => {
  const out = extractTables(fakeRaw(), true);
  const items = Array.isArray(out) ? out : out.items;
  assert.equal(items[0].columnCount, 2);
  assert.match(items[0].markdown, /name/);
});

test('extractJsonLd: extracts type', () => {
  const out = extractJsonLd(fakeRaw(), true);
  const items = Array.isArray(out) ? out : out.items;
  assert.equal(items[0].schemaType, 'Product');
});

test('extractJsonLd: malformed JSON-LD flagged invalid', () => {
  const raw = fakeRaw();
  raw.metadata.jsonLd = [{ error: 'Unexpected token', index: 0 }];
  const out = extractJsonLd(raw, true);
  const items = Array.isArray(out) ? out : out.items;
  assert.equal(items[0].valid, false);
});

test('extractContacts: socials grouped from links', () => {
  const c = extractContacts(fakeRaw(), { includeEmails: true, includePhones: true, includeSocials: true });
  assert.ok(c.emails.includes('a@b.com'));
  assert.equal(c.socials.x.length, 1);
});

// ─── warnings & quality ──────────────────────────────────────────────────────

test('buildScrapeWarnings: multiple H1 warning', () => {
  const w = buildScrapeWarnings(fakeRaw(), {});
  assert.ok(w.some((x) => x.code === 'MULTIPLE_H1'));
});

test('buildScrapeWarnings: missing alt warning', () => {
  const w = buildScrapeWarnings(fakeRaw(), {});
  assert.ok(w.some((x) => x.code === 'IMAGE_MISSING_ALT'));
});

test('buildScrapeWarnings: javascript link warning', () => {
  const w = buildScrapeWarnings(fakeRaw(), {});
  assert.ok(w.some((x) => x.code === 'JAVASCRIPT_LINK'));
});

test('buildContentQuality: counts headings and links', () => {
  const q = buildContentQuality(fakeRaw());
  assert.equal(q.h1Count, 2);
  assert.equal(q.headingCount, 3);
});

test('buildScrapeSummary: rolls up totals', () => {
  const linksOut = extractLinks(fakeRaw(), true);
  const response = { links: linksOut, images: extractImages(fakeRaw(), true), tables: extractTables(fakeRaw(), true), jsonLd: extractJsonLd(fakeRaw(), true), page: extractPage(fakeRaw(), true), warnings: [] };
  const s = buildScrapeSummary(fakeRaw(), response);
  assert.equal(typeof s.totalLinks, 'number');
  assert.equal(s.hasJsonLd, true);
});

// ─── snapshots ───────────────────────────────────────────────────────────────

test('createScrapeSnapshot + compareScrapeSnapshots: detects changes', () => {
  const r1 = {
    source: { url: 'https://example.com/' },
    metadata: extractMetadata(fakeRaw(), true),
    headings: extractHeadings(fakeRaw(), true),
    links: extractLinks(fakeRaw(), true),
    jsonLd: extractJsonLd(fakeRaw(), true),
    page: extractPage(fakeRaw(), true),
    warnings: [{ code: 'MISSING_CANONICAL' }],
  };
  const before = createScrapeSnapshot(r1);

  const raw2 = fakeRaw({ title: 'Example v2', metadata: { ...fakeRaw().metadata, title: 'Example v2', description: 'Updated', headings: [{ level: 1, text: 'New', selector: 'h1' }] } });
  const r2 = {
    source: { url: 'https://example.com/' },
    metadata: extractMetadata(raw2, true),
    headings: extractHeadings(raw2, true),
    links: extractLinks(raw2, true),
    jsonLd: extractJsonLd(raw2, true),
    page: extractPage(raw2, true),
    warnings: [],
  };
  const after = createScrapeSnapshot(r2);

  const diff = compareScrapeSnapshots(before.id, after.id);
  assert.equal(diff.ok, true);
  assert.equal(diff.changed, true);
  assert.equal(diff.changes.titleChanged, true);
  assert.equal(diff.changes.descriptionChanged, true);
  assert.equal(diff.changes.headingsChanged, true);
  assert.ok(diff.changes.warningsResolved.includes('MISSING_CANONICAL'));
});

test('compareScrapeSnapshots: missing snapshot → SNAPSHOT_NOT_FOUND', () => {
  const r = compareScrapeSnapshots('scrape_nope', 'scrape_alsonope');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'SNAPSHOT_NOT_FOUND');
});

// ─── handler integration via mock rpcClient ──────────────────────────────────

function makeRpc(returnValue) {
  const calls = [];
  return {
    client: {
      send: async (method, params) => {
        calls.push({ method, params });
        return typeof returnValue === 'function' ? returnValue(method, params) : returnValue;
      },
    },
    calls,
  };
}

async function callHandler(action, params = {}, rpcReturn) {
  const { tools } = await import('./scrape.js');
  const tool = tools[0];
  const { client, calls } = makeRpc(rpcReturn ?? { ok: true, data: fakeRaw() });
  const result = await tool.handler({ action, ...params }, { rpcClient: client });
  return { result, calls };
}

test('handler: query_scrape with preset=basic returns schema v1', async () => {
  const { result } = await callHandler('query_scrape', { preset: 'basic' });
  assert.equal(result.ok, true);
  assert.equal(result.schemaVersion, 'scrape.query.v1');
  assert.ok(result.page);
  assert.ok(result.summary);
});

test('handler: query_scrape via alias scrape.query', async () => {
  const { result } = await callHandler('scrape.query', { preset: 'basic' });
  assert.equal(result.ok, true);
});

test('handler: short alias "links" maps to preset:links', async () => {
  const { result } = await callHandler('links');
  assert.equal(result.ok, true);
  assert.ok(result.links);
});

test('handler: short alias "tables" maps to preset:tables', async () => {
  const { result } = await callHandler('tables');
  assert.equal(result.ok, true);
  assert.ok(result.tables);
});

test('handler: short alias "page" maps to preset:page', async () => {
  const { result } = await callHandler('page');
  assert.equal(result.ok, true);
  assert.ok(result.page);
});

test('handler: invalid preset rejected', async () => {
  const { result } = await callHandler('query_scrape', { preset: 'not_real' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_PRESET');
});

test('handler: invalid field rejected', async () => {
  const { result } = await callHandler('query_scrape', { query: { links: { fields: ['cookies'] } } });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_FIELD');
});

test('handler: invalid limit rejected', async () => {
  const { result } = await callHandler('query_scrape', { query: { links: { limit: 99999 } } });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'LIMIT_EXCEEDED');
});

test('handler: query_scrape filtered external links', async () => {
  const { result } = await callHandler('query_scrape', {
    query: { links: { where: { external: true }, fields: ['text', 'href', 'type'] } },
  });
  const items = Array.isArray(result.links) ? result.links : result.links.items;
  assert.ok(items.every((l) => l.type === 'external' || l.type === 'social'));
});

test('handler: query_scrape custom page + links + tables', async () => {
  const { result } = await callHandler('query_scrape', {
    query: { page: { fields: ['title'] }, links: true, tables: true },
  });
  assert.ok(result.page);
  assert.ok(result.links);
  assert.ok(result.tables);
});

test('handler: landing_page_audit preset returns rich sections', async () => {
  const { result } = await callHandler('query_scrape', { preset: 'landing_page_audit' });
  assert.equal(result.ok, true);
  assert.ok(result.metadata);
  assert.ok(result.summary);
  assert.ok(Array.isArray(result.warnings));
});

test('handler: seo_audit preset includes warnings', async () => {
  const { result } = await callHandler('query_scrape', { preset: 'seo_audit' });
  assert.ok(Array.isArray(result.warnings));
});

test('handler: contact_discovery preset returns contacts', async () => {
  const { result } = await callHandler('query_scrape', { preset: 'contact_discovery' });
  assert.ok(result.contacts);
  assert.ok(Array.isArray(result.contacts.emails));
});

test('handler: structured_data preset returns jsonLd', async () => {
  const { result } = await callHandler('query_scrape', { preset: 'structured_data' });
  assert.ok(result.jsonLd);
});

test('handler: snapshot:true returns scrapeSnapshotId', async () => {
  const { result } = await callHandler('query_scrape', { query: { page: true, snapshot: true } });
  assert.ok(result.scrapeSnapshotId);
  assert.ok(result.hashes?.page);
});

test('handler: compare_scrape_snapshots requires both ids', async () => {
  const { result } = await callHandler('compare_scrape_snapshots', { beforeSnapshotId: 'a' });
  assert.equal(result.ok, false);
});

test('handler: legacy scrape_page still works', async () => {
  const { result, calls } = await callHandler('scrape_page', {});
  assert.equal(result.ok, true);
  assert.equal(calls[0].method, 'scrape.page');
});

test('handler: scrape.page dotted alias routes to legacy scrape_page', async () => {
  const { result, calls } = await callHandler('scrape.page', {});
  assert.equal(result.ok, true);
  assert.equal(calls[0].method, 'scrape.page');
});

test('handler: query_scrape uses url source via scrape.urls RPC', async () => {
  const rpc = (method) => {
    if (method === 'scrape.urls') return { ok: true, data: { results: [fakeRaw()] } };
    return { ok: true, data: fakeRaw() };
  };
  const { result, calls } = await callHandler('query_scrape', { source: { type: 'url', url: 'https://example.com/' }, preset: 'basic' }, rpc);
  assert.equal(result.ok, true);
  assert.ok(calls.some((c) => c.method === 'scrape.urls'));
});
