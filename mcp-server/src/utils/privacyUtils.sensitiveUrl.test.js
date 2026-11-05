import test from 'node:test';
import assert from 'node:assert/strict';
import { isSensitiveUrl, redactSensitiveTabData } from './privacyUtils.js';
import { buildSourceBlock } from './sourceBlock.js';

const SENSITIVE = [
  ['OAuth callback code', 'https://app.example.com/cb?code=abc123&state=xyz'],
  ['access token in the query', 'https://app.example.com/home?access_token=abc'],
  ['later parameter', 'https://app.example.com/home?tab=1&refresh_token=abc'],
  ['implicit-flow fragment', 'https://app.example.com/cb#access_token=abc&expires_in=3600'],
  ['SPA route fragment', 'https://app.example.com/#/cb?id_token=abc'],
  ['API key', 'https://api.example.com/v1/items?api_key=abc'],
  ['dashed name', 'https://api.example.com/v1/items?api-key=abc'],
  ['mixed case name', 'https://api.example.com/v1/items?ACCESS_TOKEN=abc'],
  ['percent-encoded name', 'https://api.example.com/v1/items?access%5Ftoken=abc'],
  ['custom token suffix', 'https://app.example.com/invite?invite_token=abc'],
  ['signed S3 URL', 'https://b.s3.amazonaws.com/f?X-Amz-Signature=abc&X-Amz-Expires=60'],
  ['signed GCS URL', 'https://storage.googleapis.com/b/f?X-Goog-Signature=abc'],
  ['URL credentials', 'https://user:hunter2@example.com/'],
  ['JWT under any name', 'https://app.example.com/x?v=eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.c2lnbmF0dXJlMTIz'],
  ['existing path rule', 'https://example.com/login'],
];

const NOT_SENSITIVE = [
  ['plain page', 'https://example.com/docs/intro'],
  ['ordinary query', 'https://example.com/search?q=token&page=2&sort=new'],
  ['value naming a secret', 'https://example.com/search?q=access_token'],
  ['empty credential value', 'https://example.com/page?token='],
  ['similar name', 'https://example.com/page?zipcode=94103&barcode=1'],
  ['token-like word in a name', 'https://example.com/page?tokens_used=5'],
  ['YouTube watch page', 'https://www.youtube.com/watch?v=98WtmW-lfeE&list=RDMB3VkzPdgLA&index=5'],
  ['section fragment', 'https://example.com/docs#code'],
  ['at sign in the path', 'https://www.npmjs.com/package/@scope/name'],
  ['at sign in the query', 'https://example.com/?u=a@b.com'],
  ['data URL', 'data:text/plain,hello?token=abc'],
];

for (const [name, url] of SENSITIVE) {
  test(`isSensitiveUrl matches: ${name}`, () => assert.equal(isSensitiveUrl(url), true, url));
}

for (const [name, url] of NOT_SENSITIVE) {
  test(`isSensitiveUrl ignores: ${name}`, () => assert.equal(isSensitiveUrl(url), false, url));
}

test('isSensitiveUrl tolerates non-strings and malformed encoding', () => {
  for (const value of [null, undefined, 42, {}]) assert.equal(isSensitiveUrl(value), false);
  assert.equal(isSensitiveUrl('https://example.com/?%E0%A4%A=1'), false);
});

test('a tab with a credential in its query string is redacted, and the opt-out still works', () => {
  const tab = { id: 1, url: 'https://app.example.com/cb?code=abc', title: 'Finishing sign-in' };
  assert.deepEqual(redactSensitiveTabData(tab), { ...tab, url: 'redacted', title: 'redacted', sensitive: true });
  assert.equal(redactSensitiveTabData(tab, false), tab);
});

test('_source hides a credential in the query string', () => {
  const url = 'https://app.example.com/cb?access_token=supersecret';
  const block = buildSourceBlock({ tool: 't', timestamp: 'now', params: { url }, result: {}, activeTab: { id: 1, url, title: 'x' } });
  assert.equal(block.active_url, 'redacted');
  assert.equal(block.data_from_url, 'redacted');
  assert.equal(block.same_origin, null);
  assert.equal(JSON.stringify(block).includes('supersecret'), false);
});
