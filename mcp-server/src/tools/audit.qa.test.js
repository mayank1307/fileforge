import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeActionName,
  resolveAuditPreset,
  resolveAuditQuery,
  validateAuditQuery,
  resolveAuditTarget,
  projectFields,
  applyIssueFilters,
  normalizeIssues,
  makeIssue,
  scoreAudit,
  gradeForScore,
  buildGrades,
  buildRoadmap,
  buildMarkdownReport,
  buildReport,
  buildAuditSummary,
  redactSensitiveData,
  createAuditSnapshot,
  getAuditSnapshot,
  compareAuditSnapshots,
  runSeoAudit,
  runTechnicalAudit,
  runStructuredDataAudit,
  handleQueryAudit,
  handleCompareAuditSnapshots,
  PRESETS,
  SEVERITIES,
} from './auditQuery.js';

// ─── Action alias normalization ───────────────────────────────────────────────

test('normalizeActionName resolves dot-notation aliases', () => {
  assert.equal(normalizeActionName('audit.query'), 'query_audit');
  assert.equal(normalizeActionName('audit.run'), 'query_audit');
  assert.equal(normalizeActionName('audit.compareSnapshots'), 'compare_audit_snapshots');
  assert.equal(normalizeActionName('query_audit'), 'query_audit');
  assert.equal(normalizeActionName('unknown_thing'), 'unknown_thing');
});

// ─── Preset resolution ────────────────────────────────────────────────────────

test('resolveAuditPreset returns deep copy of named preset', () => {
  const res = resolveAuditPreset('quick_audit');
  assert.ok(res.preset);
  assert.equal(res.preset.scores, true);
  // mutating must not corrupt source preset
  res.preset.scores = false;
  assert.equal(PRESETS.quick_audit.scores, true);
});

test('resolveAuditPreset rejects unknown preset', () => {
  const res = resolveAuditPreset('nope_audit');
  assert.equal(res.error.ok, false);
  assert.equal(res.error.error.code, 'INVALID_PRESET');
});

test('resolveAuditQuery merges preset with override query', () => {
  const { query } = resolveAuditQuery({ preset: 'quick_audit', query: { issues: { limit: 25 } } });
  assert.equal(query.scores, true);
  assert.equal(query.issues.limit, 25);
});

test('resolveAuditQuery returns default when nothing given', () => {
  const { query } = resolveAuditQuery({});
  assert.deepEqual(query, { page: true, summary: true });
});

// ─── Validation ───────────────────────────────────────────────────────────────

test('validateAuditQuery rejects unknown modules', () => {
  const err = validateAuditQuery({ bogus: true });
  assert.equal(err.error.code, 'INVALID_FIELD');
  assert.equal(err.error.path, 'query.bogus');
});

test('validateAuditQuery rejects unknown fields in module', () => {
  const err = validateAuditQuery({ technical: { fields: ['consoleErrors', 'cookies'] } });
  assert.equal(err.error.code, 'INVALID_FIELD');
  assert.match(err.error.message, /not allowed in technical\.fields/);
});

test('validateAuditQuery rejects unknown accessibility standard', () => {
  const err = validateAuditQuery({ accessibility: { standard: 'WCAG3' } });
  assert.equal(err.error.code, 'INVALID_FIELD');
});

test('validateAuditQuery rejects invalid severity filter', () => {
  const err = validateAuditQuery({ issues: { where: { severityIn: ['fatal'] } } });
  assert.equal(err.error.code, 'INVALID_FILTER');
});

test('validateAuditQuery rejects oversized issues.limit', () => {
  const err = validateAuditQuery({ issues: { limit: 99999 } });
  assert.equal(err.error.code, 'INVALID_LIMIT');
});

test('validateAuditQuery rejects oversized crawl.maxPages', () => {
  const err = validateAuditQuery({ crawl: { enabled: true, maxPages: 10000 } });
  assert.equal(err.error.code, 'INVALID_LIMIT');
});

test('validateAuditQuery rejects invalid report format', () => {
  const err = validateAuditQuery({ report: { formats: ['pdf'] } });
  assert.equal(err.error.code, 'INVALID_FIELD');
});

test('validateAuditQuery passes on valid full query', () => {
  const err = validateAuditQuery({
    page: { fields: ['url', 'title'] },
    seo: { fields: ['title', 'description'], includeIssues: true },
    accessibility: { standard: 'WCAG2AA', includeFixSuggestions: true },
    issues: { where: { severityIn: ['critical', 'high'] }, limit: 50 },
    scores: true,
  });
  assert.equal(err, null);
});

// ─── Target resolution ────────────────────────────────────────────────────────

test('resolveAuditTarget defaults to active_tab', () => {
  const res = resolveAuditTarget();
  assert.deepEqual(res.target, { type: 'active_tab' });
});

test('resolveAuditTarget rejects unsupported type', () => {
  const res = resolveAuditTarget({ type: 'file' });
  assert.equal(res.error.error.code, 'INVALID_TARGET');
});

test('resolveAuditTarget requires url for type=url', () => {
  const res = resolveAuditTarget({ type: 'url' });
  assert.equal(res.error.error.code, 'INVALID_TARGET');
});

// ─── Field projection ─────────────────────────────────────────────────────────

test('projectFields keeps only listed fields', () => {
  const out = projectFields({ a: 1, b: 2, c: 3 }, ['a', 'c']);
  assert.deepEqual(out, { a: 1, c: 3 });
});

test('projectFields returns object unchanged if no fields list', () => {
  const obj = { a: 1 };
  assert.equal(projectFields(obj), obj);
  assert.equal(projectFields(obj, []), obj);
});

// ─── Issue filtering ──────────────────────────────────────────────────────────

const sampleIssues = [
  makeIssue({ category: 'seo', severity: 'high', title: 'A' }),
  makeIssue({ category: 'seo', severity: 'low', title: 'B' }),
  makeIssue({ category: 'technical', severity: 'critical', title: 'C' }),
  makeIssue({ category: 'accessibility', severity: 'medium', title: 'D' }),
];

test('applyIssueFilters filters by severityIn', () => {
  const out = applyIssueFilters(sampleIssues, { where: { severityIn: ['critical', 'high'] } });
  assert.equal(out.length, 2);
  // Sorted by severity desc by default
  assert.equal(out[0].severity, 'critical');
});

test('applyIssueFilters filters by category and respects limit', () => {
  const out = applyIssueFilters(sampleIssues, { where: { category: 'seo' }, limit: 1 });
  assert.equal(out.length, 1);
  assert.equal(out[0].category, 'seo');
});

test('applyIssueFilters projects fields when fields list provided', () => {
  const out = applyIssueFilters(sampleIssues, { fields: ['id', 'severity', 'title'] });
  for (const it of out) {
    assert.deepEqual(Object.keys(it).sort(), ['id', 'severity', 'title']);
  }
});

// ─── Scoring ──────────────────────────────────────────────────────────────────

test('scoreAudit penalizes by severity', () => {
  const issuesByCategory = {
    seo: [makeIssue({ category: 'seo', severity: 'high', title: 'a' })],
    technical: [makeIssue({ category: 'technical', severity: 'critical', title: 'b' })],
  };
  const scores = scoreAudit(issuesByCategory);
  assert.equal(scores.seo, 85);
  assert.equal(scores.technical, 70);
  assert.ok(scores.overall >= 0 && scores.overall <= 100);
});

test('gradeForScore returns expected band', () => {
  assert.equal(gradeForScore(95), 'Excellent');
  assert.equal(gradeForScore(80), 'Good');
  assert.equal(gradeForScore(60), 'Needs Work');
  assert.equal(gradeForScore(20), 'Critical');
});

test('buildGrades maps each score to a grade', () => {
  const grades = buildGrades({ overall: 80, seo: 95 });
  assert.deepEqual(grades, { overall: 'Good', seo: 'Excellent' });
});

// ─── Roadmap ──────────────────────────────────────────────────────────────────

test('buildRoadmap buckets issues by priority', () => {
  const issues = [
    makeIssue({ category: 'seo', severity: 'critical', title: 'X' }),
    makeIssue({ category: 'seo', severity: 'medium', title: 'Y' }),
    makeIssue({ category: 'seo', severity: 'low', title: 'Z' }),
  ];
  const roadmap = buildRoadmap(issues, true);
  assert.equal(roadmap.fixToday.length, 1);
  assert.equal(roadmap.fixThisWeek.length, 1);
  assert.equal(roadmap.improveLater.length, 1);
  assert.equal(roadmap.fixToday[0].title, 'X');
});

// ─── Markdown report ──────────────────────────────────────────────────────────

test('buildMarkdownReport includes scores, critical issues, roadmap', () => {
  const issues = [makeIssue({ category: 'seo', severity: 'critical', title: 'Critical SEO issue', impact: 'Bad' })];
  const md = buildMarkdownReport({
    target: { url: 'https://example.com' },
    scores: { overall: 50, seo: 30 },
    grades: { overall: 'Needs Work', seo: 'Critical' },
    issues,
    roadmap: buildRoadmap(issues, true),
    summary: { headline: 'Test', totalIssues: 1 },
  });
  assert.match(md, /# Audit Report — https:\/\/example\.com/);
  assert.match(md, /## Scores/);
  assert.match(md, /Top Critical Issues/);
  assert.match(md, /Critical SEO issue/);
  assert.match(md, /## Roadmap/);
});

test('buildReport supports json + markdown formats', () => {
  const ctx = { target: { url: 'https://e.com' }, scores: { overall: 70 }, grades: {}, issues: [], roadmap: {}, summary: {} };
  const report = buildReport({ formats: ['json', 'markdown'] }, ctx);
  assert.ok(report.json);
  assert.ok(typeof report.markdown === 'string');
});

// ─── Summary ──────────────────────────────────────────────────────────────────

test('buildAuditSummary counts issues by severity and category', () => {
  const issues = [
    makeIssue({ category: 'seo', severity: 'high', title: 'a' }),
    makeIssue({ category: 'seo', severity: 'medium', title: 'b' }),
    makeIssue({ category: 'technical', severity: 'critical', title: 'c' }),
  ];
  const s = buildAuditSummary({ scores: { overall: 70 }, issues, target: { url: 'https://x' } });
  assert.equal(s.totalIssues, 3);
  assert.equal(s.bySeverity.high, 1);
  assert.equal(s.byCategory.seo, 2);
});

// ─── Privacy redaction ────────────────────────────────────────────────────────

test('redactSensitiveData masks sensitive keys at any depth', () => {
  const input = {
    cookie: 'abc',
    nested: { auth_token: 'xyz', value: 'safe', deep: { password: 'p' } },
    headers: { authorization: 'Bearer secret-token', other: 'ok' },
  };
  const out = redactSensitiveData(input);
  assert.equal(out.cookie, '[redacted]');
  assert.equal(out.nested.auth_token, '[redacted]');
  assert.equal(out.nested.value, 'safe');
  assert.equal(out.nested.deep.password, '[redacted]');
  assert.equal(out.headers.authorization, '[redacted]');
});

// ─── Snapshots ────────────────────────────────────────────────────────────────

test('createAuditSnapshot stores and getAuditSnapshot retrieves', () => {
  const snap = createAuditSnapshot({
    target: { url: 'https://e.com' },
    scores: { overall: 80 },
    issues: [makeIssue({ category: 'seo', severity: 'high', title: 'a' })],
  });
  assert.match(snap.auditSnapshotId, /^audit_/);
  const stored = getAuditSnapshot(snap.auditSnapshotId);
  assert.ok(stored);
  assert.equal(stored.compact.scores.overall, 80);
});

test('compareAuditSnapshots reports deltas and new/resolved issues', () => {
  const before = createAuditSnapshot({
    target: { url: 'https://e.com' },
    scores: { overall: 80, seo: 90 },
    issues: [makeIssue({ id: 'issue_a', category: 'seo', severity: 'high', title: 'A' })],
    seo: { title: 'old' },
  });
  const after = createAuditSnapshot({
    target: { url: 'https://e.com' },
    scores: { overall: 70, seo: 75 },
    issues: [makeIssue({ id: 'issue_b', category: 'seo', severity: 'critical', title: 'B' })],
    seo: { title: 'new' },
  });
  const diff = compareAuditSnapshots(before.auditSnapshotId, after.auditSnapshotId);
  assert.equal(diff.ok, true);
  assert.equal(diff.scoreChanges.overall.delta, -10);
  assert.equal(diff.newIssues[0].id, 'issue_b');
  assert.equal(diff.resolvedIssues[0].id, 'issue_a');
  assert.ok(diff.changedModules.includes('seo'));
});

test('compareAuditSnapshots returns SNAPSHOT_NOT_FOUND for missing id', () => {
  const res = compareAuditSnapshots('audit_missing1', 'audit_missing2');
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'SNAPSHOT_NOT_FOUND');
});

// ─── Module runners (pure / safe with no rpc) ────────────────────────────────

test('runSeoAudit produces missing-meta issues when metadata is empty', async () => {
  const out = await runSeoAudit({ raw: { url: 'https://e.com', metadata: {}, headings: [], images: [], links: [] } }, true);
  const titles = out.issues.map((it) => it.title);
  assert.ok(titles.some((t) => /Missing <title>/.test(t)));
  assert.ok(titles.some((t) => /Missing meta description/.test(t)));
});

test('runSeoAudit emits a fixSuggestion with example for meta description', async () => {
  const out = await runSeoAudit({ raw: { url: 'https://e.com', metadata: {}, headings: [], images: [], links: [] } }, true);
  const desc = out.issues.find((it) => /meta description/i.test(it.title));
  assert.ok(desc.fixSuggestion.example.includes('<meta name="description"'));
});

test('runTechnicalAudit emits broken link issues from page checks', async () => {
  const fakeRpc = {
    send: async (method) => {
      if (method === 'page.checkBrokenImages') return { ok: true, data: { broken: [{ src: 'https://e.com/missing.png' }] } };
      if (method === 'page.checkLinks') return { ok: true, data: { broken: [{ href: 'https://e.com/missing' }] } };
      return { ok: true, data: {} };
    },
  };
  const out = await runTechnicalAudit({
    rpcClient: fakeRpc,
    tabId: 'tab1',
    raw: { url: 'https://e.com' },
    network: { requests: [] },
    consoleData: { entries: [] },
    origin: 'https://e.com',
  }, true);
  const titles = out.issues.map((it) => it.title);
  assert.ok(titles.includes('Broken image'));
  assert.ok(titles.includes('Broken link'));
});

test('runStructuredDataAudit detects schema content mismatch', async () => {
  const raw = {
    url: 'https://e.com',
    title: 'My Chrome Extension',
    metadata: { title: 'My Chrome Extension' },
    jsonLd: [{ schemaType: 'SoftwareApplication', name: 'Totally Different Product', valid: true }],
  };
  const out = await runStructuredDataAudit({ raw }, true);
  assert.ok(out.data.contentMismatch.length > 0);
  assert.ok(out.issues.some((it) => /mismatched JSON-LD/i.test(it.title)));
});

// ─── End-to-end handler smoke tests (no rpcClient) ────────────────────────────

test('handleQueryAudit runs quick_audit preset without an rpc client', async () => {
  const res = await handleQueryAudit({ preset: 'quick_audit', target: { type: 'url', url: 'https://example.com' } }, {});
  assert.equal(res.ok, true);
  assert.equal(res.schemaVersion, 'audit.query.v1');
  assert.ok(res.auditId.startsWith('audit_'));
  assert.ok(res.scores);
  assert.ok(res.summary);
});

test('handleQueryAudit runs chrome_extension_landing_audit preset', async () => {
  const res = await handleQueryAudit({ preset: 'chrome_extension_landing_audit', target: { type: 'url', url: 'https://example.com' } }, {});
  assert.equal(res.ok, true);
  assert.ok(res.scores);
  assert.ok(res.report);
  assert.ok(res.report.json);
  assert.ok(typeof res.report.markdown === 'string');
  assert.ok(res.snapshot);
  assert.ok(res.snapshot.auditSnapshotId.startsWith('audit_'));
});

test('handleQueryAudit runs custom query with only seo + scores + issues', async () => {
  const res = await handleQueryAudit({
    target: { type: 'url', url: 'https://example.com' },
    query: {
      seo: { fields: ['title', 'description', 'canonical'], includeIssues: true },
      scores: { include: ['seo'] },
      issues: { where: { category: 'seo' }, fields: ['id', 'severity', 'title'], limit: 10 },
      summary: true,
    },
  }, {});
  assert.equal(res.ok, true);
  assert.ok(res.seo);
  assert.deepEqual(Object.keys(res.scores), ['seo']);
  for (const it of res.issues) assert.deepEqual(Object.keys(it).sort(), ['id', 'severity', 'title']);
});

test('handleQueryAudit rejects unknown preset', async () => {
  const res = await handleQueryAudit({ preset: 'not_a_preset', target: { type: 'url', url: 'https://e.com' } }, {});
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'INVALID_PRESET');
});

test('handleQueryAudit rejects invalid field in custom query', async () => {
  const res = await handleQueryAudit({
    target: { type: 'url', url: 'https://e.com' },
    query: { technical: { fields: ['cookies'] } },
  }, {});
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'INVALID_FIELD');
});

test('handleQueryAudit rejects invalid target type', async () => {
  const res = await handleQueryAudit({ target: { type: 'ftp' } }, {});
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'INVALID_TARGET');
});

test('handleQueryAudit honours crawl maxPages limit at validation', async () => {
  const res = await handleQueryAudit({
    target: { type: 'url', url: 'https://e.com' },
    query: { crawl: { enabled: true, maxPages: 5000 } },
  }, {});
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'INVALID_LIMIT');
});

test('handleCompareAuditSnapshots requires both ids', async () => {
  const res = await handleCompareAuditSnapshots({ beforeSnapshotId: 'audit_a' });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'INVALID_FIELD');
});

// ─── Issue normalization ──────────────────────────────────────────────────────

test('normalizeIssues dedupes by id', () => {
  const a = makeIssue({ category: 'seo', severity: 'high', title: 'Same', evidence: { selector: 'h1' } });
  const b = makeIssue({ category: 'seo', severity: 'high', title: 'Same', evidence: { selector: 'h1' } });
  const out = normalizeIssues([a, b]);
  assert.equal(out.length, 1);
});

test('SEVERITIES contains the expected severity set', () => {
  assert.deepEqual(SEVERITIES, ['critical', 'high', 'medium', 'low', 'info']);
});
