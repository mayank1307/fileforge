import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceBlock } from './sourceBlock.js';

const OAUTH_URL = 'https://accounts.google.com/signin/oauth/consent?client_id=abc123&state=secret-state&login_hint=someone%40example.com';
const OAUTH_TAB = { id: 7, url: OAUTH_URL, title: 'Sign in - someone@example.com', status: 'complete' };
const DOCS_TAB = { id: 8, url: 'https://example.com/docs/intro?page=2', title: 'Intro - Docs' };

function build(overrides = {}) {
  return buildSourceBlock({ tool: 'fileforge_x_action', timestamp: 't', params: {}, result: {}, activeTab: DOCS_TAB, ...overrides });
}

test('_source redacts a sensitive active tab', () => {
  const source = build({ activeTab: OAUTH_TAB });
  assert.equal(source.active_url, 'redacted');
  assert.equal(source.active_tab_title, 'redacted');
  assert.equal(source.active_tab_id, '7');
  assert.equal(source.bridge_connected, true);
  const text = JSON.stringify(source);
  for (const leak of ['accounts.google.com', 'secret-state', 'someone']) assert.equal(text.includes(leak), false, leak);
});

test('_source reports a non-sensitive active tab normally', () => {
  const source = build({ result: { meta: { url: 'https://example.com/other' } } });
  assert.equal(source.active_url, DOCS_TAB.url);
  assert.equal(source.active_tab_title, DOCS_TAB.title);
  assert.equal(source.data_from_url, 'https://example.com/other');
  assert.equal(source.same_origin, true);
});

test('_source redacts a sensitive data_from_url from the result or the params', () => {
  assert.equal(build({ result: { meta: { url: OAUTH_URL } } }).data_from_url, 'redacted');
  assert.equal(build({ params: { url: OAUTH_URL } }).data_from_url, 'redacted');
});

test('_source same_origin does not reveal the origin of a redacted URL', () => {
  const dataOnPublicPage = { result: { meta: { url: 'https://accounts.google.com/about' } } };
  assert.equal(build({ activeTab: OAUTH_TAB, ...dataOnPublicPage }).same_origin, null);
  assert.equal(build({ params: { url: OAUTH_URL } }).same_origin, null);
});

test('_source handles a disconnected bridge', () => {
  const source = build({ activeTab: null });
  assert.equal(source.active_url, null);
  assert.equal(source.active_tab_title, null);
  assert.equal(source.active_tab_id, null);
  assert.equal(source.same_origin, null);
  assert.equal(source.bridge_connected, false);
});
