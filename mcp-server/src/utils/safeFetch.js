import dns from 'dns';
import http from 'http';
import https from 'https';
import { BlockList, isIP } from 'net';
import { pipeline } from 'stream';
import zlib from 'zlib';

export const ALLOWED_FETCH_HOSTS_ENV = 'FILEFORGE_ALLOWED_FETCH_HOSTS';

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 30000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// Loopback, private, link-local (including cloud metadata), carrier-grade NAT, reserved and multicast ranges. BlockList
// also matches IPv4-mapped IPv6 addresses such as ::ffff:127.0.0.1 against the IPv4 rules. The IPv6 transition ranges
// are blocked because they can embed an IPv4 address.
const BLOCKED_ADDRESSES = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) BLOCKED_ADDRESSES.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::', 96], ['64:ff9b::', 96], ['100::', 64], ['2001::', 32], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7],
  ['fe80::', 10], ['ff00::', 8],
]) BLOCKED_ADDRESSES.addSubnet(network, prefix, 'ipv6');

export function isBlockedAddress(rawAddress) {
  const address = String(rawAddress).split('%')[0];
  const family = isIP(address);
  if (!family) return true;
  return BLOCKED_ADDRESSES.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

function notAllowed(url) {
  const error = new Error(`Can't fetch ${url}: it is a local or private address, or not http(s). The user can allow a host with ${ALLOWED_FETCH_HOSTS_ENV}.`);
  error.code = 'URL_NOT_ALLOWED';
  return error;
}

function isAllowedHost(url) {
  const allowed = (process.env[ALLOWED_FETCH_HOSTS_ENV] ?? '').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  return allowed.includes(url.hostname) || allowed.includes(`${url.hostname}:${port}`);
}

// Runs when the socket connects, so the address checked is the address used. Checking the name beforehand would miss a
// DNS record that changes between the check and the connection. One blocked address blocks the host.
function guardedLookup(url) {
  return (hostname, options, callback) => {
    dns.lookup(hostname, options, (err, address, family) => {
      if (err) return callback(err);
      const addresses = Array.isArray(address) ? address : [{ address }];
      if (addresses.some((entry) => isBlockedAddress(entry.address))) return callback(notAllowed(url));
      return callback(null, address, family);
    });
  };
}

function decoded(response) {
  const encoding = String(response.headers['content-encoding'] ?? '').toLowerCase();
  const decoder = { gzip: zlib.createGunzip, 'x-gzip': zlib.createGunzip, deflate: zlib.createInflate, br: zlib.createBrotliDecompress }[encoding];
  return decoder ? pipeline(response, decoder(), () => {}) : response;
}

function requestOnce(url) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return Promise.reject(notAllowed(url));
  if (url.username || url.password) return Promise.reject(notAllowed(url));
  const allowed = isAllowedHost(url);
  // Connecting to an IP address skips the lookup, so literals are checked here. URL has already normalized forms such
  // as 2130706433 and 0x7f.1 to 127.0.0.1.
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!allowed && isIP(hostname) && isBlockedAddress(hostname)) return Promise.reject(notAllowed(url));

  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(url, {
      method: 'GET',
      agent: false,
      headers: { accept: '*/*', 'accept-encoding': 'gzip, deflate, br', 'user-agent': 'FileForge' },
      ...(allowed ? {} : { lookup: guardedLookup(url) }),
    }, resolve);
    request.setTimeout(TIMEOUT_MS, () => request.destroy(new Error(`Timed out fetching ${url}`)));
    request.on('error', reject);
    request.end();
  });
}

function readBody(response) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const body = decoded(response);
    body.on('data', (chunk) => chunks.push(chunk));
    body.on('end', () => resolve(Buffer.concat(chunks)));
    body.on('error', reject);
  });
}

// Fetches a URL from the server process. Redirects are followed by hand so that each hop gets the same checks.
export async function safeFetch(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw notAllowed(input);
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await requestOnce(url);
    const location = response.headers.location;
    if (!REDIRECT_STATUSES.has(response.statusCode) || !location) {
      const status = response.statusCode;
      return {
        buffer: await readBody(response),
        url: url.href,
        status,
        ok: status >= 200 && status < 300,
        contentType: response.headers['content-type'],
      };
    }
    response.resume();
    url = new URL(location, url);
  }
  const error = new Error(`Too many redirects fetching ${input}.`);
  error.code = 'TOO_MANY_REDIRECTS';
  throw error;
}
