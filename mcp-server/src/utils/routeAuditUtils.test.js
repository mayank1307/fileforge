import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverRoutesFromPages, summarizeRouteChecks } from './routeAuditUtils.js';

test('discovers and classifies routes from page links', () => {
  const discovered = discoverRoutesFromPages([
    {
      url: 'https://example.com/',
      pageLinks: [
        { href: '/pricing', text: 'Pricing' },
        { href: 'mailto:hi@example.com' },
        { href: 'https://cdn.example.com/app.js' },
        { href: 'http://[bad' },
      ],
    },
  ], 'https://example.com/');

  assert.equal(discovered.routes.includes('https://example.com/pricing'), true);
  assert.equal(discovered.links.some((link) => link.kind === 'mailto'), true);
  assert.equal(discovered.links.some((link) => link.kind === 'asset'), true);
  assert.equal(discovered.links.some((link) => link.kind === 'invalid'), true);
});

test('summarizes broken routes and duplicate metadata', () => {
  const audit = summarizeRouteChecks({
    baseUrl: 'https://example.com/',
    pages: [
      { url: 'https://example.com/a', metadata: { title: 'Same' } },
      { url: 'https://example.com/b', metadata: { title: 'Same' } },
    ],
    checks: [{ url: 'https://example.com/missing', status: 404 }],
    links: [{ kind: 'invalid', sourceUrl: 'https://example.com/', href: 'bad href' }],
  });

  assert.equal(audit.summary.brokenLinks, 1);
  assert.equal(audit.summary.duplicateMetaTitles, 1);
  assert.equal(audit.issues.some((issue) => issue.type === 'route.invalid-link'), true);
});
