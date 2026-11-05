import test from 'node:test';
import assert from 'node:assert/strict';
import { InvalidUrlError, normalizeRpcUrlParams, normalizeUrl, resolveUrl } from './urlUtils.js';

test('normalizes equivalent HTTPS domain inputs', () => {
  assert.equal(normalizeUrl('app.example.com'), 'https://app.example.com/');
  assert.equal(normalizeUrl('https://app.example.com'), 'https://app.example.com/');
  assert.equal(normalizeUrl('https://app.example.com/'), 'https://app.example.com/');
});

test('preserves explicit paths, query strings, and hashes', () => {
  assert.equal(
    normalizeUrl('example.com/path/to/page?mode=demo#faq'),
    'https://example.com/path/to/page?mode=demo#faq'
  );
});

test('uses HTTP for local development hosts', () => {
  assert.equal(normalizeUrl('localhost:3000'), 'http://localhost:3000/');
  assert.equal(normalizeUrl('127.0.0.1:5173/app'), 'http://127.0.0.1:5173/app');
  assert.equal(normalizeUrl('192.168.1.10:8080'), 'http://192.168.1.10:8080/');
});

test('preserves supported explicit schemes', () => {
  assert.equal(normalizeUrl('about:blank'), 'about:blank');
  assert.equal(normalizeUrl('file:///tmp/example.html'), 'file:///tmp/example.html');
  assert.equal(normalizeUrl('chrome-extension://abcdef/index.html'), 'chrome-extension://abcdef/index.html');
});

test('normalizes protocol-relative URLs', () => {
  assert.equal(normalizeUrl('//example.com/assets/app.js'), 'https://example.com/assets/app.js');
});

test('rejects invalid or unsafe URLs with INVALID_URL details', () => {
  assert.throws(() => normalizeUrl('not a url'), InvalidUrlError);
  assert.throws(() => normalizeUrl('javascript:alert(1)'), (err) => {
    assert.equal(err.code, 'INVALID_URL');
    assert.deepEqual(err.details, { input: 'javascript:alert(1)' });
    return true;
  });
});

test('resolves routes against normalized base URLs', () => {
  assert.equal(resolveUrl('/pricing', 'app.example.com'), 'https://app.example.com/pricing');
  assert.equal(resolveUrl('settings', 'localhost:3000/app/'), 'http://localhost:3000/app/settings');
});

test('normalizes URL-bearing RPC params without mutating unrelated calls', () => {
  const browserParams = { url: 'app.example.com', active: true };
  assert.deepEqual(normalizeRpcUrlParams('browser.navigate', browserParams), {
    url: 'https://app.example.com/',
    active: true,
  });
  assert.deepEqual(normalizeRpcUrlParams('browser.openUrl', browserParams), {
    url: 'https://app.example.com/',
    active: true,
  });
  assert.deepEqual(browserParams, { url: 'app.example.com', active: true });

  assert.deepEqual(normalizeRpcUrlParams('scrape.urls', { urls: ['example.com', 'localhost:3000'] }), {
    urls: ['https://example.com/', 'http://localhost:3000/'],
  });

  const pageParams = { tabId: 'active' };
  assert.equal(normalizeRpcUrlParams('page.getText', pageParams), pageParams);
});
