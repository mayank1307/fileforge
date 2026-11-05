const EXPLICIT_SCHEME_WITH_SLASHES = /^[a-z][a-z0-9+.-]*:\/\//i;
const KNOWN_SCHEME_WITHOUT_SLASHES = /^(about|blob|data|mailto|tel):/i;
const DISALLOWED_SCHEME = /^javascript:/i;

const RPC_URL_FIELDS = new Map([
  ['browser.navigate', ['url']],
  ['browser.openUrl', ['url']],
  ['browser.navigateUrl', ['url']],
  ['scrape.urls', ['urls']],
  ['scrape.crawlSite', ['url']],
  ['scrape.analyzeSite', ['url']],
  ['scrape.extractResource', ['url']],
  ['responsive.scanLayout', ['url']],
  ['responsive.captureMatrix', ['url']],
]);

export class InvalidUrlError extends Error {
  constructor(input, reason = 'Invalid URL') {
    super(`${reason}: ${String(input)}`);
    this.name = 'InvalidUrlError';
    this.code = 'INVALID_URL';
    this.details = { input };
  }
}

function authorityFromBareUrl(value) {
  const withoutProtocolRelative = value.startsWith('//') ? value.slice(2) : value;
  const end = withoutProtocolRelative.search(/[/?#]/);
  return end === -1 ? withoutProtocolRelative : withoutProtocolRelative.slice(0, end);
}

function hostFromAuthority(authority) {
  const withoutAuth = authority.split('@').pop() ?? authority;
  if (withoutAuth.startsWith('[')) {
    const end = withoutAuth.indexOf(']');
    return end === -1 ? withoutAuth : withoutAuth.slice(0, end + 1);
  }
  return withoutAuth.replace(/:\d+$/, '');
}

function isPrivateIpv4(host) {
  const parts = host.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 10
    || a === 127
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 0 && b === 0 && parts[2] === 0 && parts[3] === 0);
}

function isLocalAuthority(authority) {
  const host = hostFromAuthority(authority).toLowerCase();
  return host === 'localhost'
    || host.endsWith('.localhost')
    || host === '[::1]'
    || host === '::1'
    || isPrivateIpv4(host);
}

function candidateUrl(value, { defaultProtocol = 'https:', localProtocol = 'http:' } = {}) {
  if (DISALLOWED_SCHEME.test(value)) throw new InvalidUrlError(value, 'Disallowed URL scheme');
  if (value.startsWith('//')) return `${defaultProtocol}${value}`;
  if (EXPLICIT_SCHEME_WITH_SLASHES.test(value) || KNOWN_SCHEME_WITHOUT_SLASHES.test(value)) return value;

  const authority = authorityFromBareUrl(value);
  const protocol = isLocalAuthority(authority) ? localProtocol : defaultProtocol;
  return `${protocol}//${value}`;
}

export function normalizeUrl(input, options = {}) {
  if (typeof input !== 'string') throw new InvalidUrlError(input, 'URL must be a string');
  const trimmed = input.trim();
  if (!trimmed) throw new InvalidUrlError(input, 'URL is required');

  const candidate = candidateUrl(trimmed, options);
  try {
    return new URL(candidate).toString();
  } catch {
    throw new InvalidUrlError(input);
  }
}

export function resolveUrl(input, baseUrl, options = {}) {
  try {
    const normalizedBase = normalizeUrl(baseUrl, options);
    return new URL(input, normalizedBase).toString();
  } catch (err) {
    if (err?.code === 'INVALID_URL') throw err;
    throw new InvalidUrlError(input);
  }
}

export function normalizeRpcUrlParams(method, params = {}) {
  const fields = RPC_URL_FIELDS.get(method);
  if (!fields) return params;

  let next = params;
  const setField = (field, value) => {
    if (next === params) next = { ...params };
    next[field] = value;
  };

  for (const field of fields) {
    const value = params[field];
    if (typeof value === 'string') setField(field, normalizeUrl(value));
    else if (Array.isArray(value)) setField(field, value.map((item) => (typeof item === 'string' ? normalizeUrl(item) : item)));
  }

  return next;
}
