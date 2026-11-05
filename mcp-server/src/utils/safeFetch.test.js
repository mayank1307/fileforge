import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const home = mkdtempSync(join(tmpdir(), 'fileforge-fetch-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
const { ALLOWED_FETCH_HOSTS_ENV, isBlockedAddress, safeFetch } = await import('./safeFetch.js');
const { registry } = await import('../registry.js');
await import('../tools/files.js');

const denied = { code: 'URL_NOT_ALLOWED' };
let server;
let port;
let hits = 0;

before(async () => {
  server = createServer((req, res) => {
    hits += 1;
    if (req.url === '/hello') return res.writeHead(200, { 'content-type': 'text/plain' }).end('hello');
    if (req.url === '/gzip') return res.writeHead(200, { 'content-encoding': 'gzip' }).end(gzipSync('zipped'));
    if (req.url === '/missing') return res.writeHead(404).end('nope');
    if (req.url === '/relative') return res.writeHead(302, { location: '/hello' }).end();
    if (req.url === '/loop') return res.writeHead(302, { location: '/loop' }).end();
    if (req.url === '/to-private') return res.writeHead(302, { location: `http://127.0.0.2:${port}/hello` }).end();
    if (req.url === '/to-metadata') return res.writeHead(307, { location: 'http://169.254.169.254/latest/meta-data/' }).end();
    if (req.url === '/to-file') return res.writeHead(302, { location: 'file:///etc/passwd' }).end();
    return res.writeHead(500).end();
  });
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  port = server.address().port;
});
after(() => server.close());

function withAllowed(value, fn) {
  const previous = process.env[ALLOWED_FETCH_HOSTS_ENV];
  if (value === undefined) delete process.env[ALLOWED_FETCH_HOSTS_ENV];
  else process.env[ALLOWED_FETCH_HOSTS_ENV] = value;
  return Promise.resolve().then(fn).finally(() => {
    if (previous === undefined) delete process.env[ALLOWED_FETCH_HOSTS_ENV];
    else process.env[ALLOWED_FETCH_HOSTS_ENV] = previous;
  });
}

test('private, reserved and mapped addresses are blocked', () => {
  for (const address of [
    '127.0.0.1', '127.8.8.8', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fe80::1%lo0', 'fc00::1', 'fd12:3456::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:169.254.169.254', '64:ff9b::7f00:1', '2002:7f00:1::', 'not-an-ip',
  ]) assert.equal(isBlockedAddress(address), true, address);
});

test('public addresses are not blocked', () => {
  for (const address of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '11.0.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isBlockedAddress(address), false, address);
  }
});

test('local and metadata URLs are refused without touching the network', async () => {
  await withAllowed(undefined, async () => {
    const before = hits;
    const urls = [
      `http://127.0.0.1:${port}/hello`, `http://[::1]:${port}/hello`, `http://[::ffff:127.0.0.1]:${port}/hello`,
      `http://2130706433:${port}/hello`, `http://0x7f.0.0.1:${port}/hello`, `http://127.1:${port}/hello`,
      'http://169.254.169.254/latest/meta-data/', 'https://10.0.0.1/', 'ftp://example.com/x', 'not a url',
      `http://user:pass@127.0.0.1:${port}/hello`,
    ];
    for (const url of urls) await assert.rejects(safeFetch(url), denied, url);
    assert.equal(hits, before);
  });
});

test('a name that resolves to a local address is refused', async () => {
  await withAllowed(undefined, async () => {
    const before = hits;
    await assert.rejects(safeFetch(`http://localhost:${port}/hello`), denied);
    assert.equal(hits, before);
  });
});

test('one private address among a name\'s records blocks the host', async (t) => {
  t.mock.method(dns, 'lookup', (hostname, options, callback) => {
    callback(null, options.all ? [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }] : '127.0.0.1', 4);
  });
  await withAllowed(undefined, () => assert.rejects(safeFetch(`http://rebinding.example:${port}/hello`), denied));
});

test('an allowed host can be fetched, by name or by name and port', async () => {
  for (const entry of ['127.0.0.1', `127.0.0.1:${port}`, ` other.example , 127.0.0.1 `]) {
    await withAllowed(entry, async () => {
      const result = await safeFetch(`http://127.0.0.1:${port}/hello`);
      assert.equal(result.buffer.toString(), 'hello');
      assert.equal(result.status, 200);
      assert.equal(result.ok, true);
      assert.equal(result.contentType, 'text/plain');
    });
  }
});

test('an entry for another port does not allow the host', async () => {
  await withAllowed(`127.0.0.1:${port + 1}`, () => assert.rejects(safeFetch(`http://127.0.0.1:${port}/hello`), denied));
});

test('compressed bodies are decoded and error statuses still return', async () => {
  await withAllowed('127.0.0.1', async () => {
    assert.equal((await safeFetch(`http://127.0.0.1:${port}/gzip`)).buffer.toString(), 'zipped');
    const missing = await safeFetch(`http://127.0.0.1:${port}/missing`);
    assert.equal(missing.status, 404);
    assert.equal(missing.ok, false);
  });
});

test('redirects are followed, and each hop is checked', async () => {
  await withAllowed('127.0.0.1', async () => {
    const followed = await safeFetch(`http://127.0.0.1:${port}/relative`);
    assert.equal(followed.buffer.toString(), 'hello');
    assert.equal(followed.url, `http://127.0.0.1:${port}/hello`);
    await assert.rejects(safeFetch(`http://127.0.0.1:${port}/to-private`), denied);
    await assert.rejects(safeFetch(`http://127.0.0.1:${port}/to-metadata`), denied);
    await assert.rejects(safeFetch(`http://127.0.0.1:${port}/to-file`), denied);
    await assert.rejects(safeFetch(`http://127.0.0.1:${port}/loop`), { code: 'TOO_MANY_REDIRECTS' });
  });
});

test('every fetching action returns URL_NOT_ALLOWED through the tool', async () => {
  await withAllowed(undefined, async () => {
    for (const action of ['extract_text', 'fetch_resource', 'parse_resource', 'convert']) {
      const result = await registry.call('fileforge_file_action', { action, url: 'http://169.254.169.254/', to: 'json' }, {});
      assert.equal(result.ok, false, action);
      assert.equal(result.error.code, 'URL_NOT_ALLOWED', action);
    }
  });
});

test('an allowed fetch still works through the tool', async () => {
  await withAllowed('127.0.0.1', async () => {
    const result = await registry.call('fileforge_file_action', { action: 'parse_resource', url: `http://127.0.0.1:${port}/hello`, format: 'text', store: false }, {});
    assert.equal(result.ok, true, JSON.stringify(result.error));
  });
});
