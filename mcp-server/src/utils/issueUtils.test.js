import test from 'node:test';
import assert from 'node:assert/strict';
import { collectIssuesFromData, formIssues, issuesFromContext, summarizeIssues, validateIssue } from './issueUtils.js';

test('maps browser context findings into normalized issues', () => {
  const issues = issuesFromContext({
    route: { route: { href: 'https://example.com/' } },
    console: { entries: [{ level: 'error', text: 'Hydration failed' }] },
    jsErrors: { errors: [{ exception: { description: 'TypeError: boom' } }] },
    network: { requests: [{ url: 'https://example.com/app.js', method: 'GET', response: { status: 404 } }] },
    apiResponses: { responses: [{ url: 'https://example.com/api', method: 'POST', response: { status: 500 } }] },
    a11y: { contrastIssues: [{ selector: 'button', issue: 'foreground equals background' }] },
    responsive: { overflow: [{ tag: 'main', right: 420, bodyWidth: 390 }], overlaps: [{ a: { tag: 'h1' }, b: { tag: 'button' } }] },
    forms: { forms: [{ fields: [{ tag: 'input', type: 'email', required: true, selector: '#email' }] }] },
  });

  assert.equal(issues.length, 8);
  assert.deepEqual(new Set(issues.map((issue) => issue.severity)), new Set(['high', 'medium']));
  for (const item of issues) assert.equal(validateIssue(item).ok, true);
});

test('summarizes normalized issues by severity and dimension', () => {
  const issues = issuesFromContext({
    console: { entries: [{ level: 'warning', text: 'Deprecated API' }] },
    network: { requests: [{ url: 'https://example.com/missing.css', method: 'GET', response: { status: 404 } }] },
  });
  const summary = summarizeIssues(issues, { routes: 1 });

  assert.equal(summary.ok, true);
  assert.equal(summary.counts.routes, 1);
  assert.equal(summary.counts.totalIssues, 2);
  assert.equal(summary.counts.bySeverity.medium, 2);
  assert.equal(summary.counts.byDimension.developer, 1);
  assert.equal(summary.counts.byDimension.reliability, 1);
  assert.equal(summary.topIssues.length, 2);
});

test('downgrades blocked analytics failures as low priority', () => {
  const issues = issuesFromContext({
    network: {
      requests: [{
        url: 'https://www.google-analytics.com/g/collect',
        method: 'GET',
        type: 'Fetch',
        failed: { errorText: 'net::ERR_BLOCKED_BY_CLIENT' },
      }],
    },
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'low');
  assert.match(issues[0].impact, /Analytics or ad/);
});

test('creates normalized form issues', () => {
  const issues = formIssues([{ fields: [{ required: true, selector: '#name', placeholder: 'Name' }] }], 'https://example.com/form');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'forms.required-field-unstable-name');
  assert.equal(issues[0].evidence[0].url, 'https://example.com/form');
  assert.equal(validateIssue(issues[0]).ok, true);
});

test('collects normalized issues from nested result data', () => {
  const [issue] = issuesFromContext({
    console: { entries: [{ level: 'error', text: 'Hydration failed' }] },
  }, { url: 'https://example.com/' });

  const collected = collectIssuesFromData({
    summary: { topIssues: [issue] },
    checks: [{ issues: [issue] }],
    unrelated: [{ issue }],
  });

  assert.equal(collected.length, 1);
  assert.equal(collected[0].id, issue.id);
});
