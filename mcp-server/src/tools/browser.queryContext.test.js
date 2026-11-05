import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeActionName,
  validateQuery,
  applyTabFilters,
  projectFields,
  buildSummary,
  redactSensitiveTabData,
  resolveBrowserContextQuery,
  PRESETS,
  ALLOWED_TAB_FIELDS,
  ALLOWED_WINDOW_FIELDS,
  ALLOWED_SUMMARY_FIELDS,
  MAX_LIMIT,
} from './browser.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TAB_INSTAGRAM = { id: 31, url: 'https://instagram.com/', title: 'Instagram', status: 'complete', windowId: 1, isActive: true, isPinned: false, isAudible: false, isMuted: false, incognito: false, canGoBack: null, canGoForward: null };
const TAB_GOOGLE = { id: 32, url: 'https://google.com/search?q=test', title: 'test - Google Search', status: 'complete', windowId: 1, isActive: false, isPinned: false, isAudible: false, isMuted: false, incognito: false, canGoBack: null, canGoForward: null };
const TAB_YOUTUBE = { id: 33, url: 'https://youtube.com/watch?v=abc', title: 'Video - YouTube', status: 'loading', windowId: 2, isActive: false, isPinned: false, isAudible: true, isMuted: false, incognito: false, canGoBack: null, canGoForward: null };
const TAB_DUPE = { id: 34, url: 'https://instagram.com/', title: 'Instagram', status: 'complete', windowId: 2, isActive: false, isPinned: false, isAudible: false, isMuted: false, incognito: false, canGoBack: null, canGoForward: null };
const TAB_LOGIN = { id: 35, url: 'https://example.com/login', title: 'Login — Example', status: 'complete', windowId: 1, isActive: false, isPinned: false, isAudible: false, isMuted: false, incognito: false, canGoBack: null, canGoForward: null };

const ALL_TABS = [TAB_INSTAGRAM, TAB_GOOGLE, TAB_YOUTUBE, TAB_DUPE, TAB_LOGIN];
const WINDOWS = [
  { id: 1, focused: true, tabCount: 3, incognito: false, type: 'normal', state: 'normal' },
  { id: 2, focused: false, tabCount: 2, incognito: false, type: 'normal', state: 'normal' },
];
const RAW_DATA = { tabs: ALL_TABS, windows: WINDOWS, activeTabId: 31, focusedWindowId: 1 };

// ─── normalizeActionName ──────────────────────────────────────────────────────

test('normalizeActionName: merges open_url + navigate_url → navigate', () => {
  assert.equal(normalizeActionName('open_url'), 'navigate');
  assert.equal(normalizeActionName('navigate_url'), 'navigate');
  assert.equal(normalizeActionName('browser.openUrl'), 'navigate');
  assert.equal(normalizeActionName('browser.navigateUrl'), 'navigate');
});

test('normalizeActionName: merges go_back + go_forward → history', () => {
  assert.equal(normalizeActionName('go_back'), 'history');
  assert.equal(normalizeActionName('go_forward'), 'history');
  assert.equal(normalizeActionName('browser.goBack'), 'history');
  assert.equal(normalizeActionName('browser.goForward'), 'history');
});

test('normalizeActionName: merges wait_for_* → wait', () => {
  assert.equal(normalizeActionName('wait_for_load'), 'wait');
  assert.equal(normalizeActionName('wait_for_url'), 'wait');
  assert.equal(normalizeActionName('wait_for_idle'), 'wait');
  assert.equal(normalizeActionName('browser.waitForLoad'), 'wait');
  assert.equal(normalizeActionName('browser.waitForUrl'), 'wait');
  assert.equal(normalizeActionName('browser.waitForIdle'), 'wait');
});

test('normalizeActionName: unchanged camelCase dot-notation aliases', () => {
  assert.equal(normalizeActionName('browser.activateTab'), 'activate_tab');
  assert.equal(normalizeActionName('browser.closeTab'), 'close_tab');
  assert.equal(normalizeActionName('browser.reloadTab'), 'reload_tab');
  assert.equal(normalizeActionName('browser.queryContext'), 'query_context');
  assert.equal(normalizeActionName('browser.closeTabsMatching'), 'close_tabs_matching');
});

test('normalizeActionName: passes through canonical names unchanged', () => {
  assert.equal(normalizeActionName('navigate'), 'navigate');
  assert.equal(normalizeActionName('history'), 'history');
  assert.equal(normalizeActionName('wait'), 'wait');
  assert.equal(normalizeActionName('query_context'), 'query_context');
  assert.equal(normalizeActionName('unknown_action'), 'unknown_action');
});

// ─── validateQuery ────────────────────────────────────────────────────────────

test('validateQuery: returns null for a valid query', () => {
  assert.equal(validateQuery({
    activeTab: { fields: ['id', 'url', 'title'] },
    tabs: { where: { urlIncludes: 'instagram.com' }, fields: ['id', 'url'], limit: 10 },
    summary: true,
  }), null);
});

test('validateQuery: rejects unknown query sections', () => {
  const err = validateQuery({ history: true });
  assert.equal(err?.code, 'INVALID_SECTION');
  assert.match(err.message, /history/);
});

test('validateQuery: rejects disallowed tabs.fields', () => {
  const err = validateQuery({ tabs: { fields: ['id', 'cookies'] } });
  assert.equal(err?.code, 'INVALID_FIELD');
  assert.match(err.message, /cookies/);
  assert.equal(err.path, 'query.tabs.fields[1]');
});

test('validateQuery: rejects disallowed summary.include fields', () => {
  const err = validateQuery({ summary: { include: ['totalTabs', 'bookmarks'] } });
  assert.equal(err?.code, 'INVALID_FIELD');
  assert.match(err.message, /bookmarks/);
});

test('validateQuery: rejects unknown where filters', () => {
  const err = validateQuery({ tabs: { where: { localStorage: 'foo' } } });
  assert.equal(err?.code, 'INVALID_FILTER');
  assert.match(err.message, /localStorage/);
});

test('validateQuery: rejects tabs.limit above MAX_LIMIT', () => {
  const err = validateQuery({ tabs: { limit: MAX_LIMIT + 1 } });
  assert.equal(err?.code, 'LIMIT_EXCEEDED');
  assert.equal(err.maxLimit, MAX_LIMIT);
});

test('validateQuery: accepts tabs.limit at MAX_LIMIT', () => {
  assert.equal(validateQuery({ tabs: { limit: MAX_LIMIT } }), null);
});

test('validateQuery: null/undefined returns null', () => {
  assert.equal(validateQuery(null), null);
  assert.equal(validateQuery(undefined), null);
});

// ─── applyTabFilters ──────────────────────────────────────────────────────────

test('applyTabFilters: returns all tabs when no where clause', () => {
  assert.equal(applyTabFilters(ALL_TABS, undefined).length, ALL_TABS.length);
});

test('applyTabFilters: filters by urlIncludes', () => {
  const result = applyTabFilters(ALL_TABS, { urlIncludes: 'instagram.com' });
  assert.equal(result.length, 2);
  assert.ok(result.every((t) => t.url.includes('instagram.com')));
});

test('applyTabFilters: filters by windowId', () => {
  const result = applyTabFilters(ALL_TABS, { windowId: 2 });
  assert.equal(result.length, 2);
  assert.ok(result.every((t) => t.windowId === 2));
});

test('applyTabFilters: filters by status', () => {
  const result = applyTabFilters(ALL_TABS, { status: 'loading' });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 33);
});

test('applyTabFilters: filters by isActive', () => {
  const result = applyTabFilters(ALL_TABS, { isActive: true });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 31);
});

test('applyTabFilters: combines multiple filters (AND)', () => {
  const result = applyTabFilters(ALL_TABS, { urlIncludes: 'instagram.com', windowId: 1 });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 31);
});

// ─── projectFields ────────────────────────────────────────────────────────────

test('projectFields: returns only requested fields', () => {
  const result = projectFields(TAB_INSTAGRAM, ['id', 'url', 'title'], ALLOWED_TAB_FIELDS);
  assert.deepEqual(result, { id: 31, url: 'https://instagram.com/', title: 'Instagram' });
});

test('projectFields: silently drops disallowed fields in the allowed set', () => {
  const result = projectFields({ id: 1, secret: 'x' }, ['id', 'secret'], ALLOWED_TAB_FIELDS);
  assert.ok(!('secret' in result));
  assert.equal(result.id, 1);
});

test('projectFields: returns null for null input', () => {
  assert.equal(projectFields(null, ['id'], ALLOWED_TAB_FIELDS), null);
});

// ─── redactSensitiveTabData ───────────────────────────────────────────────────

test('redactSensitiveTabData: redacts login URLs', () => {
  const result = redactSensitiveTabData(TAB_LOGIN, true);
  assert.equal(result.url, 'redacted');
  assert.equal(result.title, 'redacted');
  assert.equal(result.sensitive, true);
  assert.equal(result.id, 35);
});

test('redactSensitiveTabData: does not redact non-sensitive URLs', () => {
  const result = redactSensitiveTabData(TAB_INSTAGRAM, true);
  assert.equal(result.url, 'https://instagram.com/');
  assert.ok(!result.sensitive);
});

test('redactSensitiveTabData: skips redaction when redact=false', () => {
  const result = redactSensitiveTabData(TAB_LOGIN, false);
  assert.equal(result.url, 'https://example.com/login');
  assert.ok(!result.sensitive);
});

test('redactSensitiveTabData: handles null tab', () => {
  assert.equal(redactSensitiveTabData(null, true), null);
});

// ─── buildSummary ─────────────────────────────────────────────────────────────

test('buildSummary: computes totalTabs and activeTabId', () => {
  const summary = buildSummary(ALL_TABS, WINDOWS, 31, 1, true);
  assert.equal(summary.totalTabs, 5);
  assert.equal(summary.activeTabId, 31);
  assert.equal(summary.focusedWindowId, 1);
});

test('buildSummary: detects loading tabs', () => {
  const summary = buildSummary(ALL_TABS, WINDOWS, 31, 1, true);
  assert.equal(summary.hasLoadingTabs, true);
});

test('buildSummary: returns hasLoadingTabs=false when none loading', () => {
  const noLoading = ALL_TABS.filter((t) => t.status !== 'loading');
  const summary = buildSummary(noLoading, WINDOWS, 31, 1, true);
  assert.equal(summary.hasLoadingTabs, false);
});

test('buildSummary: identifies duplicate URL groups', () => {
  const summary = buildSummary(ALL_TABS, WINDOWS, 31, 1, true);
  assert.equal(summary.duplicateUrlGroups.length, 1);
  assert.equal(summary.duplicateUrlGroups[0].url, 'https://instagram.com/');
  assert.deepEqual(summary.duplicateUrlGroups[0].tabIds.sort(), [31, 34]);
});

test('buildSummary: identifies social tabs', () => {
  const summary = buildSummary(ALL_TABS, WINDOWS, 31, 1, true);
  assert.ok(summary.likelySocialTabs.includes(31));
  assert.ok(summary.likelySocialTabs.includes(34));
  assert.ok(!summary.likelySocialTabs.includes(32));
});

test('buildSummary: identifies search tabs', () => {
  const summary = buildSummary(ALL_TABS, WINDOWS, 31, 1, true);
  assert.ok(summary.likelySearchTabs.includes(32));
  assert.ok(!summary.likelySearchTabs.includes(31));
});

test('buildSummary: identifies video tabs', () => {
  const summary = buildSummary(ALL_TABS, WINDOWS, 31, 1, true);
  assert.ok(summary.likelyVideoTabs.includes(33));
});

test('buildSummary: respects include list', () => {
  const summary = buildSummary(ALL_TABS, WINDOWS, 31, 1, { include: ['totalTabs', 'activeTabId'] });
  assert.equal(summary.totalTabs, 5);
  assert.equal(summary.activeTabId, 31);
  assert.ok(!('hasLoadingTabs' in summary));
  assert.ok(!('duplicateUrlGroups' in summary));
});

// ─── resolveBrowserContextQuery ───────────────────────────────────────────────

test('resolveBrowserContextQuery: preset basic returns activeTab, tabs, summary', () => {
  const result = resolveBrowserContextQuery(RAW_DATA, PRESETS.basic);
  assert.ok('activeTab' in result);
  assert.ok('tabs' in result);
  assert.ok('summary' in result);
  assert.ok(!('windows' in result));
  assert.equal(result.activeTab.id, 31);
  assert.ok(result.tabs.length > 0);
});

test('resolveBrowserContextQuery: preset active_only returns only activeTab', () => {
  const result = resolveBrowserContextQuery(RAW_DATA, PRESETS.active_only);
  assert.ok('activeTab' in result);
  assert.ok(!('tabs' in result));
  assert.ok(!('summary' in result));
  assert.ok(!('windows' in result));
});

test('resolveBrowserContextQuery: preset recovery_state returns all sections', () => {
  const result = resolveBrowserContextQuery(RAW_DATA, PRESETS.recovery_state);
  assert.ok('activeTab' in result);
  assert.ok('tabs' in result);
  assert.ok('windows' in result);
  assert.ok('summary' in result);
  assert.ok('likelySocialTabs' in result.summary);
  assert.ok('duplicateUrlGroups' in result.summary);
});

test('resolveBrowserContextQuery: custom query with activeTab + tabs where urlIncludes', () => {
  const result = resolveBrowserContextQuery(RAW_DATA, {
    activeTab: { fields: ['id', 'url', 'title'] },
    tabs: { where: { urlIncludes: 'instagram.com' }, fields: ['id', 'url', 'title', 'status', 'windowId', 'isActive'] },
  });
  assert.equal(result.activeTab.id, 31);
  assert.equal(result.tabs.length, 2);
  assert.ok(result.tabs.every((t) => t.url.includes('instagram.com')));
  assert.ok(!('summary' in result));
});

test('resolveBrowserContextQuery: limit is respected', () => {
  const result = resolveBrowserContextQuery(RAW_DATA, { tabs: { limit: 2 } });
  assert.equal(result.tabs.length, 2);
});

test('resolveBrowserContextQuery: redacts login tab by default', () => {
  const result = resolveBrowserContextQuery(RAW_DATA, { tabs: true });
  const loginTab = result.tabs.find((t) => t.id === 35);
  assert.equal(loginTab?.url, 'redacted');
  assert.equal(loginTab?.sensitive, true);
});

test('resolveBrowserContextQuery: does not redact when redactSensitiveUrls=false', () => {
  const result = resolveBrowserContextQuery(RAW_DATA, {
    tabs: { fields: ['id', 'url', 'title', 'status', 'windowId', 'isActive'] },
    privacy: { redactSensitiveUrls: false },
  });
  const loginTab = result.tabs.find((t) => t.id === 35);
  assert.equal(loginTab?.url, 'https://example.com/login');
  assert.ok(!loginTab?.sensitive);
});

test('resolveBrowserContextQuery: duplicate URL groups exclude redacted tabs', () => {
  const result = resolveBrowserContextQuery(RAW_DATA, {
    tabs: { fields: ['id', 'url', 'title', 'status', 'windowId', 'isActive'] },
    summary: { include: ['duplicateUrlGroups'] },
  });
  // redacted tabs have url='redacted', should not be counted as duplicates of each other
  const groups = result.summary.duplicateUrlGroups;
  assert.ok(groups.every((g) => g.url !== 'redacted'));
});

test('resolveBrowserContextQuery: windows section returned when requested', () => {
  const result = resolveBrowserContextQuery(RAW_DATA, { windows: { fields: ['id', 'focused', 'tabCount'] } });
  assert.ok(Array.isArray(result.windows));
  assert.equal(result.windows.length, 2);
  assert.ok(result.windows[0].focused === true || result.windows[0].focused === false);
});

// ─── PRESETS structure ────────────────────────────────────────────────────────

test('PRESETS: all seven presets are defined', () => {
  const expected = ['basic', 'active_only', 'snapshot', 'tabs_compact', 'navigation_state', 'dedupe_state', 'recovery_state'];
  for (const name of expected) {
    assert.ok(name in PRESETS, `missing preset: ${name}`);
  }
  assert.ok(!('tabs_verbose' in PRESETS), 'tabs_verbose should be removed');
});

test('PRESETS: basic has tab limit of 25 and no navigation fields', () => {
  assert.equal(PRESETS.basic.tabs.limit, 25);
  assert.ok(!PRESETS.basic.activeTab.fields.includes('canGoBack'), 'basic should not request canGoBack (cheap path)');
});

test('PRESETS: snapshot has navigation fields on activeTab', () => {
  assert.ok(PRESETS.snapshot.activeTab.fields.includes('canGoBack'));
  assert.ok(PRESETS.snapshot.activeTab.fields.includes('canGoForward'));
  assert.equal(PRESETS.snapshot.tabs.limit, 20);
});

test('PRESETS: navigation_state has canGoBack + canGoForward on activeTab', () => {
  assert.ok(PRESETS.navigation_state.activeTab.fields.includes('canGoBack'));
  assert.ok(PRESETS.navigation_state.activeTab.fields.includes('canGoForward'));
});

test('PRESETS: dedupe_state has tab limit of 100 (== MAX_LIMIT)', () => {
  assert.equal(PRESETS.dedupe_state.tabs.limit, MAX_LIMIT);
});

test('PRESETS: recovery_state includes summary with likelySocialTabs', () => {
  assert.ok(PRESETS.recovery_state.summary.include.includes('likelySocialTabs'));
});
