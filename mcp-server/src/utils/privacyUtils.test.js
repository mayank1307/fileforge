import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeForLog, sanitizeHar, summarizeHar, redactedFinding, revealScopedValue, secretRevealBlocked } from './privacyUtils.js';

test('sanitizeForLog replaces data URLs and secret-looking values', () => {
  const result = sanitizeForLog({
    screenshot: 'data:image/png;base64,abcdef',
    authorization: 'Bearer abcdefghijklmnopqrstuvwxyz',
  });
  assert.match(result.screenshot, /^\[DATA_URL:image\/png:/);
  assert.equal(result.authorization.includes('abcdefghijklmnopqrstuvwxyz'), false);
});

test('sanitizeHar redacts sensitive headers and summarizes entries', () => {
  const har = {
    log: {
      entries: [{
        request: {
          url: 'https://example.com/api',
          headers: [{ name: 'Authorization', value: 'Bearer abcdefghijklmnopqrstuvwxyz' }],
        },
        response: {
          status: 200,
          headers: [{ name: 'content-type', value: 'application/json' }],
          content: { size: 42, text: '{"ok":true}' },
        },
      }],
    },
  };
  const sanitized = sanitizeHar(har);
  assert.equal(sanitized.log.entries[0].request.headers[0].value.includes('abcdefghijklmnopqrstuvwxyz'), false);
  assert.deepEqual(summarizeHar(sanitized).domains[0], { domain: 'example.com', requests: 1 });
});

test('redacted findings can reveal only scoped matching values', () => {
  const finding = redactedFinding({ namespace: 'localStorage', key: 'token', value: 'secret-token-value' });
  assert.equal(finding.value, '[REDACTED]');
  assert.equal(finding.canReveal, true);

  const revealed = revealScopedValue([
    { namespace: 'localStorage', key: 'token', value: 'secret-token-value', location: 'localStorage.token' },
  ], { location: 'localStorage.token' });
  assert.equal(revealed.ok, true);
  assert.equal(revealed.data.value, 'secret-token-value');
});

test('secretRevealBlocked refuses unless FILEFORGE_ALLOW_SECRET_REVEAL=1', () => {
  const blocked = secretRevealBlocked('fileforge_example', {});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error.code, 'SECRET_REVEAL_DISABLED');
  assert.equal(blocked.meta.tool, 'fileforge_example');
  assert.notEqual(secretRevealBlocked('fileforge_example', { FILEFORGE_ALLOW_SECRET_REVEAL: 'true' }), null);
  assert.equal(secretRevealBlocked('fileforge_example', { FILEFORGE_ALLOW_SECRET_REVEAL: '1' }), null);
});
